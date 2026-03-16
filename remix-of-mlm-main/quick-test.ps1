# Quick Registration Test
# اختبار سريع للتسجيل

Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  اختبار سريع لتسجيل العملاء" -ForegroundColor Cyan
Write-Host "  Quick Customer Registration Test" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Generate random email and domain to avoid conflicts
$randomId = Get-Random -Minimum 1000 -Maximum 9999
$testEmail = "test$randomId@example.com"
$testDomain = "test$randomId.com"

Write-Host "📧 البريد الإلكتروني للاختبار: $testEmail" -ForegroundColor Yellow
Write-Host "🌐 الدومين للاختبار: $testDomain" -ForegroundColor Yellow
Write-Host ""

# Test data
$body = @{
    email = $testEmail
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
    domain = $testDomain
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

Write-Host "🚀 إرسال طلب التسجيل..." -ForegroundColor Yellow
Write-Host ""

try {
    $response = Invoke-RestMethod -Uri "https://pqnzsihfryjnnhdubisk.supabase.co/functions/v1/register" `
        -Method POST `
        -Headers $headers `
        -Body $body `
        -ErrorAction Stop
    
    Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Green
    Write-Host "  ✅ نجح التسجيل!" -ForegroundColor Green
    Write-Host "  ✅ Registration Successful!" -ForegroundColor Green
    Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Green
    Write-Host ""
    Write-Host "📋 تفاصيل الاستجابة:" -ForegroundColor Cyan
    Write-Host ($response | ConvertTo-Json -Depth 3) -ForegroundColor White
    Write-Host ""
    Write-Host "✅ تم إنشاء العميل بنجاح" -ForegroundColor Green
    Write-Host "📧 البريد الإلكتروني: $testEmail" -ForegroundColor White
    Write-Host "🌐 الدومين: $testDomain" -ForegroundColor White
    Write-Host ""
    Write-Host "الخطوات التالية:" -ForegroundColor Yellow
    Write-Host "1. تحقق من قاعدة البيانات في Supabase Dashboard" -ForegroundColor White
    Write-Host "2. تحقق من البريد الإلكتروني الترحيبي" -ForegroundColor White
    Write-Host "3. تحقق من إنشاء عقد PDF" -ForegroundColor White
    Write-Host ""
    
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    $errorBody = ""
    
    try {
        $errorBody = $_.ErrorDetails.Message | ConvertFrom-Json
    } catch {
        $errorBody = $_.ErrorDetails.Message
    }
    
    Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Red
    Write-Host "  ❌ فشل التسجيل!" -ForegroundColor Red
    Write-Host "  ❌ Registration Failed!" -ForegroundColor Red
    Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Red
    Write-Host ""
    Write-Host "📋 تفاصيل الخطأ:" -ForegroundColor Yellow
    Write-Host "Status Code: $statusCode" -ForegroundColor White
    
    if ($errorBody) {
        Write-Host "الخطأ: $($errorBody | ConvertTo-Json -Depth 3)" -ForegroundColor White
    }
    
    Write-Host ""
    Write-Host "🔍 الحلول المحتملة:" -ForegroundColor Yellow
    
    if ($statusCode -eq 400) {
        if ($errorBody -match "Promotion Code" -or $errorBody -match "Promocode") {
            Write-Host ""
            Write-Host "❌ الكود الترويجي غير صالح" -ForegroundColor Red
            Write-Host ""
            Write-Host "الحل: أنشئ كود ترويجي جديد" -ForegroundColor Yellow
            Write-Host "شغل الأمر التالي في Supabase SQL Editor:" -ForegroundColor White
            Write-Host ""
            Write-Host "INSERT INTO public.rotating_promo_codes (code, code_type, is_active, valid_from, valid_to, max_uses)" -ForegroundColor Cyan
            Write-Host "VALUES ('TEST2024', 'fixed', true, NOW(), NOW() + INTERVAL '1 year', 1000)" -ForegroundColor Cyan
            Write-Host "ON CONFLICT (code) DO UPDATE SET is_active = true, valid_to = NOW() + INTERVAL '1 year';" -ForegroundColor Cyan
            Write-Host ""
            Write-Host "أو شغل ملف: create-test-promo-code.sql" -ForegroundColor White
        } elseif ($errorBody -match "Profil") {
            Write-Host ""
            Write-Host "❌ مشكلة في إنشاء الملف الشخصي" -ForegroundColor Red
            Write-Host ""
            Write-Host "الحل: شغل سكريبت الإصلاح" -ForegroundColor Yellow
            Write-Host ".\fix-registration.ps1" -ForegroundColor Cyan
            Write-Host ""
            Write-Host "أو شغل ملف: fix-customer-registration.sql في Supabase" -ForegroundColor White
        } elseif ($errorBody -match "E-Mail" -or $errorBody -match "email") {
            Write-Host ""
            Write-Host "❌ البريد الإلكتروني مستخدم بالفعل أو غير صالح" -ForegroundColor Red
            Write-Host ""
            Write-Host "الحل: استخدم بريد إلكتروني مختلف" -ForegroundColor Yellow
        } else {
            Write-Host ""
            Write-Host "❌ خطأ في التحقق من البيانات" -ForegroundColor Red
            Write-Host ""
            Write-Host "تحقق من:" -ForegroundColor Yellow
            Write-Host "- صحة البريد الإلكتروني" -ForegroundColor White
            Write-Host "- صحة IBAN" -ForegroundColor White
            Write-Host "- صحة الدومين" -ForegroundColor White
            Write-Host "- العمر 18+ سنة" -ForegroundColor White
        }
    } elseif ($statusCode -eq 429) {
        Write-Host ""
        Write-Host "❌ تم تجاوز حد الطلبات (Rate Limit)" -ForegroundColor Red
        Write-Host ""
        Write-Host "الحل: انتظر دقيقة واحدة ثم حاول مرة أخرى" -ForegroundColor Yellow
    } elseif ($statusCode -eq 500) {
        Write-Host ""
        Write-Host "❌ خطأ في الخادم" -ForegroundColor Red
        Write-Host ""
        Write-Host "الحل:" -ForegroundColor Yellow
        Write-Host "1. تحقق من Supabase Edge Function Logs:" -ForegroundColor White
        Write-Host "   https://supabase.com/dashboard/project/pqnzsihfryjnnhdubisk/functions/register/logs" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "2. أعد نشر Edge Function:" -ForegroundColor White
        Write-Host "   supabase functions deploy register --project-ref pqnzsihfryjnnhdubisk" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "3. شغل سكريبت الإصلاح:" -ForegroundColor White
        Write-Host "   .\fix-registration.ps1" -ForegroundColor Cyan
    } else {
        Write-Host ""
        Write-Host "❌ خطأ غير متوقع" -ForegroundColor Red
        Write-Host ""
        Write-Host "راجع:" -ForegroundColor Yellow
        Write-Host "- FIX-REGISTRATION-AR.md للحلول الشاملة" -ForegroundColor White
        Write-Host "- test-registration.md لدليل الاختبار" -ForegroundColor White
    }
    
    Write-Host ""
}

Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
