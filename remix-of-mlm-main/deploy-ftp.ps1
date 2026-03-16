$ftpHost = "ftp://62.72.37.139"
$ftpUser = "u429102106"
$ftpPass = "galal123.DE12"
$localDir = "dist"
$remoteBase = "/domains/gapprotectionltd.com/public_html"

$cred = New-Object System.Net.NetworkCredential($ftpUser, $ftpPass)

function Ftp-Request($url, $method) {
    $req = [System.Net.FtpWebRequest]::Create($url)
    $req.Method = $method
    $req.Credentials = $cred
    $req.UseBinary = $true
    $req.UsePassive = $true
    $req.KeepAlive = $true
    return $req
}

function Delete-FtpFile($remotePath) {
    try {
        $req = Ftp-Request "$ftpHost$remotePath" ([System.Net.WebRequestMethods+Ftp]::DeleteFile)
        $resp = $req.GetResponse()
        $resp.Close()
        Write-Host "[DEL] $remotePath" -ForegroundColor Yellow
    } catch {
        Write-Host "[SKIP] $remotePath" -ForegroundColor DarkGray
    }
}

function Ensure-FtpDirectory($remotePath) {
    try {
        $req = Ftp-Request "$ftpHost$remotePath/" ([System.Net.WebRequestMethods+Ftp]::MakeDirectory)
        $resp = $req.GetResponse()
        $resp.Close()
        Write-Host "[DIR+] $remotePath" -ForegroundColor Green
    } catch { }
}

function Upload-FtpFile($localPath, $remotePath) {
    $maxRetries = 3
    for ($i = 1; $i -le $maxRetries; $i++) {
        try {
            $fileContent = [System.IO.File]::ReadAllBytes($localPath)
            $req = Ftp-Request "$ftpHost$remotePath" ([System.Net.WebRequestMethods+Ftp]::UploadFile)
            $req.ContentLength = $fileContent.Length
            $stream = $req.GetRequestStream()
            $stream.Write($fileContent, 0, $fileContent.Length)
            $stream.Close()
            $resp = $req.GetResponse()
            $size = [math]::Round($fileContent.Length / 1024, 1)
            Write-Host "[OK] $remotePath (${size} KB)" -ForegroundColor Green
            $resp.Close()
            return $true
        } catch {
            if ($i -eq $maxRetries) {
                Write-Host "[FAIL] $remotePath - $($_.Exception.Message)" -ForegroundColor Red
                return $false
            }
            Write-Host "[RETRY $i] $remotePath" -ForegroundColor Yellow
            Start-Sleep -Seconds 2
        }
    }
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " GAP Protection - FTP Deploy v3" -ForegroundColor Cyan
Write-Host " Path: $remoteBase" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Step 1: Delete old files that conflict
Write-Host "`n--- Cleaning old files ---" -ForegroundColor Cyan

# Delete index.php (was redirecting to partner.html)
Delete-FtpFile "$remoteBase/index.php"
Delete-FtpFile "$remoteBase/partner.html"
Delete-FtpFile "$remoteBase/index_old.php"
Delete-FtpFile "$remoteBase/run_install.php"
Delete-FtpFile "$remoteBase/gapp_diag.php"
Delete-FtpFile "$remoteBase/phptest.php"
Delete-FtpFile "$remoteBase/deploy_test.txt"
Delete-FtpFile "$remoteBase/test.html"
Delete-FtpFile "$remoteBase/testfile.txt"
Delete-FtpFile "$remoteBase/.htaccess.bak"

# Delete old assets
$oldAssets = @(
    "partner-Bl4o0bkc.js", "partner-6SsIi-OK.css", "partner-DgACXdPR.js", "partner-lZux4eiC.css",
    "chunk-CBrSDip1.js", "chunk-C5KSVp3G.js", "chunk-CcWmvBZQ.js",
    "index-Dao1uSeH.css", "app-BqFg_yla.js",
    "logo-stacked-white-BCYctD1g.png", "logo-horizontal-black-CkvjrIaJ.png",
    "logo-icon-black-CbOnGY5y.png", "logo-stacked-black-b3SKK8rX.png"
)
foreach ($f in $oldAssets) {
    Delete-FtpFile "$remoteBase/assets/$f"
}

# Step 2: Ensure assets directory
Write-Host "`n--- Creating directories ---" -ForegroundColor Cyan
Ensure-FtpDirectory "$remoteBase/assets"

# Step 3: Upload all new files
Write-Host "`n--- Uploading new files ---" -ForegroundColor Cyan
$allFiles = Get-ChildItem $localDir -Recurse -File
$total = $allFiles.Count
$success = 0
$failed = 0
$counter = 0

foreach ($file in $allFiles) {
    $counter++
    $relativePath = $file.FullName.Substring((Resolve-Path $localDir).Path.Length).Replace('\', '/')
    $remotePath = "$remoteBase$relativePath"
    Write-Host "[$counter/$total] " -NoNewline
    $result = Upload-FtpFile $file.FullName $remotePath
    if ($result) { $success++ } else { $failed++ }
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host " Deploy Complete!" -ForegroundColor Green
Write-Host " Total: $total | Success: $success | Failed: $failed" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
if ($failed -gt 0) { exit 1 }
