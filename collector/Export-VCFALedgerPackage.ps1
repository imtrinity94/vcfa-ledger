<#
.SYNOPSIS
    VCFA Ledger collector - exports the customer-customisable content of one
    VCF Automation 9.x VM Apps organization into a .vcfapkg package.

.DESCRIPTION
    Logs into one VM Apps organization and captures, read-only (GET calls only):
      - Cloud templates (current content + every version)
      - Catalog content sources, catalog items and their custom request forms
      - Policies (approval, lease, day-2 actions, content sharing, quota, limits ...)
      - Extensibility subscriptions (topic, condition, blocking, priority, runnable)
        plus the event topics they use
      - ABX actions and action flows (with source code)
      - Property groups
      - Custom resource types and resource (day-2) actions
      - Projects (reference only, so scopes can be resolved by name)

    Output is a folder of readable JSON / YAML / source files (ideal for git) plus
    a zipped copy of the same folder with the .vcfapkg extension, which is what
    the VCFA Ledger viewer opens.

    Use -Select to pick objects (Out-GridView on Windows, console menu elsewhere).
    Related objects are pulled in automatically, e.g. the ABX action behind a
    selected subscription or the cloud template behind a selected catalog item.

    Runs on Windows PowerShell 5.1 (also works on PowerShell 7).

.EXAMPLE
    .\Export-VCFALedgerPackage.ps1
    Prompts for FQDN, organization and credentials, exports everything.

.EXAMPLE
    .\Export-VCFALedgerPackage.ps1 -Fqdn auto.vmw.lab -Organization lab -SkipCertificateCheck -Select

.EXAMPLE
    .\Export-VCFALedgerPackage.ps1 -Fqdn auto.vmw.lab -Organization lab -UseApiToken
#>
[CmdletBinding()]
param(
    [string]$Fqdn,
    [string]$Organization,
    [System.Management.Automation.PSCredential]$Credential,
    [switch]$UseApiToken,
    [switch]$SkipCertificateCheck,
    [switch]$Select,
    [switch]$SkipTemplateVersions,
    [switch]$IncludeSystemSubscriptions,
    [switch]$NoArchive,
    [string]$OutputPath
)

$ErrorActionPreference = 'Stop'
$ToolName    = 'VCFA Ledger Collector'
$ToolVersion = '2026.1.1'
$FormatVersion = '1.0'

# =====================================================================================
#  Optional preset - fill in to skip prompts on repeat runs (leave empty to be asked)
# =====================================================================================
$Preset = @{
    Fqdn                 = ''      # e.g. 'auto.vmw.lab'
    Organization         = ''      # VM Apps organization name
    SkipCertificateCheck = $false
    Username             = ''      # without @org is fine
    Password             = ''      # plain text, or leave empty and use PasswordFile
    PasswordFile         = ''      # file made with: Read-Host -AsSecureString | ConvertFrom-SecureString | Set-Content pw.txt
}

# =====================================================================================
#  Helpers - general
# =====================================================================================

function Write-Step([string]$Text) { Write-Host ''; Write-Host "== $Text" -ForegroundColor Cyan }

function Get-P($Obj, [string[]]$Names) {
    if ($null -eq $Obj) { return $null }
    foreach ($n in $Names) {
        $p = $Obj.PSObject.Properties[$n]
        if ($p -and $null -ne $p.Value -and "$($p.Value)" -ne '') { return $p.Value }
    }
    return $null
}

function Get-StatusCode($Err) {
    try {
        $r = $Err.Exception.Response
        if ($r) { return [int]$r.StatusCode }
    } catch { }
    return 0
}

function Get-ErrMsg($Err) {
    $code = Get-StatusCode $Err
    $msg = $Err.Exception.Message
    if ($Err.ErrorDetails -and $Err.ErrorDetails.Message) {
        $d = $Err.ErrorDetails.Message
        try {
            $j = $d | ConvertFrom-Json
            $m = Get-P $j @('message', 'serverMessage', 'error_description', 'error')
            if ($m) { $d = "$m" }
        } catch { }
        if ($d.Length -gt 300) { $d = $d.Substring(0, 300) + '...' }
        $msg = $d
    }
    if ($code) { return "HTTP $code - $msg" }
    return $msg
}

function ConvertTo-SafeName([string]$Name, [string]$Fallback = 'unnamed') {
    if (-not $Name) { $Name = $Fallback }
    $invalid = [IO.Path]::GetInvalidFileNameChars() + [char[]]'/\:*?"<>|'
    $sb = New-Object System.Text.StringBuilder
    foreach ($ch in $Name.ToCharArray()) {
        if ($invalid -contains $ch) { [void]$sb.Append('_') } else { [void]$sb.Append($ch) }
    }
    $s = ($sb.ToString() -replace '\s+', ' ').Trim().TrimEnd('.')
    if ($s.Length -gt 80) { $s = $s.Substring(0, 80).Trim() }
    if (-not $s) { $s = $Fallback }
    return $s
}

$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Save-Text([string]$RelPath, [string]$Text) {
    $full = Join-Path $script:PkgDir ($RelPath -replace '/', [IO.Path]::DirectorySeparatorChar)
    $dir = Split-Path $full -Parent
    if (-not (Test-Path $dir)) { [void](New-Item -ItemType Directory -Path $dir -Force) }
    if ($null -eq $Text) { $Text = '' }
    [IO.File]::WriteAllText($full, $Text, $Utf8NoBom)
}

