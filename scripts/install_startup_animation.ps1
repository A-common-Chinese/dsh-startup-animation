<#
  DSH 启动动画 · native-startup addon —— 免 Python 安装器（Windows PowerShell 5.1+）

  它只做两件事，都不碰全局环境：
    1. 把本包里的 plugin\ 复制到 $DSH_HOME\startup-animation\plugin\
    2. 在该 DSH profile 的 cordis.patch.yml 里写入一段带标记的挂载块（按文件 URL 挂载）

  用法：
    .\install.ps1                 安装（自动选 desktop profile）
    .\install.ps1 -DryRun         只看会改什么，不落盘
    .\install.ps1 -Uninstall      整块移除挂载（不会删 profile 其它内容）
    .\install.ps1 -ProfileName desktop -DshHome C:\Users\me\.dsh

  安全：改写前会在同目录留一份 cordis.patch.yml.bak-startup-<时间戳> 备份。
#>
[CmdletBinding()]
param(
  [switch]$Uninstall,
  [switch]$DryRun,
  [string]$ProfileName,
  [string]$DshHome,
  [string]$Source
)

$ErrorActionPreference = 'Stop'
$BEGIN = '# >>> dsh-startup-animation'
$END = '# <<< dsh-startup-animation'

function Step($m) { Write-Host "  $m" }
function Ok($m) { Write-Host "  [OK] $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  [!] $m" -ForegroundColor Yellow }

Write-Host ''
Write-Host 'DSH 启动动画（native-startup addon）安装器' -ForegroundColor Cyan
Write-Host '------------------------------------------'

