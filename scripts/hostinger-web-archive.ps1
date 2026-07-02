# Pre-built Next.js archive for Hostinger — local build, skip server-side next build.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$webRoot = Join-Path $root "apps\web"
$staging = Join-Path $env:TEMP "tripeseats-web-prebuilt-$(Get-Random)"
$out = Join-Path $root "tripeseats-web-hostinger-v2.zip"

function Write-Utf8NoBom([string]$Path, [string]$Content) {
  $utf8 = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($Path, $Content, $utf8)
}

if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
if (Test-Path $out) { Remove-Item $out -Force -ErrorAction SilentlyContinue }
New-Item -ItemType Directory -Path $staging | Out-Null

Write-Host "Running local next build..."
Push-Location $webRoot
try {
  pnpm build 2>&1 | Write-Host
  if ($LASTEXITCODE -ne 0) { throw "next build failed" }
}
finally {
  Pop-Location
}

robocopy $webRoot $staging /E /XD node_modules .turbo /XF .env .env.local /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed" }

$pkgPath = Join-Path $staging "package.json"
$pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
$pkg.scripts.build = "echo prebuilt"
# Hostinger auto-runs `npm start` — Next.js reads PORT from the platform (no -p flag).
$pkg.scripts.start = "next start"
if (-not $pkg.engines) { $pkg | Add-Member -NotePropertyName engines -NotePropertyValue (@{}) }
$pkg.engines.node = "20"
Write-Utf8NoBom $pkgPath ($pkg | ConvertTo-Json -Depth 10)

# Include hidden folders like .next — Compress-Archive "*" skips them on Windows.
$archiveItems = Get-ChildItem -Path $staging -Force | ForEach-Object { $_.FullName }
Compress-Archive -Path $archiveItems -DestinationPath $out -CompressionLevel Optimal -Force
Remove-Item $staging -Recurse -Force

$sizeMb = [math]::Round((Get-Item $out).Length / 1MB, 2)
Write-Host "Created $out ($sizeMb MB)"
