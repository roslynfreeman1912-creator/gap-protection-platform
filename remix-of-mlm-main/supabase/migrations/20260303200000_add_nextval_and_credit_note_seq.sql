-- Create sequence for credit note numbering
CREATE SEQUENCE IF NOT EXISTS public.credit_note_seq START WITH 1 INCREMENT BY 1;

-- Create nextval wrapper RPC function
CREATE OR REPLACE FUNCTION public.nextval(seq_name TEXT)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN nextval(seq_name::regclass);
END;
$$;

-- Grant access only to service_role
REVOKE EXECUTE ON FUNCTION public.nextval(TEXT) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nextval(TEXT) TO service_role;
