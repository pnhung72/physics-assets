param([string]$InDir)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Drawing
$InDir = (Resolve-Path -LiteralPath $InDir).Path
$OutDir = Split-Path -Parent $InDir
$Dpi = 300
Write-Output ('Doc tu : ' + $InDir)
Write-Output ('Ghi PNG: ' + $OutDir)
$ok = 0; $bad = 0
$files = Get-ChildItem -LiteralPath $InDir -File | Where-Object { $_.Extension -match '^\.(wmf|emf)$' }
foreach ($f in $files) {
  try {
    $m = New-Object System.Drawing.Imaging.Metafile($f.FullName)
    $w = [Math]::Min(6000, [Math]::Max(1, [int][Math]::Ceiling($m.Width / $m.HorizontalResolution * $Dpi)))
    $h = [Math]::Min(6000, [Math]::Max(1, [int][Math]::Ceiling($m.Height / $m.VerticalResolution * $Dpi)))
    $bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $bmp.SetResolution($Dpi, $Dpi)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::White)
    $g.SmoothingMode = 'AntiAlias'
    $g.InterpolationMode = 'HighQualityBicubic'
    $g.PixelOffsetMode = 'HighQuality'
    $g.TextRenderingHint = 'AntiAliasGridFit'
    $g.DrawImage($m, 0, 0, $w, $h)
    $g.Dispose(); $m.Dispose()
    $out = Join-Path $OutDir ($f.BaseName + '.png')
    $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
    Write-Output ('OK  ' + $f.Name + ' -> ' + $f.BaseName + '.png'); $ok++
  } catch { Write-Output ('LOI ' + $f.Name + ': ' + $_.Exception.Message); $bad++ }
}
Write-Output ('Xong: ' + $ok + ' anh, loi: ' + $bad)
Write-Output 'Hay mo vai file PNG de kiem tra cong thuc (ky tu dac biet can font MathType/Symbol tren may).'
