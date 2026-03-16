-- ═══════════════════════════════════════════════════════════════
-- 🚀 SOLUTION 5: Queue System for Horizontal Scaling
-- ═══════════════════════════════════════════════════════════════
-- Problem: No horizontal scaling, single instance bottleneck
-- Risk: Performance degradation with high load
-- Solution: Job queue system for async processing
-- ═══════════════════════════════════════════════════════════════

-- Step 1: Create job queue table
CREATE TABLE IF NOT EXISTS job_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type TEXT NOT NULL, -- 'commission_calculation', 'security_scan', 'pdf_generation', 'email_send'
    priority INTEGER DEFAULT 0, -- Higher number = higher priority
    payload JSONB NOT NULL,
    status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed', 'cancelled'
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    error_message TEXT,
    error_stack TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    processing_time_ms INTEGER,
    worker_id TEXT, -- ID of worker processing the job
    scheduled_for TIMESTAMPTZ DEFAULT NOW(), -- For delayed jobs
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient queue processing
CREATE INDEX IF NOT EXISTS idx_job_queue_status_priority 
ON job_queue(status, priority DESC, created_at) 
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_job_queue_type 
ON job_queue(job_type);

CREATE INDEX IF NOT EXISTS idx_job_queue_scheduled 
ON job_queue(scheduled_for) 
WHERE status = 'pending' AND scheduled_for <= NOW();

CREATE INDEX IF NOT EXISTS idx_job_queue_created_at 
ON job_queue(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_queue_worker 
ON job_queue(worker_id) 
WHERE status = 'processing';

-- Enable RLS
ALTER TABLE job_queue ENABLE ROW LEVEL SECURITY;

-- Admins can view all jobs
CREATE POLICY "Admins can view all jobs"
ON job_queue FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.user_id = auth.uid()
        AND profiles.role = 'admin'
    )
);

-- Users can view their own jobs
CREATE POLICY "Users can view own jobs"
ON job_queue FOR SELECT
TO authenticated
USING (auth.uid() = created_by);

-- Step 2: Create job queue statistics table
CREATE TABLE IF NOT EXISTS job_queue_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type TEXT NOT NULL,
    total_jobs INTEGER DEFAULT 0,
    completed_jobs INTEGER DEFAULT 0,
    failed_jobs INTEGER DEFAULT 0,
    avg_processing_time_ms INTEGER,
    min_processing_time_ms INTEGER,
    max_processing_time_ms INTEGER,
    last_processed_at TIMESTAMPTZ,
    date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(job_type, date)
);

CREATE INDEX IF NOT EXISTS idx_job_queue_stats_type_date 
ON job_queue_stats(job_type, date DESC);

-- Step 3: Create function to enqueue job
CREATE OR REPLACE FUNCTION enqueue_job(
    p_job_type TEXT,
    p_payload JSONB,
    p_priority INTEGER DEFAULT 0,
    p_max_retries INTEGER DEFAULT 3,
    p_scheduled_for TIMESTAMPTZ DEFAULT NOW()
)
RETURNS UUID AS $$
DECLARE
    v_job_id UUID;
BEGIN
    INSERT INTO job_queue (
        job_type,
        payload,
        priority,
        max_retries,
        scheduled_for,
        created_by
    ) VALUES (
        p_job_type,
        p_payload,
        p_priority,
        p_max_retries,
        p_scheduled_for,
        auth.uid()
    )
    RETURNING id INTO v_job_id;
    
    RAISE NOTICE 'Job enqueued: % (ID: %)', p_job_type, v_job_id;
    
    RETURN v_job_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 4: Create function to dequeue job (get next job)
CREATE OR REPLACE FUNCTION dequeue_job(
    p_worker_id TEXT,
    p_job_types TEXT[] DEFAULT NULL
)
RETURNS TABLE(
    job_id UUID,
    job_type TEXT,
    payload JSONB,
    retry_count INTEGER
) AS $$
DECLARE
    v_job_id UUID;
BEGIN
    -- Lock and get next available job
    SELECT id INTO v_job_id
    FROM job_queue
    WHERE status = 'pending'
    AND scheduled_for <= NOW()
    AND (p_job_types IS NULL OR job_type = ANY(p_job_types))
    ORDER BY priority DESC, created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;
    
    IF v_job_id IS NULL THEN
        RETURN;
    END IF;
    
    -- Update job status
    UPDATE job_queue
    SET 
        status = 'processing',
        worker_id = p_worker_id,
        started_at = NOW(),
        updated_at = NOW()
    WHERE id = v_job_id;
    
    -- Return job details
    RETURN QUERY
    SELECT 
        jq.id,
        jq.job_type,
        jq.payload,
        jq.retry_count
    FROM job_queue jq
    WHERE jq.id = v_job_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 5: Create function to complete job