# 1) 解析 DSH_HOME
if (-not $DshHome) { $DshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' } }
$DshHome = [System.IO.Path]::GetFullPath($DshHome)
Step "DSH_HOME      = $DshHome"
if (-not (Test-Path $DshHome)) { throw "找不到 DSH 目录：$DshHome（请先启动一次 DSH 桌面端）" }

# 2) 解析插件源（卸载时不需要）
if (-not $Uninstall) {
  if (-not $Source) { $Source = Join-Path $PSScriptRoot 'plugin' }
  if (-not (Test-Path (Join-Path $Source 'plugin.mjs'))) { throw "插件源不完整：$Source 里没有 plugin.mjs（请把本安装器与 plugin\ 目录放在一起）" }
  $fileCount = (Get-ChildItem -Path $Source -Recurse -File).Count
  Step "插件源        = $Source（$fileCount 个文件）"
}

# 3) 选 profile
$profilesRoot = Join-Path $DshHome 'profiles'
if ($ProfileName) {
  $profileDir = Join-Path $profilesRoot $ProfileName
  if (-not (Test-Path $profileDir)) { throw "profile 不存在：$profileDir" }
} else {
  $cands = @(Get-ChildItem -Path $profilesRoot -Directory -ErrorAction SilentlyContinue)
  $withPatch = @($cands | Where-Object { Test-Path (Join-Path $_.FullName 'cordis.patch.yml') })
  $desktop = @($withPatch | Where-Object { $_.Name -eq 'desktop' })
  $pick = if ($desktop.Count -gt 0) { $desktop[0] } elseif ($withPatch.Count -gt 0) { $withPatch[0] } elseif ($cands.Count -gt 0) { $cands[0] } else { $null }
  if (-not $pick) { throw "找不到任何 profile（$profilesRoot）。请先启动一次 DSH 桌面端，或用 -Profile 指定。" }
  if ($cands.Count -gt 1) { Warn "发现多个 profile，已选 '$($pick.Name)'（用 -Profile 可指定其它）" }
  $profileDir = $pick.FullName
}
$patch = Join-Path $profileDir 'cordis.patch.yml'
Step "目标 profile  = $($profileDir | Split-Path -Leaf)"
Step "patch 文件    = $patch"

# 4) 目标插件目录 + 挂载块内容
$target = Join-Path (Join-Path $DshHome 'startup-animation') 'plugin'
$moduleUrl = 'file:///' + ((($target -replace '\\', '/')) -replace ' ', '%20') + '/plugin.mjs'
$block = @(
  $BEGIN + ' (managed block — keep the markers) >>>'
  '# 由 install.ps1 写入；-Uninstall 可整块移除。'
  '# 该 addon 没有 main 字段，上游也用「文件 URL」挂载，故此处同样处理。'
  '# override: true = 每次启动都播。'
  '- insert:'
  '    - id: dsh-original-startup'
  "      name: '$moduleUrl'"
  '      config:'
  '        override: true'
  $END + ' <<<'
)
Step "挂载目标      = $target"
Step "模块 URL      = $moduleUrl"

# 5) 读取现有 patch，剥掉旧标记块
$header = @(
  '# Your patch layer for this dsh profile, applied after every bundle layer:'
  '# a top-level YAML array of loader patch entries.'
  '# 本文件由 DSH 使用；下面带 >>> dsh-startup-animation 标记的块由安装器维护。'
) -join "`n"
$lines = @()
if (Test-Path $patch) {
  $lines = [System.IO.File]::ReadAllText($patch) -split "`r?`n"
} else {
  Warn 'patch 文件不存在，将新建一个（只含本挂载块）'
}
$kept = New-Object System.Collections.Generic.List[string]
$inBlock = $false
$hadBlock = $false
foreach ($line in $lines) {
  $t = $line.TrimStart()
  if (-not $inBlock -and $t.StartsWith($BEGIN)) { $inBlock = $true; $hadBlock = $true; continue }
  if ($inBlock) { if ($t.StartsWith($END)) { $inBlock = $false }; continue }
  $kept.Add($line)
}
while ($kept.Count -gt 0 -and $kept[$kept.Count - 1].Trim() -eq '') { $kept.RemoveAt($kept.Count - 1) }
$base = if ($kept.Count -gt 0) { ($kept -join "`n") } else { $header }
Step $(if ($hadBlock) { '已找到旧的挂载块，将被替换' } else { '未发现旧挂载块，将追加' })

if ($Uninstall) {
  if (-not $hadBlock) { Ok '本来就没有挂载块，无需卸载' ; return }
  if ($DryRun) { Ok '预演：将移除挂载块（未落盘）'; return }
  $backup = "$patch.bak-startup-$(Get-Date -Format 'yyyyMMdd-HHmmssfff')"
  Copy-Item $patch $backup -Force
  [System.IO.File]::WriteAllText($patch, ($base + "`n"), (New-Object System.Text.UTF8Encoding($false)))
  Ok "已移除挂载块（备份：$(Split-Path $backup -Leaf)）"
  Write-Host ''
  Write-Host '重启 DSH 后开屏演出即不再播放。' -ForegroundColor Cyan
  return
}

# 6) 安装
$newText = $base + "`n`n" + ($block -join "`n") + "`n"
if ($DryRun) {
  Write-Host ''
  Step '--- 预演：将要写入的挂载块 ---'
  $block | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
  Step '--- 预演：将复制的文件 ---'
  Step "  $Source  ->  $target"
  Ok '预演结束，未修改任何文件'
  return
}

if (Test-Path $patch) {
  $backup = "$patch.bak-startup-$(Get-Date -Format 'yyyyMMdd-HHmmssfff')"
  Copy-Item $patch $backup -Force
  Step "已备份 patch：$(Split-Path $backup -Leaf)"
}
if (Test-Path $target) { Remove-Item $target -Recurse -Force }
New-Item -ItemType Directory -Force -Path (Split-Path $target) | Out-Null
Copy-Item $Source $target -Recurse -Force
Ok "插件已暂存到 $target"

[System.IO.File]::WriteAllText($patch, $newText, (New-Object System.Text.UTF8Encoding($false)))
$verify = [System.IO.File]::ReadAllText($patch)
if ($verify.Contains($BEGIN) -and $verify.Contains($moduleUrl) -and $verify.Contains($END)) {
  Ok "挂载块已写入 $patch"
} else {
  throw "写入校验失败：$patch 里没有找到完整挂载块"
}

Write-Host ''
Write-Host '安装完成！' -ForegroundColor Green
Write-Host '  1. 完全退出并重新启动 DSH 桌面端，开屏演出即会播放'
Write-Host '  2. 播放中：Enter/点击 = 推进阶段，连按两次 Space = 紧急中止'
Write-Host '  3. 随时重播：Ctrl + Alt + P（无需重启）'
Write-Host '  4. 卸载：再次运行本安装器并加 -Uninstall，或删除上面那段标记块'
