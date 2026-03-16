# ═══════════════════════════════════════════════════════════════════════════
# Fix Customer Registration Script
# سكريبت إصلاح تسجيل العملاء
# ═══════════════════════════════════════════════════════════════════════════

Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  إصلاح مشكلة تسجيل العملاء - Fix Customer Registration" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Check if Supabase CLI is installed
Write-Host "[1/5] التحقق من Supabase CLI..." -ForegroundColor Yellow
$supabaseCli = Get-Command supabase -ErrorAction SilentlyContinue
if (-not $supabaseCli) {
    Write-Host "❌ Supabase CLI غير مثبت!" -ForegroundColor Red
    Write-Host "قم بتثبيته من: https://supabase.com/docs/guides/cli" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "أو استخدم npm:" -ForegroundColor Yellow
    Write-Host "  npm install -g supabase" -ForegroundColor White
    exit 1
}
Write-Host "✓ Supabase CLI مثبت" -ForegroundColor Green
Write-Host ""

# Check if we're in the right directory
if (-not (Test-Path "fix-customer-registration.sql")) {
    Write-Host "❌ الملف fix-customer-registration.sql غير موجود!" -ForegroundColor Red
    Write-Host "تأكد من أنك في مجلد remix-of-mlm-main" -ForegroundColor Yellow
    exit 1
}

# Option 1: Apply SQL directly via Supabase CLI
Write-Host "[2/5] تطبيق إصلاحات قاعدة البيانات..." -ForegroundColor Yellow
Write-Host "اختر طريقة التطبيق:" -ForegroundColor Cyan
Write-Host "  1. تطبيق تلقائي عبر Supabase CLI (موصى به)" -ForegroundColor White
Write-Host "  2. نسخ SQL للتطبيق اليدوي في Supabase Dashboard" -ForegroundColor White
Write-Host ""

$choice = Read-Host "اختر (1 أو 2)"

if ($choice -eq "1") {
    Write-Host ""
    Write-Host "تطبيق SQL عبر Supabase CLI..." -ForegroundColor Yellow
    
    # Check if project is linked
    $projectRef = "pqnzsihfryjnnhdubisk"
    
    try {
        # Execute SQL file
        $sqlContent = Get-Content "fix-customer-registration.sql" -Raw
        $sqlContent | supabase db execute --project-ref $projectRef
        
        Write-Host "✓ تم تطبيق إصلاحات قاعدة البيانات بنجاح" -ForegroundColor Green
    } catch {
        Write-Host "❌ فشل تطبيق SQL تلقائياً" -ForegroundColor Red
        Write-Host "الخطأ: $_" -ForegroundColor Red
        Write-Host ""
        Write-Host "جرب التطبيق اليدوي:" -ForegroundColor Yellow
        Write-Host "1. افتح Supabase Dashboard: https://supabase.com/dashboard/project/$projectRef/sql" -ForegroundColor White
        Write-Host "2. انسخ محتوى ملف fix-customer-registration.sql" -ForegroundColor White
        Write-Host "3. الصقه في SQL Editor واضغط Run" -ForegroundColor White
        exit 1
    }
} else {
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  تطبيق يدوي - Manual Application" -ForegroundColor Cyan
    Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "1. افتح Supabase Dashboard:" -ForegroundColor Yellow
    Write-Host "   https://supabase.com/dashboard/project/pqnzsihfryjnnhdubisk/sql" -ForegroundColor White
    Write-Host ""
    Write-Host "2. افتح ملف fix-customer-registration.sql" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "3. انسخ المحتوى والصقه في SQL Editor" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "4. اضغط 'Run' لتطبيق الإصلاحات" -ForegroundColor Yellow
    Write-Host ""
    
    $continue = Read-Host "اضغط Enter بعد تطبيق SQL يدوياً للمتابعة"
}

Write-Host ""

# Check Edge Functions deployment
Write-Host "[3/5] التحقق من Edge Functions..." -ForegroundColor Yellow

try {
    $functions = supabase functions list --project-ref pqnzsihfryjnnhdubisk 2>&1
    
    if ($functions -match "register") {
        Write-Host "✓ دالة register موجودة" -ForegroundColor Green
    } else {
        Write-Host "⚠ دالة register غير موجودة - سيتم نشرها" -ForegroundColor Yellow
        
        Write-Host "نشر دالة register..." -ForegroundColor Yellow
        supabase functions deploy register --project-ref pqnzsihfryjnnhdubisk
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✓ تم نشر دالة register بنجاح" -ForegroundColor Green
        } else {
            Write-Host "❌ فشل نشر دالة register" -ForegroundColor Red
            Write-Host "قم بنشرها يدوياً:" -ForegroundColor Yellow
            Write-Host "  cd supabase/functions/register" -ForegroundColor White
            Write-Host "  supabase functions deploy register --project-ref pqnzsihfryjnnhdubisk" -ForegroundColor White
        }
    }
} catch {
    Write-Host "⚠ تعذر التحقق من Edge Functions" -ForegroundColor Yellow
    Write-Host "تأكد من نشر دالة register يدوياً" -ForegroundColor Yellow
}