CREATE OR REPLACE FUNCTION complete_job(
    p_job_id UUID,
    p_result JSONB DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
    v_started_at TIMESTAMPTZ;
    v_processing_time_ms INTEGER;
    v_job_type TEXT;
BEGIN
    -- Get job details
    SELECT started_at, job_type INTO v_started_at, v_job_type
    FROM job_queue
    WHERE id = p_job_id;
    
    IF v_started_at IS NULL THEN
        RAISE EXCEPTION 'Job not found or not started: %', p_job_id;
    END IF;
    
    -- Calculate processing time
    v_processing_time_ms := EXTRACT(EPOCH FROM (NOW() - v_started_at)) * 1000;
    
    -- Update job
    UPDATE job_queue
    SET 
        status = 'completed',
        completed_at = NOW(),
        processing_time_ms = v_processing_time_ms,
        payload = COALESCE(p_result, payload),
        updated_at = NOW()
    WHERE id = p_job_id;
    
    -- Update statistics
    INSERT INTO job_queue_stats (
        job_type,
        total_jobs,
        completed_jobs,
        avg_processing_time_ms,
        min_processing_time_ms,
        max_processing_time_ms,
        last_processed_at
    ) VALUES (
        v_job_type,
        1,
        1,
        v_processing_time_ms,
        v_processing_time_ms,
        v_processing_time_ms,
        NOW()
    )
    ON CONFLICT (job_type, date) DO UPDATE SET
        total_jobs = job_queue_stats.total_jobs + 1,
        completed_jobs = job_queue_stats.completed_jobs + 1,
        avg_processing_time_ms = (
            (job_queue_stats.avg_processing_time_ms * job_queue_stats.completed_jobs + v_processing_time_ms) /
            (job_queue_stats.completed_jobs + 1)
        ),
        min_processing_time_ms = LEAST(job_queue_stats.min_processing_time_ms, v_processing_time_ms),
        max_processing_time_ms = GREATEST(job_queue_stats.max_processing_time_ms, v_processing_time_ms),
        last_processed_at = NOW(),
        updated_at = NOW();
    
    RAISE NOTICE 'Job completed: % (Processing time: %ms)', p_job_id, v_processing_time_ms;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 6: Create function to fail job
CREATE OR REPLACE FUNCTION fail_job(
    p_job_id UUID,
    p_error_message TEXT,
    p_error_stack TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
    v_retry_count INTEGER;
    v_max_retries INTEGER;
    v_job_type TEXT;
    v_payload JSONB;
BEGIN
    -- Get job details
    SELECT retry_count, max_retries, job_type, payload
    INTO v_retry_count, v_max_retries, v_job_type, v_payload
    FROM job_queue
    WHERE id = p_job_id;
    
    IF v_retry_count IS NULL THEN
        RAISE EXCEPTION 'Job not found: %', p_job_id;
    END IF;
    
    -- Check if should retry
    IF v_retry_count < v_max_retries THEN
        -- Retry with exponential backoff
        UPDATE job_queue
        SET 
            status = 'pending',
            retry_count = retry_count + 1,
            error_message = p_error_message,
            error_stack = p_error_stack,
            worker_id = NULL,
            started_at = NULL,
            scheduled_for = NOW() + (POWER(2, retry_count + 1) || ' seconds')::INTERVAL,
            updated_at = NOW()
        WHERE id = p_job_id;
        
        RAISE NOTICE 'Job failed, will retry (attempt %/%): %', 
            v_retry_count + 1, v_max_retries, p_job_id;
    ELSE
        -- Max retries reached, mark as failed
        UPDATE job_queue
        SET 
            status = 'failed',
            error_message = p_error_message,
            error_stack = p_error_stack,
            completed_at = NOW(),
            updated_at = NOW()
        WHERE id = p_job_id;
        
        -- Update statistics
        INSERT INTO job_queue_stats (
            job_type,
            total_jobs,
            failed_jobs,
            last_processed_at
        ) VALUES (
            v_job_type,
            1,
            1,
            NOW()
        )
        ON CONFLICT (job_type, date) DO UPDATE SET
            total_jobs = job_queue_stats.total_jobs + 1,
            failed_jobs = job_queue_stats.failed_jobs + 1,
            last_processed_at = NOW(),
            updated_at = NOW();
        
        RAISE WARNING 'Job failed permanently after % retries: %', v_max_retries, p_job_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 7: Create function to cancel job
CREATE OR REPLACE FUNCTION cancel_job(p_job_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE job_queue
    SET 
        status = 'cancelled',
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_job_id
    AND status IN ('pending', 'processing');
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Job not found or cannot be cancelled: %', p_job_id;
    END IF;
    
    RAISE NOTICE 'Job cancelled: %', p_job_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 8: Create function to get queue statistics
CREATE OR REPLACE FUNCTION get_queue_stats()
RETURNS TABLE(
    job_type TEXT,
    pending_count BIGINT,
    processing_count BIGINT,
    completed_today BIGINT,
    failed_today BIGINT,
    avg_processing_time_ms INTEGER,
    oldest_pending_age INTERVAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(jq.job_type, jqs.job_type) as job_type,
        COUNT(*) FILTER (WHERE jq.status = 'pending') as pending_count,
        COUNT(*) FILTER (WHERE jq.status = 'processing') as processing_count,
        COALESCE(jqs.completed_jobs, 0) as completed_today,
        COALESCE(jqs.failed_jobs, 0) as failed_today,
        jqs.avg_processing_time_ms,
        MIN(NOW() - jq.created_at) FILTER (WHERE jq.status = 'pending') as oldest_pending_age
    FROM job_queue jq
    FULL OUTER JOIN job_queue_stats jqs 
        ON jq.job_type = jqs.job_type 
        AND jqs.date = CURRENT_DATE
    GROUP BY COALESCE(jq.job_type, jqs.job_type), jqs.completed_jobs, jqs.failed_jobs, jqs.avg_processing_time_ms
    ORDER BY pending_count DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 9: Create function to clean old jobs
CREATE OR REPLACE FUNCTION cleanup_old_jobs(p_days_to_keep INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    DELETE FROM job_queue
    WHERE status IN ('completed', 'failed', 'cancelled')
    AND completed_at < NOW() - (p_days_to_keep || ' days')::INTERVAL;
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    
    RAISE NOTICE 'Cleaned up % old jobs', v_deleted_count;
    
    RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 10: Create function to reset stuck jobs
CREATE OR REPLACE FUNCTION reset_stuck_jobs(p_timeout_minutes INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    v_reset_count INTEGER;
BEGIN
    UPDATE job_queue
    SET 
        status = 'pending',
        worker_id = NULL,
        started_at = NULL,
        retry_count = retry_count + 1,
        error_message = 'Job timed out and was reset',
        updated_at = NOW()
    WHERE status = 'processing'
    AND started_at < NOW() - (p_timeout_minutes || ' minutes')::INTERVAL
    AND retry_count < max_retries;
    
    GET DIAGNOSTICS v_reset_count = ROW_COUNT;
    
    RAISE NOTICE 'Reset % stuck jobs', v_reset_count;
    
    RETURN v_reset_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════
-- ✅ VERIFICATION & TESTING
-- ═══════════════════════════════════════════════════════════════

-- Test: Enqueue some jobs
SELECT enqueue_job('commission_calculation', '{"user_id": "123", "amount": 100}'::jsonb, 10);
SELECT enqueue_job('security_scan', '{"domain": "example.com"}'::jsonb, 5);
SELECT enqueue_job('pdf_generation', '{"contract_id": "456"}'::jsonb, 3);
SELECT enqueue_job('email_send', '{"to": "test@example.com", "template": "welcome"}'::jsonb, 1);

-- Test: Dequeue a job
SELECT * FROM dequeue_job('worker-1');

-- Check queue statistics
SELECT * FROM get_queue_stats();

-- Check pending jobs
SELECT 
    id,
    job_type,
    priority,
    status,
    retry_count,
    created_at,
    scheduled_for
FROM job_queue
WHERE status = 'pending'
ORDER BY priority DESC, created_at ASC
LIMIT 10;

RAISE NOTICE '✅ Queue system implemented successfully!';
RAISE NOTICE 'Next steps:';
RAISE NOTICE '1. Deploy queue-worker Edge Function';
RAISE NOTICE '2. Update existing functions to use queue for heavy operations';
RAISE NOTICE '3. Set up cron job to cleanup old jobs';
RAISE NOTICE '4. Set up cron job to reset stuck jobs';
RAISE NOTICE '5. Monitor queue statistics';