function ConvertTo-PrettyJson($Obj) {
    $j = ConvertTo-Json -InputObject $Obj -Depth 100
    # Windows PowerShell 5.1 escapes these characters; unescape for readability (still valid JSON)
    $j = $j -replace '\\u003c', '<' -replace '\\u003e', '>' -replace '\\u0026', '&' -replace '\\u0027', "'"
    return $j
}

function Save-Json([string]$RelPath, $Obj) { Save-Text $RelPath (ConvertTo-PrettyJson $Obj) }

# Unique relative path per object type (two objects with the same name get an id suffix)
function Get-ObjPath([string]$Folder, [string]$Name, [string]$Id, [string]$Ext) {
    $base = ConvertTo-SafeName $Name $Id
    $key = "$Folder/$base".ToLowerInvariant()
    if ($script:UsedPaths.ContainsKey($key)) {
        $short = if ($Id -and $Id.Length -ge 8) { $Id.Substring(0, 8) } else { "$($script:UsedPaths.Count)" }
        $base = "$base ($short)"
        $key = "$Folder/$base".ToLowerInvariant()
    }
    $script:UsedPaths[$key] = $true
    if ($Ext) { return "$Folder/$base$Ext" }
    return "$Folder/$base"
}

# =====================================================================================
#  Helpers - REST
# =====================================================================================

function Initialize-Tls {
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    } catch { }
    if ($script:Conn.Skip -and $PSVersionTable.PSVersion.Major -lt 6) {
        if (-not ('LedgerTrustAll' -as [type])) {
            Add-Type -TypeDefinition @"
using System.Net;
using System.Security.Cryptography.X509Certificates;
public class LedgerTrustAll : ICertificatePolicy {
    public bool CheckValidationResult(ServicePoint sp, X509Certificate cert, WebRequest req, int problem) { return true; }
}
"@
        }
        [Net.ServicePointManager]::CertificatePolicy = New-Object LedgerTrustAll
    }
}

function Get-WebOpts {
    $o = @{ UseBasicParsing = $true }
    if ($script:Conn.Skip -and $PSVersionTable.PSVersion.Major -ge 6) { $o.SkipCertificateCheck = $true }
    return $o
}

function Get-Header($Resp, [string]$Name) {
    foreach ($k in $Resp.Headers.Keys) {
        if ($k -ieq $Name) { return (@($Resp.Headers[$k]) | Select-Object -First 1) }
    }
    return $null
}

function Get-PlainText([Security.SecureString]$Sec) {
    $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Sec)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}

function Connect-Vcfa {
    $base = $script:Conn.Base
    $wo = Get-WebOpts
    if ($UseApiToken) {
        if (-not $script:ApiTokenPlain) {
            $sec = Read-Host -AsSecureString "API token for organization '$Organization'"
            $script:ApiTokenPlain = Get-PlainText $sec
        }
        $r = Invoke-RestMethod @wo -Method Post -Uri "$base/oauth/tenant/$Organization/token" `
            -Body @{ grant_type = 'refresh_token'; refresh_token = $script:ApiTokenPlain } `
            -ContentType 'application/x-www-form-urlencoded' -Headers @{ Accept = 'application/json' }
        $script:AuthInfo = 'API token (/oauth/tenant)'
        return $r.access_token
    }
    $user = $Credential.UserName
    if ($user -notmatch "@$([regex]::Escape($Organization))$") { $user = "$user@$Organization" }
    $pass = $Credential.GetNetworkCredential().Password
    $basic = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("${user}:$pass"))
    $lastErr = $null
    $versions = @('40.0', '41.0', '39.1', '39.0')
    if ($script:Conn.CloudApiVersion) { $versions = @($script:Conn.CloudApiVersion) + $versions }
    foreach ($ver in $versions) {
        try {
            $resp = Invoke-WebRequest @wo -Method Post -Uri "$base/cloudapi/1.0.0/sessions" `
                -Headers @{ Accept = "application/json;version=$ver"; Authorization = "Basic $basic" }
            $tok = Get-Header $resp 'x-vmware-vcloud-access-token'
            if ($tok) {
                $script:AuthInfo = "cloudapi session (API version $ver) as $user"
                $script:Conn.CloudApiVersion = $ver
                return $tok
            }
        }
        catch {
            $lastErr = $_
            if ((Get-StatusCode $_) -eq 401) { break }
        }
    }
    if ($lastErr) { throw "Login failed: $(Get-ErrMsg $lastErr)" }
    throw 'Login failed: no access token returned.'
}

function Invoke-Vcfa([string]$Path) {
    $wo = Get-WebOpts
    $uri = "$($script:Conn.Base)$Path"
    for ($attempt = 0; $attempt -lt 2; $attempt++) {
        try {
            return Invoke-RestMethod @wo -Method Get -Uri $uri `
                -Headers @{ Authorization = "Bearer $($script:Conn.Token)"; Accept = 'application/json' }
        }
        catch {
            if ($attempt -eq 0 -and (Get-StatusCode $_) -eq 401) {
                Write-Verbose 'Token expired - logging in again'
                $script:Conn.Token = Connect-Vcfa
                continue
            }
            throw
        }
    }
}

