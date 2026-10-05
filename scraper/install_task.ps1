# Günlük epey veri güncellemesini Windows Görev Zamanlayıcı'ya ekler.
# Kullanım (PowerShell):  powershell -ExecutionPolicy Bypass -File scraper\install_task.ps1
# Kaldırmak için:          Unregister-ScheduledTask -TaskName "PC Toplama - epey veri guncelleme" -Confirm:$false

param([string]$At = "10:00")

$root = Split-Path -Parent $PSScriptRoot
$script = Join-Path $root "scraper\auto_update.py"
$pythonw = (Get-Command pythonw.exe -ErrorAction Stop).Source

$action = New-ScheduledTaskAction -Execute $pythonw -Argument "`"$script`"" -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -Daily -At $At
# Bilgisayar o saatte kapalıysa açılınca çalışır; yalnızca internet varken çalışır
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Hours 4)

Register-ScheduledTask -TaskName "PC Toplama - epey veri guncelleme" -Action $action -Trigger $trigger `
  -Settings $settings -Force `
  -Description "PC Toplama sitesi: epey.com'dan fiyatları ve yeni ürünleri çekip GitHub Pages'e gönderir (scraper\auto_update.py)." | Out-Null

Write-Output "Görev kuruldu: her gün $At (kaçırılırsa bilgisayar açılınca). Günlük: scraper\auto_update.log"
