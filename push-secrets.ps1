# Reads KEY=VALUE pairs from a .env file and pushes each one to this
# Worker as a Cloudflare secret. Run from the same directory as
# wrangler.jsonc, after `npx wrangler login`.
#
# Usage: .\push-secrets.ps1 .env.dev

param(
    [string]$EnvFile = ".env"
)

if (-not (Test-Path $EnvFile)) {
    Write-Error "No such file: $EnvFile"
    exit 1
}

Get-Content $EnvFile | ForEach-Object {
    $line = $_.Trim()

    # skip blank lines and comments
    if ($line -eq "" -or $line.StartsWith("#")) { return }

    $idx = $line.IndexOf("=")
    if ($idx -lt 1) { return }

    $key = $line.Substring(0, $idx).Trim()
    $value = $line.Substring($idx + 1).Trim()

    # strip surrounding quotes if present
    if ($value.StartsWith('"') -and $value.EndsWith('"')) {
        $value = $value.Substring(1, $value.Length - 2)
    }

    Write-Host "Setting $key ..."
    $value | npx wrangler secret put $key
}

Write-Host "Done. Run 'npx wrangler secret list' to confirm."