function Get-Items($R) {
    if ($null -eq $R) { return , @() }
    if ($R -is [array]) { return , $R }
    $p = $R.PSObject.Properties['content']
    if ($p) { if ($null -eq $p.Value) { return , @() } else { return , @($p.Value) } }
    $p = $R.PSObject.Properties['documents']
    if ($p -and $p.Value) { return , @($p.Value.PSObject.Properties | ForEach-Object { $_.Value }) }
    return , @($R)
}

function Get-All([string]$Path, [int]$PageSize = 200) {
    $sep = if ($Path.Contains('?')) { '&' } else { '?' }
    $all = New-Object System.Collections.Generic.List[object]
    $iaas = $Path.StartsWith('/iaas/')
    for ($i = 0; $i -lt 500; $i++) {
        $q = if ($iaas) { "`$top=$PageSize&`$skip=$($i * $PageSize)" } else { "page=$i&size=$PageSize" }
        try { $r = Invoke-Vcfa "$Path$sep$q" }
        catch {
            if ($i -eq 0 -and (Get-StatusCode $_) -eq 400) {
                foreach ($x in (Get-Items (Invoke-Vcfa $Path))) { $all.Add($x) }
                break
            }
            throw
        }
        $batch = Get-Items $r
        foreach ($x in $batch) { $all.Add($x) }
        if ($r -is [array] -or $batch.Count -lt $PageSize) { break }
        if ($r.PSObject.Properties['last'] -and $r.last -eq $true) { break }
        if ($r.PSObject.Properties['totalElements'] -and $all.Count -ge [int]$r.totalElements) { break }
    }
    return , $all.ToArray()
}

function Add-Log($Section, $Endpoint, $Status, $Count, $Message) {
    $script:Log.Add([ordered]@{ section = $Section; endpoint = $Endpoint; status = $Status; count = $Count; message = $Message })
}

# Run a list call; on failure log it and return an empty list (one broken API never stops the export)
function Get-Section([string]$Section, [string]$Endpoint, [scriptblock]$Script) {
    Write-Host ('  {0,-26}' -f $Section) -NoNewline
    try {
        if ($Script) { $res = @(& $Script) } else { $res = Get-All $Endpoint }
        Write-Host "OK ($(@($res).Count))" -ForegroundColor Green
        Add-Log $Section $Endpoint 'OK' @($res).Count ''
        return , @($res)
    }
    catch {
        $m = Get-ErrMsg $_
        # 404, or a 500 that wraps a 404 (VCFA 9 answers unknown endpoints with "No static resource ...")
        if ((Get-StatusCode $_) -eq 404 -or $m -match 'NOT_FOUND|No static resource') {
            Write-Host 'not available on this server' -ForegroundColor Gray
            Add-Log $Section $Endpoint 'NOT_AVAILABLE' 0 $m
            return , @()
        }
        Write-Host "FAILED  $m" -ForegroundColor Yellow
        Add-Log $Section $Endpoint 'FAILED' 0 $m
        return , @()
    }
}

# Single GET that never throws; failures are logged against the object
function Get-Safe([string]$Section, [string]$Endpoint, [switch]$Quiet404) {
    try { return Invoke-Vcfa $Endpoint }
    catch {
        $code = Get-StatusCode $_
        if (-not ($Quiet404 -and $code -eq 404)) { Add-Log $Section $Endpoint 'FAILED' 0 (Get-ErrMsg $_) }
        return $null
    }
}

# =====================================================================================
#  Selection
# =====================================================================================

function ConvertFrom-RangeText([string]$Text, [int]$Max) {
    $set = New-Object System.Collections.Generic.HashSet[int]
    foreach ($part in ($Text -split ',')) {
        $p = $part.Trim()
        if ($p -match '^(\d+)\s*-\s*(\d+)$') {
            for ($n = [int]$Matches[1]; $n -le [int]$Matches[2]; $n++) { if ($n -ge 1 -and $n -le $Max) { [void]$set.Add($n) } }
        }
        elseif ($p -match '^\d+$') { $n = [int]$p; if ($n -ge 1 -and $n -le $Max) { [void]$set.Add($n) } }
    }
    return $set
}

function Select-Inventory($Inventory) {
    $useGrid = $false
    if (Get-Command Out-GridView -ErrorAction SilentlyContinue) {
        if ($PSVersionTable.PSVersion.Major -lt 6 -or $IsWindows) { $useGrid = $true }
    }
    if ($useGrid) {
        Write-Host '  Pick the objects to export in the grid window (Ctrl/Shift for multiple, then OK).' -ForegroundColor Gray
        $picked = @($Inventory | Select-Object Category, Name, Project, Detail, Key |
            Out-GridView -Title 'VCFA Ledger - select objects to export (related objects are added automatically)' -PassThru)
        $keys = @{}
        foreach ($p in $picked) { $keys[$p.Key] = $true }
        return $keys
    }
    $keys = @{}
    foreach ($grp in ($Inventory | Group-Object Category)) {
        Write-Host ''
        Write-Host "  $($grp.Name) ($($grp.Count))" -ForegroundColor Cyan
        $items = @($grp.Group)
        for ($i = 0; $i -lt $items.Count; $i++) {
            $extra = if ($items[$i].Project) { "  [$($items[$i].Project)]" } else { '' }
            Write-Host ('    {0,3}. {1}{2}' -f ($i + 1), $items[$i].Name, $extra)
        }
        $ans = Read-Host '  Export which? (a = all, blank = none, e.g. 1,3-5)'
        if ($ans -match '^\s*a(ll)?\s*$') { foreach ($it in $items) { $keys[$it.Key] = $true } }
        elseif ($ans.Trim()) {
            foreach ($n in (ConvertFrom-RangeText $ans $items.Count)) { $keys[$items[$n - 1].Key] = $true }
        }
    }
    return $keys
}

