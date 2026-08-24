<#
.SYNOPSIS
    Build a local, versioned copy of the plugin under build\.

.DESCRIPTION
    Produces the same layout the release workflow produces, so you can test an
    install by hand before tagging:

        build\<version>\highlight-pen\{main.js, manifest.json, styles.css}
        build\highlight-pen-<version>.zip

    build\ is gitignored. It is a scratch shelf of past versions, not history.
    Git tags are the real version record.

.EXAMPLE
    .\build.ps1

.EXAMPLE
    .\build.ps1 -InstallTo "D:\Vaults\MyVault"    # also copy into the vault
#>
[CmdletBinding()]
param(
    # A vault root; the plugin lands in <vault>\.obsidian\plugins\highlight-pen\
    [string]$InstallTo
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

Push-Location $PSScriptRoot
try {
    $manifest = Get-Content 'manifest.json' -Raw | ConvertFrom-Json
    $version  = $manifest.version
    $files    = @('main.js', 'manifest.json', 'styles.css')

    foreach ($f in $files) {
        if (-not (Test-Path $f)) { throw "Missing $f" }
    }

    $stage = Join-Path (Join-Path (Join-Path $PSScriptRoot 'build') $version) 'highlight-pen'
    if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
    New-Item -ItemType Directory -Path $stage -Force | Out-Null
    Copy-Item $files -Destination $stage

    $zip = Join-Path (Join-Path $PSScriptRoot 'build') "highlight-pen-$version.zip"
    if (Test-Path $zip) { Remove-Item $zip -Force }
    Compress-Archive -Path $stage -DestinationPath $zip

    Write-Host "Built $version" -ForegroundColor Green
    Write-Host "  $stage"
    Write-Host "  $zip"

    if ($InstallTo) {
        if (-not (Test-Path (Join-Path $InstallTo '.obsidian'))) {
            throw "$InstallTo does not look like a vault (no .obsidian folder)."
        }
        $target = Join-Path (Join-Path (Join-Path $InstallTo '.obsidian') 'plugins') 'highlight-pen'
        New-Item -ItemType Directory -Path $target -Force | Out-Null
        Copy-Item $files -Destination $target -Force
        Write-Host "Installed to $target" -ForegroundColor Green
        Write-Host "Reload plugins in Obsidian (Ctrl+P -> Reload app without saving)."
    }
}
finally {
    Pop-Location
}
