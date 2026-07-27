# FCResearch Size Collector - local writer
# Saves one unique Sideline bin size per line for user krmclenn.

$ExpectedUser = 'krmclenn'
$Prefix = 'http://127.0.0.1:8765/'
$OutputDirectory = 'C:\Users\krmclenn\Pictures\Scripts'
$OutputFile = Join-Path $OutputDirectory 'FCResearch_Bin_Sizes.txt'

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $OutputDirectory)) {
    New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
}

if (-not (Test-Path -LiteralPath $OutputFile)) {
    New-Item -ItemType File -Path $OutputFile -Force | Out-Null
}

function Get-UniqueSizes {
    if (-not (Test-Path -LiteralPath $OutputFile)) { return @() }

    return @(
        Get-Content -LiteralPath $OutputFile -ErrorAction SilentlyContinue |
        ForEach-Object { $_.Trim() } |
        Where-Object { $_ } |
        Sort-Object -Unique
    )
}

function Save-UniqueSize {
    param([Parameter(Mandatory)][string]$Size)

    $clean = $Size.Trim()
    if (-not $clean) { return $false }

    $sizes = @(Get-UniqueSizes)
    if ($sizes -contains $clean) { return $false }

    $sizes = @($sizes + $clean | Sort-Object -Unique)
    Set-Content -LiteralPath $OutputFile -Value $sizes -Encoding UTF8
    return $true
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($Prefix)

try {
    $listener.Start()
    Write-Host "FCResearch Size Collector running" -ForegroundColor Green
    Write-Host "Listening: $Prefix"
    Write-Host "Saving to: $OutputFile"
    Write-Host "Leave this window open. Press Ctrl+C to stop."

    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $response = $context.Response

        try {
            if ($context.Request.HttpMethod -eq 'OPTIONS') {
                $response.StatusCode = 204
            }
            elseif ($context.Request.HttpMethod -ne 'POST' -or $context.Request.Url.AbsolutePath -ne '/size') {
                $response.StatusCode = 404
            }
            else {
                $reader = [System.IO.StreamReader]::new($context.Request.InputStream, $context.Request.ContentEncoding)
                try {
                    $body = $reader.ReadToEnd()
                }
                finally {
                    $reader.Dispose()
                }

                $payload = $body | ConvertFrom-Json
                $username = [string]$payload.username
                $size = [string]$payload.size

                if ($username -ne $ExpectedUser) {
                    $response.StatusCode = 403
                    $result = @{ ok = $false; error = 'User rejected' }
                }
                elseif ([string]::IsNullOrWhiteSpace($size)) {
                    $response.StatusCode = 400
                    $result = @{ ok = $false; error = 'Missing size' }
                }
                else {
                    $added = Save-UniqueSize -Size $size
                    $response.StatusCode = 200
                    $result = @{ ok = $true; added = $added; size = $size }

                    if ($added) {
                        Write-Host "+ $size" -ForegroundColor Cyan
                    }
                }

                $json = $result | ConvertTo-Json -Compress
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
                $response.ContentType = 'application/json; charset=utf-8'
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            }
        }
        catch {
            $response.StatusCode = 500
            Write-Warning $_.Exception.Message
        }
        finally {
            $response.Close()
        }
    }
}
finally {
    if ($listener.IsListening) { $listener.Stop() }
    $listener.Close()
}
