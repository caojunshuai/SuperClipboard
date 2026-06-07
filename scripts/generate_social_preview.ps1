# Generate 1280x640 social preview image for GitHub
Add-Type -AssemblyName System.Drawing

$width = 1280
$height = 640

$iconPath = "$PSScriptRoot\..\src-tauri\icons\icon.png"
$outPath = "$PSScriptRoot\..\src-tauri\icons\social-preview.png"

$bmp = New-Object System.Drawing.Bitmap($width, $height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'HighQuality'
$g.TextRenderingHint = 'AntiAlias'

# Background: dark theme (#0f0f1a)
$bg = [System.Drawing.Color]::FromArgb(0x0f, 0x0f, 0x1a)
$g.Clear($bg)

# Top accent line
$accent = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(0x60, 0xa5, 0xfa))
$g.FillRectangle($accent, 0, 0, $width, 4)

# Load and draw icon
$icon = [System.Drawing.Image]::FromFile($iconPath)
$iconSize = 256
$iconX = ($width - $iconSize) / 2
$iconY = 70
$g.DrawImage($icon, $iconX, $iconY, $iconSize, $iconSize)
$icon.Dispose()

# App name
$nameFont = New-Object System.Drawing.Font('Segoe UI', 52, [System.Drawing.FontStyle]::Bold)
$nameBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$nameText = 'SuperClipboard'
$nameSF = New-Object System.Drawing.StringFormat
$nameSF.Alignment = 'Center'
$g.DrawString($nameText, $nameFont, $nameBrush, $width/2, 350, $nameSF)

# Tagline
$tagFont = New-Object System.Drawing.Font('Segoe UI', 20, [System.Drawing.FontStyle]::Regular)
$tagBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(0x94, 0xa3, 0xb8))
$tagText = 'Windows Clipboard Manager'
$tagSF = New-Object System.Drawing.StringFormat
$tagSF.Alignment = 'Center'
$g.DrawString($tagText, $tagFont, $tagBrush, $width/2, 430, $tagSF)

# Subtitle
$subFont = New-Object System.Drawing.Font('Segoe UI', 16, [System.Drawing.FontStyle]::Regular)
$subBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(0x64, 0x74, 0x8b))
$subText = 'Built with Tauri 2 + React + Rust'
$subSF = New-Object System.Drawing.StringFormat
$subSF.Alignment = 'Center'
$g.DrawString($subText, $subFont, $subBrush, $width/2, 470, $subSF)

# Bottom accent line
$g.FillRectangle($accent, 0, $height - 4, $width, 4)

# Cleanup
$g.Dispose()
$nameFont.Dispose()
$nameBrush.Dispose()
$tagFont.Dispose()
$tagBrush.Dispose()
$subFont.Dispose()
$subBrush.Dispose()
$accent.Dispose()
$nameSF.Dispose()
$tagSF.Dispose()
$subSF.Dispose()

# Save as PNG
$bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

Write-Host "Saved: $outPath ($width x $height)"