# =====================================================================================
#  Start
# =====================================================================================

Write-Host ''
Write-Host "  $ToolName $ToolVersion" -ForegroundColor White
Write-Host '  VCF Automation 9.x - VM Apps organization export (read-only)' -ForegroundColor Gray

if (-not $Fqdn -and $Preset.Fqdn) { $Fqdn = $Preset.Fqdn }
if (-not $Organization -and $Preset.Organization) { $Organization = $Preset.Organization }
if (-not $SkipCertificateCheck -and $Preset.SkipCertificateCheck) { $SkipCertificateCheck = $true }

if (-not $Fqdn) { $Fqdn = Read-Host 'VCF Automation FQDN (e.g. auto.vmw.lab)' }
$Fqdn = ($Fqdn -replace '^https?://', '').TrimEnd('/')
if (-not $Organization) { $Organization = Read-Host 'VM Apps organization name' }
if (-not $Fqdn -or -not $Organization) { throw 'FQDN and organization are required.' }

if (-not $PSBoundParameters.ContainsKey('SkipCertificateCheck') -and -not $Preset.SkipCertificateCheck) {
    $a = Read-Host 'Skip TLS certificate check (lab / self-signed)? [y/N]'
    if ($a -match '^\s*y') { $SkipCertificateCheck = $true }
}

if (-not $UseApiToken -and -not $Credential) {
    if ($Preset.Username -and ($Preset.Password -or $Preset.PasswordFile)) {
        if ($Preset.PasswordFile) { $sec = Get-Content $Preset.PasswordFile | ConvertTo-SecureString }
        else { $sec = ConvertTo-SecureString $Preset.Password -AsPlainText -Force }
        $Credential = New-Object System.Management.Automation.PSCredential($Preset.Username, $sec)
    }
    else {
        $Credential = Get-Credential -Message "VCF Automation credentials for organization '$Organization' (user or user@$Organization)"
    }
    if (-not $Credential) { throw 'No credentials supplied.' }
}

$script:Conn = @{ Base = "https://$Fqdn"; Skip = [bool]$SkipCertificateCheck; Token = $null; CloudApiVersion = $null }
$script:Log = New-Object System.Collections.Generic.List[object]
$script:UsedPaths = @{}
$script:AuthInfo = ''
Initialize-Tls

Write-Step "Logging in to $Fqdn / $Organization"
$script:Conn.Token = Connect-Vcfa
Write-Host "  OK - $($script:AuthInfo)" -ForegroundColor Green

$about = Get-Safe 'about' '/iaas/api/about'
$apiVersion = Get-P $about @('latestApiVersion')

# =====================================================================================
#  1. Inventory (list calls)
# =====================================================================================

Write-Step 'Reading inventory'
$projects      = Get-Section 'Projects'            '/project-service/api/projects'
if ($projects.Count -eq 0) { $projects = Get-Section 'Projects (iaas)' '/iaas/api/projects' }
$blueprints    = Get-Section 'Cloud templates'     '/blueprint/api/blueprints'
$sources       = Get-Section 'Content sources'     '/catalog/api/admin/sources'
$items         = Get-Section 'Catalog items'       '/catalog/api/admin/items'
$policies      = Get-Section 'Policies'            '/policy/api/policies?expandDefinition=true'
$subsAll       = Get-Section 'Subscriptions'       '/event-broker/api/subscriptions'
$topics        = Get-Section 'Event topics'        '/event-broker/api/topics'
$abxActions    = Get-Section 'ABX actions'         '/abx/api/resources/actions'
$abxFlows      = Get-Section 'ABX action flows'    '/abx/api/resources/action-flows'
$propGroups    = Get-Section 'Property groups'     '/properties/api/property-groups'
$customTypes   = Get-Section 'Custom resources'    '/form-service/api/custom/resource-types'
$resActions    = Get-Section 'Resource actions'    '/form-service/api/custom/resource-actions'

$projName = @{}
foreach ($p in $projects) { if ($p.id) { $projName["$($p.id)"] = "$($p.name)" } }
function Get-ProjName($Id) { if ($Id -and $projName.ContainsKey("$Id")) { return $projName["$Id"] } return $null }

$subs = @($subsAll | Where-Object { $IncludeSystemSubscriptions -or -not ($_.system -eq $true -or $_.type -eq 'SUBSCRIBABLE') })
$skippedSys = $subsAll.Count - $subs.Count
if ($skippedSys -gt 0) { Write-Host "  (left out $skippedSys system subscription(s); use -IncludeSystemSubscriptions to keep them)" -ForegroundColor Gray }