Write-Host ""

# Test registration endpoint
Write-Host "[4/5] اختبار endpoint التسجيل..." -ForegroundColor Yellow

$testBody = @{
    email = "test-$(Get-Random)@example.com"
    password = "Test1234!"
    firstName = "محمد"
    lastName = "أحمد"
    idNumber = "123456789"
    dateOfBirth = "1990-01-01"
    street = "شارع الاختبار"
    houseNumber = "123"
    postalCode = "12345"
    city = "برلين"
    country = "Deutschland"
    domain = "test-$(Get-Random).com"
    iban = "DE89370400440532013000"
    bankName = "Test Bank"
    accountHolder = "محمد أحمد"
    promotionCode = "TEST2024"
    domainOwner = $true
    sepaMandate = $true
    terms = $true
    privacy = $true
    ageConfirmation = $true
} | ConvertTo-Json

$headers = @{
    "Content-Type" = "application/json"
    "apikey" = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxbnpzaWhmcnlqbm5oZHViaXNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1MjY4NDQsImV4cCI6MjA4ODEwMjg0NH0.AzmcvzIC3Ve5CwZuLVrDfpq9RJ5W-oy8KmJlK1cUINg"
}

try {
    $response = Invoke-RestMethod -Uri "https://pqnzsihfryjnnhdubisk.supabase.co/functions/v1/register" `
        -Method POST `
        -Headers $headers `
        -Body $testBody `
        -ErrorAction Stop
    
    Write-Host "✓ اختبار التسجيل نجح!" -ForegroundColor Green
    Write-Host "الاستجابة: $($response | ConvertTo-Json -Depth 3)" -ForegroundColor Gray
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    $errorBody = $_.ErrorDetails.Message
    
    if ($statusCode -eq 400 -and $errorBody -match "Promotion Code") {
        Write-Host "⚠ الكود الترويجي غير صالح - سيتم إنشاء واحد جديد" -ForegroundColor Yellow
        Write-Host "قم بتشغيل SQL التالي في Supabase Dashboard:" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "INSERT INTO public.rotating_promo_codes (code, code_type, is_active, valid_from, valid_to, max_uses)" -ForegroundColor White
        Write-Host "VALUES ('WELCOME2024', 'fixed', true, NOW(), NOW() + INTERVAL '1 year', 10000)" -ForegroundColor White
        Write-Host "ON CONFLICT (code) DO NOTHING;" -ForegroundColor White
    } elseif ($statusCode -eq 500) {
        Write-Host "❌ خطأ في الخادم - تحقق من Supabase Logs" -ForegroundColor Red
        Write-Host "الخطأ: $errorBody" -ForegroundColor Red
    } else {
        Write-Host "❌ فشل اختبار التسجيل" -ForegroundColor Red
        Write-Host "Status Code: $statusCode" -ForegroundColor Red
        Write-Host "الخطأ: $errorBody" -ForegroundColor Red
    }
}

Write-Host ""

# Summary
Write-Host "[5/5] ملخص الإصلاح..." -ForegroundColor Yellow
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  الخطوات التالية - Next Steps" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. تحقق من Supabase Dashboard:" -ForegroundColor Yellow
Write-Host "   https://supabase.com/dashboard/project/pqnzsihfryjnnhdubisk" -ForegroundColor White
Write-Host ""
Write-Host "2. تحقق من Edge Function Logs:" -ForegroundColor Yellow
Write-Host "   https://supabase.com/dashboard/project/pqnzsihfryjnnhdubisk/functions/register/logs" -ForegroundColor White
Write-Host ""
Write-Host "3. جرب التسجيل من التطبيق:" -ForegroundColor Yellow
Write-Host "   http://localhost:8080/register?code=TEST2024" -ForegroundColor White
Write-Host ""
Write-Host "4. راجع ملف test-registration.md للمزيد من التفاصيل" -ForegroundColor Yellow
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

Write-Host "✓ اكتمل سكريبت الإصلاح" -ForegroundColor Green
Write-Host ""
