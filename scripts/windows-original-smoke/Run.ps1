$ErrorActionPreference = 'Stop'
$out = Join-Path $env:RUNNER_TEMP 'kidpix-original-smoke-evidence'
$scratch = Join-Path $env:RUNNER_TEMP ('KidPixSmoke-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force $out,$scratch | Out-Null
$clock = [Diagnostics.Stopwatch]::StartNew()
$script:receipts = @()
$script:owned = @()
function Save($name, $data) { $data | ConvertTo-Json -Depth 10 | Set-Content (Join-Path $out $name) }
function Run-Clean($file, $arguments, $milliseconds = 120000) {
    if ($clock.ElapsedMilliseconds -gt 600000) { throw 'Download/install wall budget exhausted' }
    $si = New-Object Diagnostics.ProcessStartInfo
    $si.FileName = $file; $si.Arguments = $arguments; $si.UseShellExecute = $false; $si.WorkingDirectory = $scratch
    $si.EnvironmentVariables.Clear()
    # Normal application variables only. No inherited CI, provider, token or credentials.
    foreach ($key in @('SystemRoot','windir','SystemDrive','COMSPEC','PATH','PATHEXT','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA','PROGRAMDATA','ProgramFiles','ProgramFiles(x86)','ProgramW6432','CommonProgramFiles','CommonProgramFiles(x86)','CommonProgramW6432','PUBLIC','HOMEDRIVE','HOMEPATH','USERNAME','USERDOMAIN','COMPUTERNAME','PROCESSOR_ARCHITECTURE','PROCESSOR_IDENTIFIER','NUMBER_OF_PROCESSORS','OS')) {
        $value = [Environment]::GetEnvironmentVariable($key)
        if ($null -ne $value) { $si.EnvironmentVariables[$key] = $value }
    }
    $p = [Diagnostics.Process]::Start($si); $script:owned += $p
    $limit = [Math]::Min($milliseconds, [Math]::Max(1,600000 - $clock.ElapsedMilliseconds))
    if (-not $p.WaitForExit([int]$limit)) {
        # Only the exact process tree started by this script.
        & "$env:windir\System32\taskkill.exe" /PID $p.Id /T /F | Out-Null
        throw 'Owned process exceeded bounded runtime'
    }
    $p.WaitForExit()
    $script:receipts += [ordered]@{ executable = [IO.Path]::GetFileName($file); exitCode = $p.ExitCode; elapsedMs = $clock.ElapsedMilliseconds }
    Save 'execution.json' $script:receipts
    if ($p.ExitCode -ne 0) { throw ('Process stopped with exit code ' + $p.ExitCode) }
}
function Download($url,$name,$size,$sha) {
    $path = Join-Path $scratch $name
    Run-Clean "$env:windir\System32\curl.exe" ('--fail --location --silent --show-error --proto =https --proto-redir =https --max-time 180 --output "' + $path + '" "' + $url + '"') 190000
    $item = Get-Item $path; $hash = (Get-FileHash $path -Algorithm SHA256).Hash.ToLowerInvariant()
    $sig = Get-AuthenticodeSignature $path
    Save ($name + '-receipt.json') ([ordered]@{source=$url;bytes=$item.Length;sha256=$hash;fileVersion=$item.VersionInfo.FileVersion;signatureStatus=[string]$sig.Status;signatureSubject=if($sig.SignerCertificate){$sig.SignerCertificate.Subject}else{$null}})
    if ($item.Length -ne $size -or $hash -ne $sha) { throw 'Input identity mismatch before execution' }
    return $path
}
function Install-Msi($path,$features='') {
    $args = '/i "' + $path + '" /qn /norestart'
    if ($features) { $args += ' ADDLOCAL="' + $features + '"' }
    Run-Clean "$env:windir\System32\msiexec.exe" $args 180000
}
try {
    $policy = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System'
    Save 'inventory.json' ([ordered]@{
        os=(Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,BuildNumber,OSArchitecture)
        imageOS=$env:ImageOS;imageVersion=$env:ImageVersion
        framework=(Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full' | Select-Object Release,Version)
        policy=($policy | Select-Object EnableLUA,ConsentPromptBehaviorAdmin,ConsentPromptBehaviorUser,FilterAdministratorToken,PromptOnSecureDesktop)
        display=@(Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion,CurrentHorizontalResolution,CurrentVerticalResolution,CurrentBitsPerPixel)
        audioScope='Visual only; no endpoint playback or actual recording proven'
        freeBytes=(Get-PSDrive -Name ([IO.Path]::GetPathRoot($scratch).Substring(0,1))).Free
    })
    if ((Get-PSDrive -Name ([IO.Path]::GetPathRoot($scratch).Substring(0,1))).Free -lt 9GB) { throw 'Less than 9 GiB free' }
    $csc = "$env:windir\Microsoft.NET\Framework\v4.0.30319\csc.exe"
    $uia = "$env:windir\Microsoft.NET\Framework\v4.0.30319\WPF"
    foreach ($name in @('Gates','Extract','Runtime','Observe')) {
        $refs = '/reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll'
        if ($name -eq 'Observe') { $refs += ' /reference:"' + $uia + '\UIAutomationClient.dll" /reference:"' + $uia + '\UIAutomationTypes.dll" /reference:"' + $uia + '\WindowsBase.dll"' }
        Run-Clean $csc ('/nologo /target:exe /platform:x86 ' + $refs + ' /out:"' + $scratch + '\' + $name + '.exe" "' + $PSScriptRoot + '\' + $name + '.cs"') 30000
    }
    Run-Clean (Join-Path $scratch 'Gates.exe') ('"' + $out + '"') 20000
    $gates = Get-Content (Join-Path $out 'token-desktop.json') -Raw | ConvertFrom-Json
    if ($gates.elevationType -eq 2 -or $gates.session -eq 0 -or $gates.desktop -ne 'Default' -or $gates.inputDesktop -ne 'Default' -or $gates.windowStation -ne 'WinSta0' -or $gates.resolution.width -lt 1024 -or $gates.resolution.height -lt 768 -or $gates.resolution.bits -ne 32) { throw 'Token or interactive desktop gate failed' }
    $outer = Download 'https://downloads.mackiev.com/kp3d/KPD3DWin.exe' 'KPD3DWin.exe' 2124112183 '1169eb4f4f35f07d508dc57ca3ae2f84e36f58964b8b91ed48ea914a32c34bc3'
    $msi = Join-Path $scratch 'Kid Pix 3D.msi'
    Run-Clean (Join-Path $scratch 'Extract.exe') ('"' + $outer + '" "' + $msi + '"') 120000
    $msiHash = (Get-FileHash $msi -Algorithm SHA256).Hash.ToLowerInvariant()
    Save 'msi-receipt.json' @{sha256=$msiHash;method='Faithful container decode; normal MSI install; no properties bypassing launch conditions'}
    if ($msiHash -ne 'db0a61ff40229e4b2bfd8fe32418f6835a30b90f09ccb928f9b26cb7a891473e') { throw 'Decoded MSI mismatch' }
    Remove-Item $outer -Force
    $qt = Download 'https://secure-appldnld.apple.com/QuickTime/031-43075-20160107-C0844134-B3CD-11E5-B1C0-43CA8D551951/QuickTimeInstaller.exe' 'QuickTimeInstaller.exe' 41896256 '56eff77b029b5f56c47d11fe58878627065dbeacbc3108d50d98a83420152c2b'
    $qtDir = Join-Path $scratch 'quicktime'; New-Item -ItemType Directory $qtDir | Out-Null
    Run-Clean 'C:\Program Files\7-Zip\7z.exe' ('x -y "' + $qt + '" -o"' + $qtDir + '"') 30000
    $qtMsi = Join-Path $qtDir 'QuickTime.msi'
    $installer = New-Object -ComObject WindowsInstaller.Installer
    $db = $installer.OpenDatabase($qtMsi,0)
    $view = $db.OpenView('SELECT `Feature`, `Title` FROM `Feature`'); $view.Execute()
    $features = @(); while ($row = $view.Fetch()) { $features += [ordered]@{feature=$row.StringData(1);title=$row.StringData(2)} }; $view.Close()
    Save 'quicktime-features.json' $features
    if ('QuickTimeEssentials' -notin @($features | ForEach-Object {$_.feature})) { throw 'Official runtime feature missing' }
    Install-Msi (Join-Path $qtDir 'AppleApplicationSupport.msi')
    Install-Msi $qtMsi 'QuickTimeEssentials'
    $qtSystem = Join-Path ${env:ProgramFiles(x86)} 'QuickTime\QTSystem'
    Save 'prerequisite-modules.json' @(Get-Item (Join-Path $qtSystem 'QTMLClient.dll'),(Join-Path $qtSystem 'QuickTime.qts') | ForEach-Object { @{name=$_.Name;bytes=$_.Length;version=$_.VersionInfo.FileVersion;sha256=(Get-FileHash $_.FullName -Algorithm SHA256).Hash} })
    Run-Clean (Join-Path $scratch 'Runtime.exe') ('"' + $qtSystem + '" "' + $out + '\runtime-gate.json"') 30000
    Install-Msi $msi
    Remove-Item $msi,$qt -Force; Remove-Item $qtDir -Recurse -Force
    $appPath = Join-Path ${env:ProgramFiles(x86)} 'Software MacKiev\Kid Pix 3D\kidpix3d.exe'
    $app = Get-Item $appPath
    $appHash = (Get-FileHash $appPath -Algorithm SHA256).Hash.ToLowerInvariant()
    Save 'app-receipt.json' @{sha256=$appHash;fileVersion=$app.VersionInfo.FileVersion;productVersion=$app.VersionInfo.ProductVersion;workingDirectory=$app.Directory.Name;filesUnchanged=$true}
    if ($appHash -ne 'a4be804b0f32cef3065ec2cca439c695224378bb58cac806bc196515e56dae04') { throw 'Installed original app identity mismatch' }
    Run-Clean (Join-Path $scratch 'Observe.exe') ('"' + $appPath + '" "' + $out + '"') 90000
} catch {
    Save 'blocker.json' @{type=$_.Exception.GetType().FullName;hresult=$_.Exception.HResult;message=$_.Exception.Message;elapsedMs=$clock.ElapsedMilliseconds;originalReferences='0/17'}
} finally {
    foreach ($p in $script:owned) { if (-not $p.HasExited) { & "$env:windir\System32\taskkill.exe" /PID $p.Id /T /F | Out-Null } }
    Remove-Item $scratch -Recurse -Force -ErrorAction SilentlyContinue
    Save 'cleanup.json' @{scratchRemoved=(-not (Test-Path $scratch));VMDisposalFinalBoundary=$true;trialStateReset=$false;elapsedMs=$clock.ElapsedMilliseconds}
    $files = @(Get-ChildItem $out -File)
    if (($files | Measure-Object Length -Sum).Sum -ge 50MB) { $files | Where-Object Extension -eq '.png' | Remove-Item }
}
