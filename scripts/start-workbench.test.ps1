# start-workbench.test.ps1
# Quick Launcher unit tests -- dependency injection, fail-fast sentinel, zero side effects
# Run: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-workbench.test.ps1

$ErrorActionPreference = "Stop"
$Script:TestCount = 0
$Script:PassCount = 0
$Script:FailCount = 0
$Script:Failures = @()

function Assert-Equal {
    param($Expected, $Actual, $Message)
    $Script:TestCount++
    if ($Expected -ne $Actual) {
        $Script:FailCount++
        $Script:Failures += "FAIL: $Message (expected '$Expected', got '$Actual')"
        Write-Host "  FAIL $Message" -ForegroundColor Red
    } else {
        $Script:PassCount++
        Write-Host "  PASS $Message" -ForegroundColor Green
    }
}

function Assert-True {
    param([bool]$Condition, $Message)
    if ($Condition) { Assert-Equal $true $Condition $Message }
    else { Assert-Equal $true $false $Message }
}

function Assert-False {
    param([bool]$Condition, $Message)
    if (-not $Condition) { Assert-Equal $false $Condition $Message }
    else { Assert-Equal $false $true $Message }
}

function New-FakeDeps {
    param([bool]$PortsAlwaysDown = $false)
    $d = @{
        Calls = [System.Collections.ArrayList]::new()
        PortResults = @{}
        Commands = @{}
        Now = (Get-Date)
        ServiceStarted = $false
        AlwaysDown = $PortsAlwaysDown
    }
    $d.Deps = @{
        TestPort = {
            param($port)
            [void]$d.Calls.Add("TestPort($port)")
            if ($d.AlwaysDown) { return $false }
            if ($d.ServiceStarted) { return $true }
            return $d.PortResults[$port]
        }.GetNewClosure()
        FindCommand = {
            param($name)
            [void]$d.Calls.Add("FindCommand($name)")
            return $d.Commands[$name]
        }.GetNewClosure()
        GetCommandVersion = {
            param($cmd)
            [void]$d.Calls.Add("GetCommandVersion($cmd)")
            return "v99.99.99"
        }.GetNewClosure()
        StartService = {
            param($dir)
            [void]$d.Calls.Add("StartService($dir)")
            $d.ServiceStarted = $true
        }.GetNewClosure()
        OpenBrowser = {
            param($url)
            [void]$d.Calls.Add("OpenBrowser($url)")
        }.GetNewClosure()
        Now = {
            [void]$d.Calls.Add("Now()")
            return $d.Now
        }.GetNewClosure()
        SleepMs = {
            param($ms)
            [void]$d.Calls.Add("SleepMs($ms)")
            $d.Now = $d.Now.AddMilliseconds($ms)
        }.GetNewClosure()
    }
    return $d
}

function Calls-Contain {
    param($Fake, $Pattern)
    $all = $Fake.Calls -join ' | '
    return $all -match [regex]::Escape($Pattern)
}

# ============================================================
# Setup: activate fail-fast sentinel BEFORE dot-sourcing
# ============================================================
$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$ScriptPath = Join-Path $RepoRoot "scripts\start-workbench.ps1"

if (-not (Test-Path $ScriptPath)) {
    Write-Host "ERROR: Script not found: $ScriptPath" -ForegroundColor Red
    exit 1
}

$SavedFailFastEnv = $env:OPENCODE_TEST_FAILFAST
$env:OPENCODE_TEST_FAILFAST = "1"