# Generic inventory list used for selection and dependency resolution
$inventory = New-Object System.Collections.Generic.List[object]
function Add-Inv($Category, $Kind, $Obj, $Detail) {
    $id = "$(Get-P $Obj @('id', 'name'))"
    $inventory.Add([pscustomobject]@{
        Category = $Category; Kind = $Kind; Id = $id; Name = "$(Get-P $Obj @('name', 'displayName', 'id'))"
        Project = Get-ProjName (Get-P $Obj @('projectId')); Detail = $Detail; Key = "$Kind|$id"; Obj = $Obj
    })
}
foreach ($o in $blueprints)  { Add-Inv 'Cloud templates'   'template'        $o "$(Get-P $o @('status'))" }
foreach ($o in $sources)     { Add-Inv 'Content sources'   'content-source'  $o "$(Get-P $o @('typeId'))" }
foreach ($o in $items)       { Add-Inv 'Catalog items'     'catalog-item'    $o "$(Get-P $o.type @('name', 'id'))" }
foreach ($o in $policies)    { Add-Inv 'Policies'          'policy'          $o "$(Get-P $o @('typeId'))" }
foreach ($o in $subs)        { Add-Inv 'Subscriptions'     'subscription'    $o "$(Get-P $o @('eventTopicId'))" }
foreach ($o in $abxActions)  { Add-Inv 'ABX actions'       'abx-action'      $o "$(Get-P $o @('runtime'))" }
foreach ($o in $abxFlows)    { Add-Inv 'ABX action flows'  'abx-flow'        $o '' }
foreach ($o in $propGroups)  { Add-Inv 'Property groups'   'property-group'  $o "$(Get-P $o @('type'))" }
foreach ($o in $customTypes) { Add-Inv 'Custom resources'  'custom-resource' $o "$(Get-P $o @('resourceType'))" }
foreach ($o in $resActions)  { Add-Inv 'Resource actions'  'resource-action' $o "$(Get-P $o @('resourceType'))" }

# =====================================================================================
#  2. Selection + dependency resolution
# =====================================================================================

$byKey = @{}
foreach ($i in $inventory) { $byKey[$i.Key] = $i }

if ($Select) {
    Write-Step 'Select objects'
    $selected = Select-Inventory $inventory
    if ($selected.Count -eq 0) { Write-Host '  Nothing selected - exiting.' -ForegroundColor Yellow; return }
}
else {
    $selected = @{}
    foreach ($i in $inventory) { $selected[$i.Key] = $true }
}
$userPicked = @{}
foreach ($k in $selected.Keys) { $userPicked[$k] = $true }

# Links: from -> to, found by scanning each object's JSON for ids / names of other objects
$links = New-Object System.Collections.Generic.List[object]
$linkSeen = @{}
function Add-Link($From, $To, $Rel) {
    $k = "$From>$To"
    if ($linkSeen.ContainsKey($k)) { return }
    $linkSeen[$k] = $true
    $links.Add([ordered]@{ from = $From; to = $To; rel = $Rel })
}

$idTargets = @($inventory | Where-Object { $_.Kind -in @('abx-action', 'abx-flow', 'template', 'custom-resource') -and $_.Id.Length -ge 8 })
$pgByName = @{}
foreach ($i in ($inventory | Where-Object Kind -eq 'property-group')) { $pgByName[$i.Name] = $i }
$crByType = @{}
foreach ($i in ($inventory | Where-Object Kind -eq 'custom-resource')) { $t = Get-P $i.Obj @('resourceType'); if ($t) { $crByType["$t"] = $i } }

function Resolve-Links($Inv, [string]$Text) {
    foreach ($t in $idTargets) {
        if ($t.Key -ne $Inv.Key -and $Text.Contains($t.Id)) {
            $rel = switch ($t.Kind) { 'template' { 'uses-template' } 'custom-resource' { 'uses-custom-resource' } default { 'runs' } }
            Add-Link $Inv.Key $t.Key $rel
        }
    }
    foreach ($m in [regex]::Matches($Text, 'propertyGroups\.([A-Za-z0-9_\-]+)')) {
        $n = $m.Groups[1].Value
        if ($pgByName.ContainsKey($n)) { Add-Link $Inv.Key $pgByName[$n].Key 'uses-property-group' }
    }
    foreach ($m in [regex]::Matches($Text, '(Custom\.[A-Za-z0-9_\.\-]+)')) {
        $n = $m.Groups[1].Value.TrimEnd('.')
        if ($crByType.ContainsKey($n) -and $crByType[$n].Key -ne $Inv.Key) { Add-Link $Inv.Key $crByType[$n].Key 'uses-custom-resource' }
    }
}

# Catalog item -> template: VCT catalog items carry the template id
foreach ($i in ($inventory | Where-Object Kind -eq 'catalog-item')) {
    $bpKey = "template|$($i.Id)"
    if ($byKey.ContainsKey($bpKey)) { Add-Link $i.Key $bpKey 'publishes' }
    $srcId = Get-P $i.Obj @('sourceId')
    if ($srcId -and $byKey.ContainsKey("content-source|$srcId")) { Add-Link $i.Key "content-source|$srcId" 'from-source' }
}
# Scan list objects that already carry their full definition
foreach ($i in $inventory) {
    if ($i.Kind -in @('subscription', 'policy', 'resource-action', 'custom-resource', 'abx-flow', 'catalog-item')) {
        Resolve-Links $i (ConvertTo-Json -InputObject $i.Obj -Depth 30 -Compress)
    }
}

# =====================================================================================
#  3. Detail calls for selected objects (templates need their content before linking)
# =====================================================================================

Write-Step 'Reading details'
$details = @{}
$tplVersions = @{}

