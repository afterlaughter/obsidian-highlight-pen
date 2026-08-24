<#
.SYNOPSIS
    Bump Highlight Pen to a new version, commit, tag and push.

.DESCRIPTION
    Updates manifest.json and versions.json, commits both, creates the tag
    (no 'v' prefix, as Obsidian requires the bare version) and pushes.
    Pushing the tag is what fires .github/workflows/release.yml.

.EXAMPLE
    .\bump.ps1 1.0.1

.EXAMPLE
    .\bump.ps1 1.1.0 -MinAppVersion 1.5.0

.EXAMPLE
    .\bump.ps1 1.0.1 -NoPush      # stage it locally, push yourself later
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidatePattern('^\d+\.\d+\.\d+$')]
    [string]$Version,

    # Defaults to whatever minAppVersion manifest.json already has.
    [string]$MinAppVersion,

    [switch]$NoPush
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Write-JsonFile {
    param([string]$Path, $Object)
    # No BOM: Obsidian and node both choke on a BOM'd manifest.
    $json = ($Object | ConvertTo-Json -Depth 10)
    [System.IO.File]::WriteAllText($Path, $json + "`r`n", (New-Object System.Text.UTF8Encoding($false)))
}

Push-Location $PSScriptRoot
try {
    if (-not (Test-Path '.git')) { throw "No .git here. Run git init first." }

    $dirty = git status --porcelain
    if ($dirty) {
        throw "Working tree is not clean. Commit or stash first:`n$dirty"
    }

    if (git tag --list $Version) { throw "Tag '$Version' already exists." }

    $manifestPath = Join-Path $PSScriptRoot 'manifest.json'
    $versionsPath = Join-Path $PSScriptRoot 'versions.json'

    $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
    $versions = Get-Content $versionsPath -Raw | ConvertFrom-Json

    if (-not $MinAppVersion) { $MinAppVersion = $manifest.minAppVersion }

    Write-Host "$($manifest.version) -> $Version  (minAppVersion $MinAppVersion)" -ForegroundColor Cyan

    $manifest.version       = $Version
    $manifest.minAppVersion = $MinAppVersion
    Write-JsonFile -Path $manifestPath -Object $manifest

    $versions | Add-Member -NotePropertyName $Version -NotePropertyValue $MinAppVersion -Force
    Write-JsonFile -Path $versionsPath -Object $versions

    git add manifest.json versions.json
    git commit -m $Version
    git tag $Version

    if ($NoPush) {
        Write-Host "Committed and tagged. Push when ready:" -ForegroundColor Yellow
        Write-Host "  git push origin main; git push origin $Version"
    }
    else {
        git push origin main
        git push origin $Version
        Write-Host "Pushed. The release workflow is building $Version now." -ForegroundColor Green
        Write-Host "Watch it:  gh run watch"
    }
}
finally {
    Pop-Location
}
