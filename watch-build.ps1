#!/usr/bin/env pwsh
# Build watcher script to detect TypeScript errors continuously

Write-Host "🔍 Starting TypeScript build monitor..." -ForegroundColor Green
Write-Host "This will check the build every 10 seconds and beep on errors." -ForegroundColor Yellow

$previousErrorCount = 0

while ($true) {
    try {
        Write-Host "`n⏱️  $(Get-Date -Format 'HH:mm:ss') - Checking build..." -ForegroundColor Cyan

        # Run TypeScript check
        $buildOutput = & npm --prefix "C:\Dev\Pictorigo\frontend" run build 2>&1
        $exitCode = $LASTEXITCODE

        if ($exitCode -eq 0) {
            Write-Host "✅ Build SUCCESSFUL" -ForegroundColor Green
            if ($previousErrorCount -gt 0) {
                Write-Host "🎉 Build is now FIXED!" -ForegroundColor Green
                [System.Media.SystemSounds]::Beep.Play()
                [System.Media.SystemSounds]::Beep.Play()
                $previousErrorCount = 0
            }
        } else {
            # Count errors
            $errorLines = $buildOutput | Where-Object { $_ -match "error TS\d+" }
            $errorCount = $errorLines.Count

            Write-Host "❌ Build FAILED with $errorCount TypeScript errors:" -ForegroundColor Red

            # Show first 5 errors
            $errorLines | Select-Object -First 5 | ForEach-Object {
                Write-Host "   $_" -ForegroundColor Yellow
            }

            if ($errorCount -gt 5) {
                Write-Host "   ... and $($errorCount - 5) more errors" -ForegroundColor Gray
            }

            # Beep if new errors or error count changed
            if ($errorCount -ne $previousErrorCount) {
                [System.Media.SystemSounds]::Hand.Play()
                Write-Host "🔔 Error count changed: $previousErrorCount → $errorCount" -ForegroundColor Magenta
            }

            $previousErrorCount = $errorCount
        }
    } catch {
        Write-Host "⚠️  Error running build check: $_" -ForegroundColor Red
    }

    # Wait 10 seconds
    Start-Sleep -Seconds 10
}