# Pull in related objects of the current selection until nothing new is added
function Expand-Selection {
    $changed = $true
    while ($changed) {
        $changed = $false
        foreach ($l in $links.ToArray()) {
            if ($selected.ContainsKey($l.from) -and -not $selected.ContainsKey($l.to) -and $l.rel -ne 'from-source') {
                $selected[$l.to] = $true; $changed = $true
            }
        }
    }
}
Expand-Selection

$pass = 0
do {
    $pass++
    $before = $selected.Count
    foreach ($i in @($inventory | Where-Object { $selected.ContainsKey($_.Key) -and -not $details.ContainsKey($_.Key) })) {
        switch ($i.Kind) {
            'template' {
                Write-Host "  template   $($i.Name)"
                $d = Get-Safe 'Cloud template' "/blueprint/api/blueprints/$($i.Id)"
                if (-not $d) { $d = $i.Obj }
                $details[$i.Key] = $d
                $vers = @()
                if (-not $SkipTemplateVersions) {
                    try { $vers = Get-All "/blueprint/api/blueprints/$($i.Id)/versions" } catch { Add-Log 'Template versions' $i.Name 'FAILED' 0 (Get-ErrMsg $_) }
                    $full = New-Object System.Collections.Generic.List[object]
                    foreach ($v in $vers) {
                        $vid = Get-P $v @('version', 'id')
                        $vd = $null
                        if (-not (Get-P $v @('content'))) { $vd = Get-Safe 'Template version' "/blueprint/api/blueprints/$($i.Id)/versions/$([uri]::EscapeDataString("$vid"))" }
                        if ($vd) { $full.Add($vd) } else { $full.Add($v) }
                    }
                    $vers = $full.ToArray()
                }
                $tplVersions[$i.Key] = $vers
                $txt = "$(Get-P $d @('content'))"
                foreach ($v in $vers) { $txt += "`n$(Get-P $v @('content'))" }
                Resolve-Links $i $txt
            }
            'abx-action' {
                Write-Host "  abx        $($i.Name)"
                $pid0 = Get-P $i.Obj @('projectId')
                $q = if ($pid0) { "?projectId=$pid0" } else { '' }
                $d = Get-Safe 'ABX action' "/abx/api/resources/actions/$($i.Id)$q"
                if (-not $d) { $d = $i.Obj }
                $details[$i.Key] = $d
            }
            'abx-flow' {
                $pid0 = Get-P $i.Obj @('projectId')
                $q = if ($pid0) { "?projectId=$pid0" } else { '' }
                $d = Get-Safe 'ABX action flow' "/abx/api/resources/action-flows/$($i.Id)$q"
                if (-not $d) { $d = $i.Obj }
                $details[$i.Key] = $d
                Resolve-Links $i (ConvertTo-Json -InputObject $d -Depth 30 -Compress)
            }
            'catalog-item' {
                Write-Host "  catalog    $($i.Name)"
                $d = Get-Safe 'Catalog item' "/catalog/api/admin/items/$($i.Id)"
                if (-not $d) { $d = $i.Obj }
                $typeId = Get-P $d.type @('id')
                $form = $null
                $formId = Get-P $d @('formId')
                if ($formId) { $form = Get-Safe 'Custom form' "/form-service/api/forms/$formId" -Quiet404 }
                if (-not $form -and $typeId) {
                    $form = Get-Safe 'Custom form' ("/form-service/api/forms/fetchBySourceAndType?formType=requestForm&sourceType=$([uri]::EscapeDataString($typeId))&sourceId=$($i.Id)") -Quiet404
                }
                $details[$i.Key] = [pscustomobject]@{ item = $d; form = $form }
            }
            default { $details[$i.Key] = $i.Obj }
        }
    }
    Expand-Selection
} while ($selected.Count -gt $before -and $pass -lt 10)

# =====================================================================================
#  4. Write package folder
# =====================================================================================

$stamp = Get-Date -Format 'yyyyMMdd'
if (-not $OutputPath) { $OutputPath = (Get-Location).Path }
# Resolve to a full path: .NET file calls in Windows PowerShell do not follow the PowerShell location
$OutputPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath)
$orgDir = Join-Path $OutputPath "VM Apps - $(ConvertTo-SafeName $Organization)"
if (-not (Test-Path $orgDir)) { [void](New-Item -ItemType Directory -Path $orgDir -Force) }
$baseName = "$(ConvertTo-SafeName $Organization)_$stamp"
$name = $baseName; $n = 1
while ((Test-Path (Join-Path $orgDir $name)) -or (Test-Path (Join-Path $orgDir "$name.vcfapkg"))) { $n++; $name = "${baseName}_$n" }
$script:PkgDir = Join-Path $orgDir $name
[void](New-Item -ItemType Directory -Path $script:PkgDir -Force)

Write-Step "Writing package $name"
$objects = New-Object System.Collections.Generic.List[object]
$pathByKey = @{}

$abxExt = @{ python = '.py'; nodejs = '.js'; powershell = '.ps1' }
$runtimeKeyFn = { param($r) $x = "$r".ToLowerInvariant(); foreach ($k in $abxExt.Keys) { if ($x.StartsWith($k)) { return $k } }; return $null }

