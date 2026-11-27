Add-Type -AssemblyName System.Drawing

$iconDir = "D:\Extension\icons"
if (-not (Test-Path $iconDir)) { New-Item -ItemType Directory -Path $iconDir | Out-Null }

$sizes = @(16, 32, 48, 128)

foreach ($size in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

    # Gradient brush (purple to cyan)
    $pt1 = New-Object System.Drawing.Point(0, 0)
    $pt2 = New-Object System.Drawing.Point($size, $size)
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $pt1, $pt2,
        [System.Drawing.Color]::FromArgb(255, 124, 58, 237),
        [System.Drawing.Color]::FromArgb(255, 6, 182, 212)
    )

    # Rounded rectangle background
    $r = [int]($size * 0.2)
    $d = $r * 2
    $gpath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $gpath.AddArc(0, 0, $d, $d, 180, 90)
    $gpath.AddArc(($size - $d), 0, $d, $d, 270, 90)
    $gpath.AddArc(($size - $d), ($size - $d), $d, $d, 0, 90)
    $gpath.AddArc(0, ($size - $d), $d, $d, 90, 90)
    $gpath.CloseFigure()
    $g.FillPath($brush, $gpath)

    # White pen for icon
    $lw = [float][Math]::Max(1.5, $size * 0.08)
    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, $lw)
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap   = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

    $cx   = [float]($size / 2)
    $pad  = [float]($size * 0.2)
    $top  = [float]($pad)
    $mid  = [float]($size * 0.60)
    $ht   = [float]($size * 0.66)
    $ah   = [float]($size * 0.22)
    $bl   = [float]($size * 0.82)

    # Vertical shaft
    $g.DrawLine($pen, $cx, $top, $cx, $mid)

    # Arrow head
    $arrowPts = @(
        [System.Drawing.PointF]::new(($cx - $ah), ($size * 0.47)),
        [System.Drawing.PointF]::new($cx, $ht),
        [System.Drawing.PointF]::new(($cx + $ah), ($size * 0.47))
    )
    $g.DrawLines($pen, $arrowPts)

    # Base bar
    $g.DrawLine($pen, $pad, $bl, ($size - $pad), $bl)

    $outPath = "$iconDir\icon$size.png"
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    $brush.Dispose()
    $pen.Dispose()
    Write-Host "Created: $outPath"
}

Write-Host "All icons done!"
