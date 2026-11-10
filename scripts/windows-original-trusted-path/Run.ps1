$ErrorActionPreference = 'Stop'
$out = Join-Path $env:RUNNER_TEMP 'kidpix-original-trusted-path-evidence'
$scratch = Join-Path $env:RUNNER_TEMP ('KidPixSmoke-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force $out,$scratch | Out-Null
$clock = [Diagnostics.Stopwatch]::StartNew()
$script:receipts = @()
$script:owned = @()
$script:trustedPath = $null

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
    $si.EnvironmentVariables['PATH'] = $env:windir + ';' + $env:windir + '\System32;' + $env:windir + '\System32\Wbem'
    if ($script:trustedPath) { $si.EnvironmentVariables['PATH'] = $script:trustedPath }
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
    if ($name -eq 'QuickTimeInstaller.exe' -and ([string]$sig.Status -ne 'Valid' -or $sig.SignerCertificate.Subject -notmatch 'O=Apple Inc\.')) { throw 'Apple Authenticode validation failed' }
    return $path
}
# Every fetched record and every query handle has an explicit lifetime, including errors.
function Read-Msi($path,$query,$columns) {
    $installer = $null; $db = $null; $view = $null; $row = $null
    try {
        $installer = New-Object -ComObject WindowsInstaller.Installer
        $db = $installer.OpenDatabase($path,0)
        $view = $db.OpenView($query); $view.Execute()
        while ($null -ne ($row = $view.Fetch())) {
            try {
                $record = [ordered]@{}
                for ($i=0; $i -lt $columns.Count; $i++) { $record[$columns[$i]] = $row.StringData($i+1) }
                [pscustomobject]$record
            } finally { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($row); $row = $null }
        }
    } finally {
        $releaseErrors = @()
        try { if ($null -ne $view) { $view.Close() } } catch { $releaseErrors += $_.Exception.Message }
        foreach ($com in @($row,$view,$db,$installer)) {
            if ($null -ne $com) {
                try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($com) }
                catch { $releaseErrors += $_.Exception.Message }
            }
        }
        if ($releaseErrors.Count) { throw ('MSI handle release failed: ' + ($releaseErrors -join '; ')) }
    }
}
function Installed-ComponentPath($product,$component) {
    $installer = $null
    try {
        $installer = New-Object -ComObject WindowsInstaller.Installer
        $installer.ComponentPath($product,$component)
    } finally { if ($null -ne $installer) { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($installer) } }
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
    if ($gates.elevationType -ne 1 -or $gates.elevated -ne 1 -or $gates.integrity -ne 'S-1-16-12288' -or $gates.session -eq 0 -or $gates.desktop -ne 'Default' -or $gates.inputDesktop -ne 'Default' -or $gates.windowStation -ne 'WinSta0' -or $gates.resolution.width -lt 1024 -or $gates.resolution.height -lt 768 -or $gates.resolution.bits -ne 32) { throw 'Token or interactive desktop gate failed' }
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
    if ((Get-FileHash $qtMsi -Algorithm SHA256).Hash.ToLowerInvariant() -ne '03ea287b99df2605a9d32b0fe9096d811b8c7ed1654f822ff76f7e172e0ed0b8') { throw 'QuickTime MSI mismatch' }
    $features = @(Read-Msi $qtMsi 'SELECT `Feature`, `Title` FROM `Feature`' @('feature','title'))
    Save 'quicktime-features.json' $features
    if ('QuickTimeEssentials' -notin @($features | ForEach-Object {$_.feature})) { throw 'Official runtime feature missing' }
    Install-Msi (Join-Path $qtDir 'AppleApplicationSupport.msi')
    Install-Msi $qtMsi 'QuickTimeEssentials'
    # Only genuine post-installer Machine PATH entries; never write machine state.
    $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::LocalMachine,[Microsoft.Win32.RegistryView]::Registry32)
    $key = $null
    try {
        $key = $base.OpenSubKey('Software\Apple Computer, Inc.\QuickTime')
        if ($null -eq $key) { throw 'Registry32 QuickTime key absent' }
        $registry = @{}
        foreach ($name in @('QTSysDir','QuickTime.qts folder','InstallDir')) {
            if ($key.GetValueKind($name) -ne [Microsoft.Win32.RegistryValueKind]::String) { throw 'QuickTime registry value is not REG_SZ' }
            $registry[$name] = [string]$key.GetValue($name)
        }
    } finally { if ($null -ne $key) { $key.Dispose() }; $base.Dispose() }
    function Canonical-Directory($value) {
        if (-not [IO.Path]::IsPathRooted($value)) { throw 'Nonabsolute directory' }
        $full = [IO.Path]::GetFullPath($value).TrimEnd('\')
        $item = Get-Item -LiteralPath $full
        if (-not $item.PSIsContainer) { throw 'Not a directory' }
        $cursor = $item
        while ($null -ne $cursor) {
            if (($cursor.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Reparse directory rejected' }
            $cursor = $cursor.Parent
        }
        return $item.FullName.TrimEnd('\')
    }
    $qtSystem = Canonical-Directory $registry['QTSysDir']
    $expectedQt = Canonical-Directory (Join-Path ${env:ProgramFiles(x86)} 'QuickTime\QTSystem')
    if ($qtSystem -ine $expectedQt -or (Canonical-Directory $registry['QuickTime.qts folder']) -ine $qtSystem -or (Canonical-Directory $registry['InstallDir']) -ine (Split-Path $qtSystem)) { throw 'Official registry directories disagree' }
    $windows = Canonical-Directory $env:windir
    $trusted = @()
    foreach ($entry in ([Environment]::GetEnvironmentVariable('PATH','Machine') -split ';')) {
        $value = [Environment]::ExpandEnvironmentVariables($entry.Trim().Trim('"')).TrimEnd('\')
        if (-not $value -or -not [IO.Path]::IsPathRooted($value)) { continue }
        $value = [IO.Path]::GetFullPath($value).TrimEnd('\')
        if ($value -ieq $qtSystem -or $value -ieq $windows -or $value.StartsWith($windows + '\',[StringComparison]::OrdinalIgnoreCase)) {
            $trusted += Canonical-Directory $value
        }
    }
    $trusted = @($trusted | Select-Object -Unique)
    Save 'trusted-path.json' @{registry32=$registry;canonicalQtSystem=$qtSystem;entries=$trusted;qtSystemInActualMachinePath=($trusted -icontains $qtSystem);machinePathChanged=$false;source='actual post-installer Machine PATH restricted to Windows directories and registered official QTSystem'}
    if ($trusted -inotcontains $qtSystem -or $trusted -inotcontains $windows -or $trusted -inotcontains (Join-Path $windows 'System32')) { throw 'Required genuine machine PATH entries missing' }
    $script:trustedPath = $trusted -join ';'
    $identities = @{
        'QuickTime.qts'='a623f5a4c41c0e848800315df95883bcfaa4b2b0251a98e3661f15b140989171'
        'QTMLClient.dll'='b8a433c774851eb0dc19d6e6d6941d60fb44b8b5c8d69fd391f1f427db09ea44'
        'QTCF.dll'='62844ff9a31669c714b06de85c934c5645d29756405495c88fc761b622d26d6c'
    }
    $modules = @()
    foreach ($name in $identities.Keys) {
        $file = Get-Item -LiteralPath (Join-Path $qtSystem $name)
        if (($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Reparse file rejected' }
        $hash = (Get-FileHash $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        $modules += @{path=$file.FullName;bytes=$file.Length;version=$file.VersionInfo.FileVersion;sha256=$hash}
        if ($hash -ne $identities[$name]) { throw 'Runtime module identity mismatch' }
    }
    Save 'prerequisite-modules.json' $modules
    Run-Clean (Join-Path $scratch 'Runtime.exe') ('"' + $qtSystem + '" "' + $out + '\runtime-gate.json"') 30000
    $products = @(Read-Msi $msi 'SELECT `Property`, `Value` FROM `Property`' @('property','value'))
    $product = @($products | Where-Object property -eq 'ProductCode')
    $files = @(Read-Msi $msi 'SELECT `FileName`, `Component_` FROM `File`' @('name','component'))
    $appFile = @($files | Where-Object { ($_.name -split '\|')[-1] -ieq 'kidpix3d.exe' })
    if ($product.Count -ne 1 -or $appFile.Count -ne 1) { throw 'Original MSI app key-file identity ambiguous' }
    $components = @(Read-Msi $msi 'SELECT `Component`, `ComponentId`, `KeyPath` FROM `Component`' @('component','id','keyPath'))
    $component = @($components | Where-Object component -eq $appFile[0].component)
    # ComponentPath resolves the key file, so verify that this executable is that key.
    $keyFiles = @(Read-Msi $msi 'SELECT `File`, `FileName` FROM `File`' @('key','name'))
    if ($component.Count -ne 1 -or -not $component[0].id -or @($keyFiles | Where-Object { $_.key -eq $component[0].keyPath -and ($_.name -split '\|')[-1] -ieq 'kidpix3d.exe' }).Count -ne 1) { throw 'Original executable is not an unambiguous component key file' }
    Install-Msi $msi
    $appPath = Installed-ComponentPath $product[0].value $component[0].id
    if (-not [IO.Path]::IsPathRooted($appPath) -or [IO.Path]::GetFileName($appPath) -ine 'kidpix3d.exe') { throw 'Installed original executable path invalid' }
    $app = Get-Item $appPath
    $appHash = (Get-FileHash $appPath -Algorithm SHA256).Hash.ToLowerInvariant()
    Save 'app-receipt.json' @{sha256=$appHash;fileVersion=$app.VersionInfo.FileVersion;productVersion=$app.VersionInfo.ProductVersion;installedPath=$app.FullName;workingDirectory=$app.Directory.FullName;pathSource='Windows Installer ComponentPath for verified MSI executable key file';filesUnchanged=$true}
    if ($appHash -ne 'a4be804b0f32cef3065ec2cca439c695224378bb58cac806bc196515e56dae04') { throw 'Installed original app identity mismatch' }
    if ($app.VersionInfo.FileVersion -notmatch '^2[.,]\s*2[.,]\s*1[.,]\s*271$') { throw 'Installed app version mismatch' }
    # This remains a required prelaunch cleanup gate; failure must stop execution.
    Remove-Item $msi,$qt -Force; Remove-Item $qtDir -Recurse -Force
    Save 'prelaunch-cleanup.json' @{quicktimeScratchRemoved=(-not (Test-Path $qtDir));msiRemoved=(-not (Test-Path $msi));comRecordsReleased=$true}
    Run-Clean (Join-Path $scratch 'Observe.exe') ('"' + $appPath + '" "' + $out + '"') 90000
} catch {
    Save 'blocker.json' @{type=$_.Exception.GetType().FullName;hresult=$_.Exception.HResult;message=$_.Exception.Message;elapsedMs=$clock.ElapsedMilliseconds;originalReferences='0/17'}
} finally {
    $cleanupErrors = @()
    foreach ($p in $script:owned) {
        try {
            if (-not $p.HasExited) { & "$env:windir\System32\taskkill.exe" /PID $p.Id /T /F | Out-Null; $p.WaitForExit(5000) | Out-Null }
        } catch { $cleanupErrors += $_.Exception.GetType().FullName + ':' + $_.Exception.HResult }
        finally { $p.Dispose() }
    }
    try { Remove-Item $scratch -Recurse -Force } catch { $cleanupErrors += $_.Exception.GetType().FullName + ':' + $_.Exception.HResult }
    Save 'cleanup.json' @{scratchRemoved=(-not (Test-Path $scratch));errors=$cleanupErrors;VMDisposalFinalBoundary=$true;trialStateReset=$false;elapsedMs=$clock.ElapsedMilliseconds}
    $files = @(Get-ChildItem $out -File)
    if (($files | Measure-Object Length -Sum).Sum -ge 50MB) { $files | Remove-Item -Force; Save 'size-limit.json' @{evidenceRemoved=$true} }
}