foreach ($i in @($inventory | Where-Object { $selected.ContainsKey($_.Key) })) {
    $d = $details[$i.Key]; if (-not $d) { $d = $i.Obj }
    $files = New-Object System.Collections.Generic.List[string]
    $meta = [ordered]@{}
    switch ($i.Kind) {
        'template' {
            $dir = Get-ObjPath 'templates' $i.Name $i.Id ''
            $content = Get-P $d @('content')
            $copy = $d | Select-Object * -ExcludeProperty content
            Save-Json "$dir/template.json" $copy; $files.Add("$dir/template.json")
            if ($content) { Save-Text "$dir/content.yaml" "$content"; $files.Add("$dir/content.yaml") }
            $vlist = New-Object System.Collections.Generic.List[object]
            foreach ($v in @($tplVersions[$i.Key])) {
                $vid = "$(Get-P $v @('version', 'id'))"
                if (-not $vid) { continue }
                $vn = ConvertTo-SafeName $vid
                $vc = Get-P $v @('content')
                $vmeta = $v | Select-Object * -ExcludeProperty content
                Save-Json "$dir/versions/$vn.json" $vmeta; $files.Add("$dir/versions/$vn.json")
                if ($vc) { Save-Text "$dir/versions/$vn.yaml" "$vc"; $files.Add("$dir/versions/$vn.yaml") }
                $vlist.Add([ordered]@{ version = $vid; status = Get-P $v @('status'); released = (Get-P $v @('status')) -eq 'RELEASED' })
            }
            $meta.versions = $vlist.ToArray()
            $meta.requestScopeOrg = Get-P $d @('requestScopeOrg')
            $mainPath = "$dir/template.json"
        }
        'catalog-item' {
            $mainPath = Get-ObjPath 'catalog/items' $i.Name $i.Id '.json'
            Save-Json $mainPath $d.item; $files.Add($mainPath)
            if ($d.form) {
                $fp = $mainPath -replace '\.json$', '.form.json'
                Save-Json $fp $d.form; $files.Add($fp)
                $meta.hasCustomForm = $true
            }
            $meta.type = Get-P $d.item.type @('id')
            $meta.projects = @(@(Get-P $d.item @('projectIds')) | ForEach-Object { Get-ProjName $_ } | Where-Object { $_ })
        }
        'content-source' {
            $mainPath = Get-ObjPath 'catalog/sources' $i.Name $i.Id '.json'
            Save-Json $mainPath $d; $files.Add($mainPath)
            $meta.typeId = Get-P $d @('typeId')
        }
        'policy' {
            $t = "$(Get-P $d @('typeId'))" -replace '^com\.vmware\.policy\.', ''
            if (-not $t) { $t = 'other' }
            $mainPath = Get-ObjPath "policies/$(ConvertTo-SafeName $t)" $i.Name $i.Id '.json'
            Save-Json $mainPath $d; $files.Add($mainPath)
            $meta.typeId = Get-P $d @('typeId'); $meta.enforcementType = Get-P $d @('enforcementType')
        }
        'subscription' {
            $mainPath = Get-ObjPath 'subscriptions' $i.Name $i.Id '.json'
            Save-Json $mainPath $d; $files.Add($mainPath)
            $meta.eventTopicId = Get-P $d @('eventTopicId')
            $meta.blocking = Get-P $d @('blocking'); $meta.priority = Get-P $d @('priority'); $meta.timeout = Get-P $d @('timeout')
            $meta.disabled = Get-P $d @('disabled')
            $meta.criteria = Get-P $d @('criteria')
            $meta.runnableType = Get-P $d @('runnableType'); $meta.runnableId = Get-P $d @('runnableId')
            $meta.recoverRunnableType = Get-P $d @('recoverRunnableType'); $meta.recoverRunnableId = Get-P $d @('recoverRunnableId')
            if ($meta.runnableType -match 'vro' -and $meta.runnableId) { Add-Link $i.Key "vro-workflow|$($meta.runnableId)" 'runs' }
            if ($meta.recoverRunnableType -match 'vro' -and $meta.recoverRunnableId) { Add-Link $i.Key "vro-workflow|$($meta.recoverRunnableId)" 'recovers-with' }
            $meta.projects = @(@(Get-P $d @('constraints')) | ForEach-Object { @(Get-P $_ @('projectId')) } | ForEach-Object { Get-ProjName $_ } | Where-Object { $_ })
        }
        'abx-action' {
            $dir = Get-ObjPath 'abx' $i.Name $i.Id ''
            $src = Get-P $d @('source')
            $copy = $d | Select-Object * -ExcludeProperty source
            Save-Json "$dir/action.json" $copy; $files.Add("$dir/action.json")
            $rk = & $runtimeKeyFn (Get-P $d @('runtime', 'runtimeName'))
            if ($src) {
                $ext = if ($rk) { $abxExt[$rk] } else { '.txt' }
                Save-Text "$dir/source$ext" "$src"; $files.Add("$dir/source$ext")
            }
            $meta.runtime = Get-P $d @('runtime', 'runtimeName'); $meta.entrypoint = Get-P $d @('entrypoint')
            $meta.actionType = Get-P $d @('actionType'); $meta.provider = Get-P $d @('provider')
            $mainPath = "$dir/action.json"
        }
        'abx-flow' {
            $mainPath = Get-ObjPath 'abx-flows' $i.Name $i.Id '.json'
            Save-Json $mainPath $d; $files.Add($mainPath)
        }
        'property-group' {
            $mainPath = Get-ObjPath 'property-groups' $i.Name $i.Id '.json'
            Save-Json $mainPath $d; $files.Add($mainPath)
            $meta.type = Get-P $d @('type')
        }
        'custom-resource' {
            $mainPath = Get-ObjPath 'custom-resources' $i.Name $i.Id '.json'
            Save-Json $mainPath $d; $files.Add($mainPath)
            $meta.resourceType = Get-P $d @('resourceType')
        }
        'resource-action' {
            $mainPath = Get-ObjPath 'resource-actions' $i.Name $i.Id '.json'
            Save-Json $mainPath $d; $files.Add($mainPath)
            $meta.resourceType = Get-P $d @('resourceType'); $meta.runnableType = Get-P $d.runnableItem @('type'); $meta.runnableId = Get-P $d.runnableItem @('id')
            if ($meta.runnableType -match 'vro' -and $meta.runnableId) { Add-Link $i.Key "vro-workflow|$($meta.runnableId)" 'runs' }
        }
    }
    $pathByKey[$i.Key] = $mainPath
    $objects.Add([ordered]@{
        key = $i.Key; type = $i.Kind; id = $i.Id; name = $i.Name; project = $i.Project
        selectedBy = if ($userPicked.ContainsKey($i.Key)) { 'user' } else { 'dependency' }
        path = $mainPath; files = $files.ToArray(); meta = $meta
    })
}

