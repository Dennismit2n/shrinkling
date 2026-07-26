# Generates the PNG icons and the promo banner from the brand motif
# (same artwork as icons/favicon.svg). Windows only: uses System.Drawing.
# Run: powershell -ExecutionPolicy Bypass -File tools/make-icons.ps1

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$icons = Join-Path $root "icons"
$assets = Join-Path $root "assets"
New-Item -ItemType Directory -Force $icons | Out-Null
New-Item -ItemType Directory -Force $assets | Out-Null

$accent = [System.Drawing.Color]::FromArgb(255, 124, 58, 237)   # #7c3aed
$white = [System.Drawing.Color]::White

function New-RoundedRectPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $r * 2
    $path.AddArc($x, $y, $d, $d, 180, 90)
    $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    return $path
}

# Draws the 48x48 motif scaled by $k, offset by $ox/$oy, onto $g.
function Draw-Motif($g, [float]$k, [float]$ox, [float]$oy, [bool]$withBackground) {
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

    if ($withBackground) {
        $bgPath = New-RoundedRectPath ($ox + 2 * $k) ($oy + 2 * $k) (44 * $k) (44 * $k) (11 * $k)
        $bgBrush = New-Object System.Drawing.SolidBrush($accent)
        $g.FillPath($bgBrush, $bgPath)
        $bgBrush.Dispose(); $bgPath.Dispose()
    }

    $whiteBrush = New-Object System.Drawing.SolidBrush($white)

    # photo frame
    $framePen = New-Object System.Drawing.Pen($white, (3 * $k))
    $framePath = New-RoundedRectPath ($ox + 9 * $k) ($oy + 17 * $k) (22 * $k) (19 * $k) (3 * $k)
    $g.DrawPath($framePen, $framePath)
    $framePath.Dispose(); $framePen.Dispose()

    # sun
    $g.FillEllipse($whiteBrush, ($ox + (15.5 - 2.2) * $k), ($oy + (23.5 - 2.2) * $k), (4.4 * $k), (4.4 * $k))

    # mountains
    $pts = @(
        (New-Object System.Drawing.PointF(($ox + 11.5 * $k), ($oy + 33.5 * $k))),
        (New-Object System.Drawing.PointF(($ox + 17.0 * $k), ($oy + 27.5 * $k))),
        (New-Object System.Drawing.PointF(($ox + 21.0 * $k), ($oy + 31.7 * $k))),
        (New-Object System.Drawing.PointF(($ox + 23.8 * $k), ($oy + 28.7 * $k))),
        (New-Object System.Drawing.PointF(($ox + 28.5 * $k), ($oy + 33.5 * $k)))
    )
    $g.FillPolygon($whiteBrush, $pts)

    # shrink arrow: shaft + head pointing into the photo
    $arrowPen = New-Object System.Drawing.Pen($white, (3.2 * $k))
    $arrowPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $arrowPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $g.DrawLine($arrowPen, ($ox + 39 * $k), ($oy + 9 * $k), ($ox + 32.5 * $k), ($oy + 15.5 * $k))
    $arrowPen.Dispose()
    $head = @(
        (New-Object System.Drawing.PointF(($ox + 30.0 * $k), ($oy + 11.5 * $k))),
        (New-Object System.Drawing.PointF(($ox + 30.0 * $k), ($oy + 18.0 * $k))),
        (New-Object System.Drawing.PointF(($ox + 36.5 * $k), ($oy + 18.0 * $k)))
    )
    $g.FillPolygon($whiteBrush, $head)

    $whiteBrush.Dispose()
}

function Save-Icon([int]$size, [string]$name, [string]$mode) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::Transparent)

    if ($mode -eq "rounded") {
        # transparent corners, rounded accent square (regular icons)
        Draw-Motif $g ($size / 48.0) 0 0 $true
    }
    else {
        # full-bleed accent square (maskable / apple-touch), motif in the safe area
        $bg = New-Object System.Drawing.SolidBrush($accent)
        $g.FillRectangle($bg, 0, 0, $size, $size)
        $bg.Dispose()
        $k = $size / 48.0 * 0.8
        $off = ($size - 48 * $k) / 2
        Draw-Motif $g $k $off $off $false
    }

    $g.Dispose()
    $bmp.Save((Join-Path $icons $name), [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "icons/$name"
}

Save-Icon 512 "icon-512.png" "rounded"
Save-Icon 192 "icon-192.png" "rounded"
Save-Icon 32  "favicon-32.png" "rounded"
Save-Icon 512 "maskable-512.png" "fullbleed"
Save-Icon 180 "apple-touch-icon.png" "fullbleed"

# ---- promo banner (1200x630, used for og:image and the README) ----

$w = 1200; $h = 630
$bmp = New-Object System.Drawing.Bitmap($w, $h)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias

$grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Point(0, 0)),
    (New-Object System.Drawing.Point($w, $h)),
    [System.Drawing.Color]::FromArgb(255, 91, 33, 182),
    [System.Drawing.Color]::FromArgb(255, 124, 58, 237))
$g.FillRectangle($grad, 0, 0, $w, $h)
$grad.Dispose()

Draw-Motif $g 4.2 105 210 $false

$titleFont = New-Object System.Drawing.Font("Segoe UI", 76, [System.Drawing.FontStyle]::Bold)
$subFont = New-Object System.Drawing.Font("Segoe UI", 30)
$smallFont = New-Object System.Drawing.Font("Segoe UI", 24)
$whiteBrush = New-Object System.Drawing.SolidBrush($white)
$softBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(230, 237, 233, 254))

# middle dot via char code so the script is encoding-proof
$dot = [string][char]0x00B7
$g.DrawString("shrinkling", $titleFont, $whiteBrush, 320, 195)
$g.DrawString("Shrink photos in your browser", $subFont, $whiteBrush, 330, 330)
$g.DrawString("No upload $dot metadata removed $dot open source", $smallFont, $softBrush, 332, 392)

$titleFont.Dispose(); $subFont.Dispose(); $smallFont.Dispose()
$whiteBrush.Dispose(); $softBrush.Dispose()
$g.Dispose()
$bmp.Save((Join-Path $assets "promo.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Host "assets/promo.png"
