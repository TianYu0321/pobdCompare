# start-workbench.ps1
# Quick Launcher -- one-click workbench startup
# Double-click 启动工作台.cmd or run: powershell -File scripts/start-workbench.ps1
# Parameters: -DryRun, -NoBrowser, -Deps (hashtable for test injection)

param(
    [switch]$DryRun,
    [switch]$NoBrowser
)

$Script:RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Script:ApiPort = 8787
$Script:WebPort = 4173
$Script:LaunchUrl = "http://localhost:$Script:WebPort"
$Script:MaxWaitSeconds = 60
$Script:PollIntervalMs = 500

# ---- Fail-fast sentinel (test isolation guard) ----
# When OPENCODE_TEST_FAILFAST=1, every production side-effect function
# immediately throws. Tests set this before dot-sourcing so any DI leak
# is caught instantly.

$Script:FailFast = $env:OPENCODE_TEST_FAILFAST -eq "1"

function _AssertNoSideEffect {
    if ($Script:FailFast) {
        throw "FAIL-FAST: production side-effect called during test"
    }
}

# ---- Single source of truth for the dev command ----
# _StartService consumes this spec; tests assert the same spec.
# No duplicate string logic.

function _GetDevStartSpec {
    param([string]$Dir)
    return @{
        FilePath = "$env:ComSpec"
        ArgumentList = @("/k", "npm run dev")
        WorkingDirectory = $Dir
        WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Minimized
    }
}

# ---- Real dependency implementations ----

function _TestPort {
    param([int]$Port)
    _AssertNoSideEffect
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $result = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
        $success = $result.AsyncWaitHandle.WaitOne(500)
        if ($success) { $client.EndConnect($result) }
        $client.Close()
        return $success
    } catch {
        return $false
    }
}

function _FindCommand {
    param([string]$Name)
    return Get-Command $Name -ErrorAction SilentlyContinue
}

function _GetCommandVersion {
    param([string]$Cmd)
    _AssertNoSideEffect
    try { return (& $Cmd --version 2>$null | Out-String).Trim() } catch { return "?" }
}

