# Standalone Hostinger API archive — only api + database workspaces (no web/turbo).
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$staging = Join-Path $env:TEMP "tripeseats-api-hostinger-staging-$(Get-Random)"
$out = Join-Path $root "tripeseats-api-hostinger-v2.zip"

function Write-Utf8NoBom([string]$Path, [string]$Content) {
  $utf8 = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($Path, $Content, $utf8)
}

if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
if (Test-Path $out) { Remove-Item $out -Force }
New-Item -ItemType Directory -Path $staging | Out-Null

$copyItems = @(
  "tsconfig.base.json",
  "apps\api\src",
  "apps\api\package.json",
  "apps\api\tsconfig.json",
  "packages\database\src",
  "packages\database\package.json",
  "packages\database\tsconfig.json",
  "packages\database\prisma"
)

foreach ($item in $copyItems) {
  $src = Join-Path $root $item
  $dest = Join-Path $staging $item
  New-Item -ItemType Directory -Path (Split-Path $dest -Parent) -Force | Out-Null
  Copy-Item $src $dest -Recurse -Force
}

$rootPkg = @'
{
  "name": "tripeseats-api-hostinger",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "pnpm": {
    "onlyBuiltDependencies": ["@prisma/client", "@prisma/engines", "prisma"]
  },
  "scripts": {
    "build": "npx prisma generate --schema packages/database/prisma/schema.prisma && npx tsc -p packages/database/tsconfig.json && npx tsc -p apps/api/tsconfig.json",
    "start": "node app.js"
  },
  "engines": {
    "node": "20"
  },
  "devDependencies": {
    "prisma": "^5.22.0",
    "typescript": "^5.6.3"
  }
}
'@
Write-Utf8NoBom (Join-Path $staging "package.json") $rootPkg
Write-Utf8NoBom (Join-Path $staging "pnpm-workspace.yaml") "packages:`n  - apps/*`n  - packages/*`n"

Write-Utf8NoBom (Join-Path $staging "app.js") "require('./apps/api/dist/index.js');`n"

$apiPkgPath = Join-Path $staging "apps\api\package.json"
$apiPkg = Get-Content $apiPkgPath -Raw | ConvertFrom-Json
$apiPkg.scripts.build = "npx tsc -p tsconfig.json"
Write-Utf8NoBom $apiPkgPath ($apiPkg | ConvertTo-Json -Depth 10)

$dbPkgPath = Join-Path $staging "packages\database\package.json"
$dbPkg = Get-Content $dbPkgPath -Raw | ConvertFrom-Json
if (-not $dbPkg.devDependencies) { $dbPkg | Add-Member -NotePropertyName devDependencies -NotePropertyValue (@{}) }
$dbPkg.devDependencies.prisma = "^5.22.0"
Write-Utf8NoBom $dbPkgPath ($dbPkg | ConvertTo-Json -Depth 10)

Get-ChildItem $staging -Recurse -Directory -Filter "node_modules" -ErrorAction SilentlyContinue |
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Get-ChildItem $staging -Recurse -Directory -Filter "dist" -ErrorAction SilentlyContinue |
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

Compress-Archive -Path (Join-Path $staging "*") -DestinationPath $out -CompressionLevel Optimal
Remove-Item $staging -Recurse -Force

$sizeMb = [math]::Round((Get-Item $out).Length / 1MB, 2)
Write-Host "Created $out ($sizeMb MB)"