try {
    . $ScriptPath
    Write-Host "Script loaded (fail-fast ON): $ScriptPath`n" -ForegroundColor DarkGray

    # ============================================================
    # Test 0: _GetDevStartSpec -- single source of truth
    # ============================================================
    Write-Host "[Test 0] _GetDevStartSpec contract" -ForegroundColor Cyan

    $spec = _GetDevStartSpec "D:\pobdCompare"
    Assert-True ($spec.FilePath -like "*cmd.exe") "FilePath is cmd.exe"
    Assert-Equal "D:\pobdCompare" $spec.WorkingDirectory "WorkingDirectory matches root"
    Assert-Equal "/k" $spec.ArgumentList[0] "ArgumentList[0] is /k"
    Assert-Equal "npm run dev" $spec.ArgumentList[1] "ArgumentList[1] is npm run dev"
    Assert-Equal 2 $spec.ArgumentList.Length "ArgumentList has exactly 2 elements"

    # Path with spaces
    $spec2 = _GetDevStartSpec "D:\my project\pobd compare"
    Assert-Equal "D:\my project\pobd compare" $spec2.WorkingDirectory "Spaced WorkingDirectory"
    Assert-Equal "/k" $spec2.ArgumentList[0] "Spaced ArgumentList[0] is /k"
    Assert-Equal "npm run dev" $spec2.ArgumentList[1] "Spaced ArgumentList[1] is npm run dev"

    # Prove: _StartService consumes _GetDevStartSpec -- the implementation
    # is: $spec = _GetDevStartSpec $Dir; Start-Process ... -WorkingDirectory $spec.WorkingDirectory
    # Tested as pure function above; _StartService itself is guarded by fail-fast.

    # ============================================================
    # Test 1: Both ports listening -> open browser, no service start
    # ============================================================
    Write-Host "[Test 1] Both ports listening" -ForegroundColor Cyan
    $f = New-FakeDeps
    $f.PortResults = @{8787 = $true; 4173 = $true}
    $f.Commands = @{node = "C:\nodejs\node.exe"; npm = "C:\nodejs\npm.cmd"}

    $exitCode = Start-Workbench -Deps $f.Deps

    Assert-Equal 0 $exitCode "Return code 0"
    Assert-True (Calls-Contain $f "TestPort(8787)") "Checked API port"
    Assert-True (Calls-Contain $f "TestPort(4173)") "Checked Web port"
    Assert-True (Calls-Contain $f "OpenBrowser(http://localhost:4173)") "Opened browser"
    Assert-False (Calls-Contain $f "StartService") "Did NOT start service"
    Assert-False (Calls-Contain $f "FindCommand") "Did NOT check commands"

    # Test 1b: DryRun -> no browser, no service
    $f = New-FakeDeps
    $f.PortResults = @{8787 = $true; 4173 = $true}

    $exitCode = Start-Workbench -DryRun -Deps $f.Deps

    Assert-Equal 0 $exitCode "DryRun return code 0"
    Assert-False (Calls-Contain $f "OpenBrowser") "DryRun: browser NOT opened"
    Assert-False (Calls-Contain $f "StartService") "DryRun: service NOT started"

    # ============================================================
    # Test 2: Neither port up, node OK -> start service, open browser
    # ============================================================
    Write-Host "[Test 2] Neither port up, node OK" -ForegroundColor Cyan
    $f = New-FakeDeps
    $f.PortResults = @{8787 = $false; 4173 = $false}
    $f.Commands = @{node = "C:\nodejs\node.exe"; npm = "C:\nodejs\npm.cmd"}

    $exitCode = Start-Workbench -Deps $f.Deps

    Assert-Equal 0 $exitCode "Return code 0"
    Assert-True (Calls-Contain $f "FindCommand(node)") "Checked for node"
    Assert-True (Calls-Contain $f "FindCommand(npm)") "Checked for npm"
    Assert-True (Calls-Contain $f "StartService") "Started service"
    Assert-True (Calls-Contain $f "OpenBrowser(http://localhost:4173)") "Opened browser"

    # Test 2b: DryRun -> no side effects
    $f = New-FakeDeps
    $f.PortResults = @{8787 = $false; 4173 = $false}
    $f.Commands = @{node = "C:\nodejs\node.exe"; npm = "C:\nodejs\npm.cmd"}

    $exitCode = Start-Workbench -DryRun -Deps $f.Deps

    Assert-Equal 0 $exitCode "DryRun return code 0"
    Assert-True (Calls-Contain $f "FindCommand(node)") "DryRun: still checks node"
    Assert-False (Calls-Contain $f "StartService") "DryRun: service NOT started"
    Assert-False (Calls-Contain $f "OpenBrowser") "DryRun: browser NOT opened"

    # ============================================================
    # Test 3: Only API port up -> fail, do not spawn
    # ============================================================
    Write-Host "[Test 3] Only API port up" -ForegroundColor Cyan
    $f = New-FakeDeps
    $f.PortResults = @{8787 = $true; 4173 = $false}

    $exitCode = Start-Workbench -Deps $f.Deps

    Assert-Equal 1 $exitCode "Return code 1"
    Assert-False (Calls-Contain $f "StartService") "Service NOT started"
    Assert-False (Calls-Contain $f "OpenBrowser") "Browser NOT opened"

    # ============================================================
    # Test 4: Only Web port up -> fail, do not spawn
    # ============================================================
    Write-Host "[Test 4] Only Web port up" -ForegroundColor Cyan
    $f = New-FakeDeps
    $f.PortResults = @{8787 = $false; 4173 = $true}

    $exitCode = Start-Workbench -Deps $f.Deps

    Assert-Equal 1 $exitCode "Return code 1"
    Assert-False (Calls-Contain $f "StartService") "Service NOT started"
    Assert-False (Calls-Contain $f "OpenBrowser") "Browser NOT opened"

    # ============================================================
    # Test 5: Neither port up, node/npm missing -> fail
    # ============================================================
    Write-Host "[Test 5] Node/npm missing" -ForegroundColor Cyan
    $f = New-FakeDeps
    $f.PortResults = @{8787 = $false; 4173 = $false}
    $f.Commands = @{}

    $exitCode = Start-Workbench -Deps $f.Deps

    Assert-Equal 2 $exitCode "Return code 2"
    Assert-False (Calls-Contain $f "StartService") "Service NOT started"
    Assert-False (Calls-Contain $f "OpenBrowser") "Browser NOT opened"

    # ============================================================
    # Test 6: Neither port up, node OK, service timeout -> fail (instant)
    # ============================================================
    Write-Host "[Test 6] Service start timeout" -ForegroundColor Cyan
    $f = New-FakeDeps -PortsAlwaysDown $true
    $f.PortResults = @{8787 = $false; 4173 = $false}
    $f.Commands = @{node = "C:\nodejs\node.exe"; npm = "C:\nodejs\npm.cmd"}

    $exitCode = Start-Workbench -Deps $f.Deps

    Assert-Equal 3 $exitCode "Return code 3"
    Assert-True (Calls-Contain $f "StartService") "Service start attempted"
    Assert-True (Calls-Contain $f "SleepMs") "Polling sleep was invoked"

    # ============================================================
    # Test 7: -NoBrowser flag -> start service, no browser
    # ============================================================
    Write-Host "[Test 7] -NoBrowser flag" -ForegroundColor Cyan
    $f = New-FakeDeps
    $f.PortResults = @{8787 = $false; 4173 = $false}
    $f.Commands = @{node = "C:\nodejs\node.exe"; npm = "C:\nodejs\npm.cmd"}

    $exitCode = Start-Workbench -NoBrowser -Deps $f.Deps

    Assert-Equal 0 $exitCode "Return code 0"
    Assert-True (Calls-Contain $f "StartService") "Service started"
    Assert-False (Calls-Contain $f "OpenBrowser") "Browser NOT opened"

    # ============================================================
    # Test 8: -DryRun with -NoBrowser
    # ============================================================
    Write-Host "[Test 8] DryRun + NoBrowser" -ForegroundColor Cyan
    $f = New-FakeDeps
    $f.PortResults = @{8787 = $false; 4173 = $false}
    $f.Commands = @{node = "C:\nodejs\node.exe"; npm = "C:\nodejs\npm.cmd"}

    $exitCode = Start-Workbench -DryRun -NoBrowser -Deps $f.Deps

    Assert-Equal 0 $exitCode "Return code 0"
    Assert-False (Calls-Contain $f "StartService") "DryRun: service NOT started"
    Assert-False (Calls-Contain $f "OpenBrowser") "DryRun: browser NOT opened"

    # ============================================================
    # Test 9: Timeout completes in < 2 seconds (no real sleep)
    # ============================================================
    Write-Host "[Test 9] Timeout is instant (fake clock)" -ForegroundColor Cyan
    $f = New-FakeDeps -PortsAlwaysDown $true
    $f.PortResults = @{8787 = $false; 4173 = $false}
    $f.Commands = @{node = "C:\nodejs\node.exe"; npm = "C:\nodejs\npm.cmd"}

    $start = Get-Date
    $exitCode = Start-Workbench -Deps $f.Deps
    $elapsed = ((Get-Date) - $start).TotalSeconds

    Assert-Equal 3 $exitCode "Return code 3"
    Assert-True ($elapsed -lt 2) "Completed in < 2s (actual: $elapsed s)"

    # ============================================================
    # Test 10: Fail-fast sentinel active on all production functions
    # ============================================================
    Write-Host "[Test 10] Fail-fast guards all production functions" -ForegroundColor Cyan

    $funcs = @(
        { _AssertNoSideEffect },
        { _OpenBrowser "http://x" },
        { _StartService "D:\x" },
        { _SleepMs 1 },
        { _TestPort 9999 },
        { _GetCommandVersion "node" }
    )
    foreach ($fb in $funcs) {
        $caught = $false
        try { & $fb } catch { $caught = $true }
        $name = $fb.ToString().Split()[1]
        Assert-True $caught "Fail-fast blocks $name"
    }

    # ============================================================
    # Test 11: Fakes shield; no production code is hit under fail-fast
    # ============================================================
    Write-Host "[Test 11] Fakes shield all side effects" -ForegroundColor Cyan
    $f = New-FakeDeps
    $f.PortResults = @{8787 = $false; 4173 = $false}
    $f.Commands = @{node = "C:\nodejs\node.exe"; npm = "C:\nodejs\npm.cmd"}

    $exitCode = Start-Workbench -Deps $f.Deps

    Assert-Equal 0 $exitCode "Fakes shielding: return code 0"
    Assert-True (Calls-Contain $f "StartService($RepoRoot)") "Fake StartService called with repo root"
    Assert-True (Calls-Contain $f "OpenBrowser(http://localhost:4173)") "Fake OpenBrowser called"
    Assert-False (Calls-Contain $f "SleepMs") "No sleep when ports come up"

    # ============================================================
    # Summary
    # ============================================================
    Write-Host "`n========================================" -ForegroundColor White
    $color = if ($Script:FailCount -eq 0) { "Green" } else { "Red" }
    Write-Host "  RESULTS: $Script:PassCount / $Script:TestCount passed" -ForegroundColor $color
    if ($Script:FailCount -gt 0) {
        Write-Host "  FAILURES:" -ForegroundColor Red
        $Script:Failures | ForEach-Object { Write-Host "    $_" -ForegroundColor Red }
    }
    Write-Host "========================================" -ForegroundColor White
} finally {
    $env:OPENCODE_TEST_FAILFAST = $SavedFailFastEnv
}

exit $Script:FailCount