function _StartService {
    param([string]$Dir)
    _AssertNoSideEffect
    $spec = _GetDevStartSpec $Dir
    Start-Process -FilePath $spec.FilePath `
        -ArgumentList $spec.ArgumentList `
        -WorkingDirectory $spec.WorkingDirectory `
        -WindowStyle $spec.WindowStyle
}

function _OpenBrowser {
    param([string]$Url)
    _AssertNoSideEffect
    Start-Process $Url
}

function _Now {
    return Get-Date
}

function _SleepMs {
    param([int]$Ms)
    _AssertNoSideEffect
    Start-Sleep -Milliseconds $Ms
}

# ---- Helper ----

function Get-Dep {
    param([hashtable]$Deps, [string]$Key, [scriptblock]$Default)
    if ($Deps.ContainsKey($Key)) { return $Deps[$Key] }
    return $Default
}

# ---- Main entry ----

function Start-Workbench {
    param(
        [switch]$DryRun,
        [switch]$NoBrowser,
        [hashtable]$Deps = @{}
    )

    $TestPort   = Get-Dep $Deps 'TestPort'   ${function:_TestPort}
    $FindCmd    = Get-Dep $Deps 'FindCommand' ${function:_FindCommand}
    $GetVer     = Get-Dep $Deps 'GetCommandVersion' ${function:_GetCommandVersion}
    $StartSvc   = Get-Dep $Deps 'StartService' ${function:_StartService}
    $OpenUrl    = Get-Dep $Deps 'OpenBrowser' ${function:_OpenBrowser}
    $NowFn      = Get-Dep $Deps 'Now'        ${function:_Now}
    $SleepFn    = Get-Dep $Deps 'SleepMs'     ${function:_SleepMs}

    Write-Host "========================================" -ForegroundColor White
    Write-Host "  PoE2 BD Workbench Launcher" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor White

    Write-Host "`n[检测] 服务状态..." -ForegroundColor Cyan

    $apiUp = & $TestPort $Script:ApiPort
    $webUp = & $TestPort $Script:WebPort

    Write-Host "  API (:$Script:ApiPort): $(if($apiUp){'在线'}else{'离线'})"
    Write-Host "  Web (:$Script:WebPort): $(if($webUp){'在线'}else{'离线'})"

    # Both ports up: just open browser
    if ($apiUp -and $webUp) {
        Write-Host "`n[信息] 工作台已在运行，正在打开浏览器..." -ForegroundColor Green
        if (-not $DryRun -and -not $NoBrowser) {
            & $OpenUrl $Script:LaunchUrl
        }
        if ($DryRun) {
            Write-Host "[DRY-RUN] 将打开浏览器: $Script:LaunchUrl" -ForegroundColor Yellow
        }
        return 0
    }

    # Exactly one port up: error -- tell user to close manually
    if ($apiUp -xor $webUp) {
        $running = if ($apiUp) { "API (:$Script:ApiPort)" } else { "Web (:$Script:WebPort)" }
        $missing = if ($apiUp) { "Web (:$Script:WebPort)" } else { "API (:$Script:ApiPort)" }
        Write-Host "`n[错误] 服务状态不一致: $running 在线, $missing 离线." -ForegroundColor Red
        Write-Host "[提示] 请关闭已运行的工作台终端窗口后再重新启动." -ForegroundColor Yellow
        Write-Host "[提示] 关闭后等待几秒，确保端口完全释放." -ForegroundColor Yellow
        return 1
    }

    # Neither port up: start services
    Write-Host "`n[启动] 正在启动开发服务器..." -ForegroundColor Cyan

    $nodeCmd = & $FindCmd "node"
    $npmCmd  = & $FindCmd "npm"

    if (-not $nodeCmd -or -not $npmCmd) {
        Write-Host "`n[错误] 未找到 Node.js / npm!" -ForegroundColor Red
        Write-Host "[提示] 请安装 Node.js (>= 20.0.0)" -ForegroundColor Yellow
        Write-Host "  https://nodejs.org/" -ForegroundColor Yellow
        return 2
    }

    Write-Host "[信息] Node.js: $(& $GetVer 'node')" -ForegroundColor Gray
    Write-Host "[信息] npm: $(& $GetVer 'npm')" -ForegroundColor Gray
    Write-Host "[信息] 工作目录: $Script:RepoRoot" -ForegroundColor Gray

    if ($DryRun) {
        Write-Host "`n[DRY-RUN] 将在此目录执行: npm run dev" -ForegroundColor Yellow
        Write-Host "[DRY-RUN] 将等待端口 $Script:ApiPort, $Script:WebPort" -ForegroundColor Yellow
        if (-not $NoBrowser) {
            Write-Host "[DRY-RUN] 将打开浏览器: $Script:LaunchUrl" -ForegroundColor Yellow
        }
        return 0
    }

    Write-Host "[执行] 启动: npm run dev (新窗口中)" -ForegroundColor Gray
    & $StartSvc $Script:RepoRoot

    Write-Host "[等待] 等待服务就绪 (最长 $Script:MaxWaitSeconds 秒)..." -ForegroundColor Cyan
    $deadline = (& $NowFn).AddSeconds($Script:MaxWaitSeconds)
    $apiReady = $false
    $webReady = $false

    while ((& $NowFn) -lt $deadline) {
        if (-not $apiReady) { $apiReady = & $TestPort $Script:ApiPort }
        if (-not $webReady) { $webReady = & $TestPort $Script:WebPort }
        if ($apiReady -and $webReady) { break }
        & $SleepFn $Script:PollIntervalMs
    }

    if ($apiReady -and $webReady) {
        $elapsed = [math]::Round(((& $NowFn) - $deadline.AddSeconds(-$Script:MaxWaitSeconds)).TotalSeconds, 1)
        Write-Host "`n[完成] 工作台已就绪! ($elapsed 秒)" -ForegroundColor Green
        if (-not $NoBrowser) {
            & $OpenUrl $Script:LaunchUrl
        }
        return 0
    }

    $notReady = @()
    if (-not $apiReady) { $notReady += "API (:$Script:ApiPort)" }
    if (-not $webReady) { $notReady += "Web (:$Script:WebPort)" }
    Write-Host "`n[超时] 启动超时 ($Script:MaxWaitSeconds 秒). 未就绪: $($notReady -join ', ')" -ForegroundColor Red
    Write-Host "[提示] 请检查新打开的终端窗口中的错误信息." -ForegroundColor Red
    Write-Host "[提示] 可能原因: 端口冲突, 依赖缺失 (npm install)." -ForegroundColor Yellow
    return 3
}

# Entry point guard: auto-run when executed directly, skip when dot-sourced
if ($MyInvocation.InvocationName -ne '.') {
    $code = Start-Workbench -DryRun:$DryRun -NoBrowser:$NoBrowser
    exit $code
}
