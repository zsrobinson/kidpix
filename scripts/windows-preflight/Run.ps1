$ErrorActionPreference = 'Stop'
$out = Join-Path $env:RUNNER_TEMP 'kidpix-preflight-evidence'
New-Item -ItemType Directory -Force $out | Out-Null
$scratch = Join-Path $env:windir ('Temp\KidPixPreflight-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory $scratch | Out-Null
$owned = $null
$cleanup = [ordered]@{}
try {
    $policy = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System'
    $os = Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,BuildNumber,OSArchitecture
    $inventory = [ordered]@{
        os = $os
        imageOS = $env:ImageOS
        imageVersion = $env:ImageVersion
        framework = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full' | Select-Object Release,Version)
        policy = ($policy | Select-Object EnableLUA,ConsentPromptBehaviorAdmin,ConsentPromptBehaviorUser,FilterAdministratorToken,PromptOnSecureDesktop)
        display = @(Get-CimInstance Win32_VideoController | Select-Object Name,AdapterCompatibility,VideoProcessor,DriverVersion,CurrentHorizontalResolution,CurrentVerticalResolution,CurrentBitsPerPixel)
        soundDevices = @(Get-CimInstance Win32_SoundDevice | Select-Object Name,Status)
        audioServices = @(Get-Service Audiosrv,AudioEndpointBuilder | Select-Object Name,Status)
        sessionListing = @(& "$env:windir\System32\query.exe" session 2>&1 | ForEach-Object { "$_" })
        audioScope = 'Endpoint enumeration only; no playback or loopback proof'
        rendererScope = 'Display adapter/driver only; no application graphics context tested'
    }
    $inventory | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $out 'inventory.json')
    $exe = Join-Path $scratch 'ParentProbe.exe'
    & "$env:windir\Microsoft.NET\Framework\v4.0.30319\csc.exe" /nologo /target:exe /platform:x86 /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll "/out:$exe" "$PSScriptRoot\Probe.cs"
    if ($LASTEXITCODE -ne 0) { throw 'Framework x86 compilation failed' }
    $owned = Start-Process -FilePath $exe -ArgumentList ('"' + $scratch + '"') -PassThru
    if (-not $owned.WaitForExit(120000)) { $owned.Kill(); $owned.WaitForExit(); throw 'Harmless helper exceeded 120 seconds' }
    [ordered]@{ helperExitCode = $owned.ExitCode } | ConvertTo-Json | Set-Content (Join-Path $out 'execution.json')
} catch {
    # Do not serialize exception objects, invocation details, environment, or command lines.
    [ordered]@{ blocker = $_.Exception.GetType().FullName; message = 'Preflight stopped; inspect allowlisted evidence and compiler diagnostics' } | ConvertTo-Json | Set-Content (Join-Path $out 'blocker.json')
} finally {
    if ($owned -and -not $owned.HasExited) { $owned.Kill(); $owned.WaitForExit() }
    $childMarker = Join-Path $scratch 'owned-child.txt'
    if (Test-Path $childMarker) {
        $childId = 0
        if ([int]::TryParse((Get-Content $childMarker -Raw), [ref]$childId)) {
            $childProcess = Get-Process -Id $childId -ErrorAction SilentlyContinue
            if ($childProcess -and $childProcess.Path -eq (Join-Path $scratch 'Probe.exe')) {
                Stop-Process -Id $childId -Force
            }
        }
    }
    # Fallback cleanup is limited to the exact account recorded by this helper.
    $marker = Join-Path $scratch 'owned-account.txt'
    if (Test-Path $marker) {
        $accountName = Get-Content $marker -Raw
        if ($accountName -match '^kp[0-9a-f]{12}$') {
            $account = Get-LocalUser -Name $accountName -ErrorAction SilentlyContinue
            if ($account) {
                $sid = $account.SID.Value
                Get-CimInstance Win32_UserProfile -Filter "SID='$sid'" -ErrorAction SilentlyContinue | Remove-CimInstance -ErrorAction SilentlyContinue
                Remove-LocalUser -Name $accountName
            }
            $cleanup.accountAbsent = -not [bool](Get-LocalUser -Name $accountName -ErrorAction SilentlyContinue)
        }
    }
    foreach ($name in @('parent.json','child.json','parent-window.png','child-window.png')) {
        $file = Join-Path $scratch $name
        if ((Test-Path $file) -and (Get-Item $file).Length -lt 2MB) { Copy-Item $file $out }
    }
    Remove-Item $scratch -Recurse -Force -ErrorAction SilentlyContinue
    $cleanup.scratchAbsent = -not (Test-Path $scratch)
    $cleanup | ConvertTo-Json | Set-Content (Join-Path $out 'cleanup.json')
    $bytes = (Get-ChildItem $out -File | Measure-Object Length -Sum).Sum
    if ($bytes -ge 10MB) { Get-ChildItem $out -Filter '*.png' | Remove-Item }
}
