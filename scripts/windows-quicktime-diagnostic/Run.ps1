$ErrorActionPreference = 'Stop'
$out = Join-Path $env:RUNNER_TEMP 'quicktime-diagnostic-evidence'
$scratch = Join-Path $env:RUNNER_TEMP ('QTDiagnostic-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force $out,$scratch | Out-Null
$clock = [Diagnostics.Stopwatch]::StartNew()
$script:receipts = @()
$script:owned = @()

function Save($name, $data) { $data | ConvertTo-Json -Depth 10 | Set-Content (Join-Path $out $name) }
function Run-Clean($file, $arguments, $milliseconds = 120000, $pathMode = 'windows', $allowFailure = $false) {
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
    if ($pathMode -eq 'trustedMachine') { $si.EnvironmentVariables['PATH'] = $script:trustedPath }
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
    if ($p.ExitCode -ne 0 -and -not $allowFailure) { throw ('Process stopped with exit code ' + $p.ExitCode) }
}
function Download($url,$name,$size,$sha) {
    $path = Join-Path $scratch $name
    Run-Clean "$env:windir\System32\curl.exe" ('--fail --location --silent --show-error --proto =https --proto-redir =https --max-time 180 --output "' + $path + '" "' + $url + '"') 190000
    $item = Get-Item $path; $hash = (Get-FileHash $path -Algorithm SHA256).Hash.ToLowerInvariant()
    $sig = Get-AuthenticodeSignature $path
    Save ($name + '-receipt.json') ([ordered]@{source=$url;bytes=$item.Length;sha256=$hash;fileVersion=$item.VersionInfo.FileVersion;signatureStatus=[string]$sig.Status;signatureSubject=if($sig.SignerCertificate){$sig.SignerCertificate.Subject}else{$null}})
    if ($item.Length -ne $size -or $hash -ne $sha) { throw 'Input identity mismatch before execution' }
    if ([string]$sig.Status -ne 'Valid' -or $sig.SignerCertificate.Subject -notmatch 'O=Apple Inc\.') { throw 'Apple Authenticode validation failed' }
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
function Install-Msi($path,$features='') {
    $args = '/i "' + $path + '" /qn /norestart'
    if ($features) { $args += ' ADDLOCAL="' + $features + '"' }
    Run-Clean "$env:windir\System32\msiexec.exe" $args 180000
}
try {
    $csc = "$env:windir\Microsoft.NET\Framework\v4.0.30319\csc.exe"
    Run-Clean $csc ('/nologo /target:exe /platform:x86 /reference:System.Web.Extensions.dll /out:"' + $scratch + '\Probe.exe" "' + $PSScriptRoot + '\Probe.cs"') 30000
    $qt = Download 'https://secure-appldnld.apple.com/QuickTime/031-43075-20160107-C0844134-B3CD-11E5-B1C0-43CA8D551951/QuickTimeInstaller.exe' 'QuickTimeInstaller.exe' 41896256 '56eff77b029b5f56c47d11fe58878627065dbeacbc3108d50d98a83420152c2b'
    $qtDir = Join-Path $scratch 'quicktime'; New-Item -ItemType Directory $qtDir | Out-Null
    Run-Clean 'C:\Program Files\7-Zip\7z.exe' ('x -y "' + $qt + '" -o"' + $qtDir + '"') 30000
    $qtMsi = Join-Path $qtDir 'QuickTime.msi'
    if ((Get-FileHash $qtMsi -Algorithm SHA256).Hash.ToLowerInvariant() -ne '03ea287b99df2605a9d32b0fe9096d811b8c7ed1654f822ff76f7e172e0ed0b8') { throw 'QuickTime MSI identity mismatch' }
    Save 'msi-rows.json' @{
        features=@(Read-Msi $qtMsi 'SELECT `Feature`, `Title` FROM `Feature`' @('feature','title'))
        registry=@(Read-Msi $qtMsi "SELECT ``Name``, ``Value``, ``Component_`` FROM ``Registry`` WHERE ``Component_`` = 'QuickTime.qts'" @('name','value','component'))
    }
    Install-Msi (Join-Path $qtDir 'AppleApplicationSupport.msi')
    Install-Msi $qtMsi 'QuickTimeEssentials'
    $qtRoot = Join-Path ${env:ProgramFiles(x86)} 'QuickTime'
    $aasRoot = Join-Path ${env:CommonProgramFiles(x86)} 'Apple\Apple Application Support'
    $roots = @($env:windir,$qtRoot,$aasRoot)
    $trusted = @(); $membership = @()
    foreach ($entry in ([Environment]::GetEnvironmentVariable('PATH','Machine') -split ';')) {
        $p = [Environment]::ExpandEnvironmentVariables($entry.Trim().Trim('"')).TrimEnd('\')
        if (-not $p -or -not [IO.Path]::IsPathRooted($p)) { continue }
        foreach ($root in $roots) {
            if ($p -ieq $root -or $p.StartsWith($root + '\',[StringComparison]::OrdinalIgnoreCase)) {
                $trusted += $p
                $membership += @{path=$p;exists=(Test-Path $p -PathType Container);source='actual post-installer machine PATH'}
                break
            }
        }
    }
    $script:trustedPath = ($trusted | Select-Object -Unique) -join ';'
    Save 'path-membership.json' @{trustedMachineEntries=$membership;priorWrapperWindowsOnly=$true;qtSystemInMachinePath=($trusted -icontains (Join-Path $qtRoot 'QTSystem'));unrelatedEntriesOmitted=$true;environmentChanged=$false}
    $qtSystem = Join-Path $qtRoot 'QTSystem'
    Save 'installed-files.json' @(Get-ChildItem $qtSystem,$aasRoot -File | Where-Object { $_.Extension -in @('.dll','.qts') } | ForEach-Object { @{path=$_.FullName;bytes=$_.Length;version=$_.VersionInfo.FileVersion;sha256=(Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()} })
    $probe = Join-Path $scratch 'Probe.exe'
    Run-Clean $probe ('inventory "' + $out + '\inventory.json"') 30000
    foreach ($pathMode in @('windows','trustedMachine')) {
        foreach ($search in @('normal','forcedDirectory')) {
            $id = 'qts-' + $pathMode + '-' + $search
            Run-Clean $probe ('qts ' + $search + ' ' + $pathMode + ' "' + $out + '\' + $id + '.json"') 30000 $pathMode $true
            foreach ($flags in @(0,2)) {
                $id = 'qtml-' + $pathMode + '-' + $search + '-' + $flags
                Run-Clean $probe ('qtml ' + $search + ' ' + $pathMode + ' ' + $flags + ' "' + $out + '\' + $id + '.json"') 30000 $pathMode $true
            }
        }
    }
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
    Save 'cleanup.json' @{scratchRemoved=(-not (Test-Path $scratch));errors=$cleanupErrors;VMDisposalFinalBoundary=$true;originalAppLaunched=$false;elapsedMs=$clock.ElapsedMilliseconds}
    $files = @(Get-ChildItem $out -File)
    if (($files | Measure-Object Length -Sum).Sum -gt 10MB) {
        $files | Remove-Item -Force
        Save 'size-limit.json' @{evidenceRemoved=$true;limitBytes=10485760}
    }
}