# Event topics used by exported subscriptions
$usedTopics = @{}
foreach ($o in $objects) { if ($o.type -eq 'subscription' -and $o.meta.eventTopicId) { $usedTopics["$($o.meta.eventTopicId)"] = $true } }
$topicFiles = New-Object System.Collections.Generic.List[object]
foreach ($t in $topics) {
    $tid = "$(Get-P $t @('id'))"
    if ($tid -and $usedTopics.ContainsKey($tid)) {
        $p = "event-topics/$(ConvertTo-SafeName $tid).json"
        Save-Json $p $t
        $topicFiles.Add([ordered]@{ id = $tid; name = Get-P $t @('name'); blockable = Get-P $t @('blockable'); path = $p })
    }
}

# Projects (reference)
$projRef = @($projects | ForEach-Object { [ordered]@{ id = $_.id; name = $_.name; description = Get-P $_ @('description') } })
Save-Json 'projects.json' $projRef

# Only keep links whose both ends are in the package (vRO workflows are external by design)
$finalLinks = @($links | Where-Object {
    $pathByKey.ContainsKey($_.from) -and ($pathByKey.ContainsKey($_.to) -or $_.to.StartsWith('vro-workflow|'))
})

$counts = [ordered]@{}
foreach ($g in ($objects | Group-Object { $_.type })) { $counts[$g.Name] = $g.Count }

$manifest = [ordered]@{
    format        = 'vcfapkg'
    formatVersion = $FormatVersion
    tool          = [ordered]@{ name = $ToolName; version = $ToolVersion }
    source        = [ordered]@{
        product      = 'VCF Automation'
        orgType      = 'VM Apps'
        fqdn         = $Fqdn
        organization = $Organization
        apiVersion   = $apiVersion
        cloudApiVersion = $script:Conn.CloudApiVersion
        auth         = $script:AuthInfo
    }
    exportedAt    = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    exportedBy    = if ($UseApiToken) { 'api-token' } else { $Credential.UserName }
    selection     = if ($Select) { 'user-selected' } else { 'all' }
    counts        = $counts
    objects       = $objects.ToArray()
    links         = $finalLinks
    eventTopics   = $topicFiles.ToArray()
    log           = $script:Log.ToArray()
}
Save-Json 'manifest.json' $manifest

# =====================================================================================
#  5. Archive
# =====================================================================================

$pkgFile = $null
if (-not $NoArchive) {
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $pkgFile = Join-Path $orgDir "$name.vcfapkg"
    $fs = [IO.File]::Open($pkgFile, [IO.FileMode]::CreateNew)
    try {
        $zip = New-Object System.IO.Compression.ZipArchive($fs, [IO.Compression.ZipArchiveMode]::Create)
        try {
            $rootLen = $script:PkgDir.TrimEnd([IO.Path]::DirectorySeparatorChar).Length + 1
            foreach ($f in (Get-ChildItem -Path $script:PkgDir -Recurse -File)) {
                $entryName = $f.FullName.Substring($rootLen) -replace '\\', '/'
                [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $f.FullName, $entryName, [IO.Compression.CompressionLevel]::Optimal)
            }
        }
        finally { $zip.Dispose() }
    }
    finally { $fs.Dispose() }
}

# =====================================================================================
#  Summary
# =====================================================================================

Write-Step 'Done'
foreach ($k in $counts.Keys) { Write-Host ('  {0,-18} {1}' -f $k, $counts[$k]) }
$dep = @($objects | Where-Object { $_.selectedBy -eq 'dependency' }).Count
if ($Select -and $dep -gt 0) { Write-Host "  ($dep added automatically as dependencies)" -ForegroundColor Gray }
$fails = @($script:Log | Where-Object { $_.status -eq 'FAILED' })
if ($fails.Count -gt 0) { Write-Host "  $($fails.Count) call(s) failed - see 'log' in manifest.json" -ForegroundColor Yellow }
Write-Host ''
Write-Host "  Folder : $($script:PkgDir)" -ForegroundColor Green
if ($pkgFile) { Write-Host "  Package: $pkgFile" -ForegroundColor Green }
Write-Host ''
