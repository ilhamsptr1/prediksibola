Add-Type -AssemblyName System.Drawing

$logoPath = 'e:\WEB PREDIKSI BOLA 2\logo apk.png'
$resPath = 'e:\WEB PREDIKSI BOLA 2\android\app\src\main\res'

$sizes = @{
    'mdpi' = 108
    'hdpi' = 162
    'xhdpi' = 216
    'xxhdpi' = 324
    'xxxhdpi' = 432
}

$srcImg = [System.Drawing.Image]::FromFile($logoPath)

foreach ($size in $sizes.GetEnumerator()) {
    $folderName = "mipmap-$($size.Name)"
    $folderPath = Join-Path $resPath $folderName
    if (-not (Test-Path $folderPath)) { New-Item -ItemType Directory -Path $folderPath | Out-Null }
    
    $targetSize = $size.Value
    
    # Create foreground icon (transparent background, scaled down logo)
    $fgBmp = New-Object System.Drawing.Bitmap($targetSize, $targetSize)
    $fgGraphics = [System.Drawing.Graphics]::FromImage($fgBmp)
    $fgGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $fgGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $fgGraphics.Clear([System.Drawing.Color]::Transparent)
    
    # Scale logo to 65% of the target size to fit within the safe zone
    $logoSize = [int]($targetSize * 0.65)
    $offset = [int](($targetSize - $logoSize) / 2)
    $rect = New-Object System.Drawing.Rectangle($offset, $offset, $logoSize, $logoSize)
    
    $fgGraphics.DrawImage($srcImg, $rect)
    
    $fgPath = Join-Path $folderPath 'ic_launcher_foreground.png'
    $fgBmp.Save($fgPath, [System.Drawing.Imaging.ImageFormat]::Png)
    
    $fgGraphics.Dispose()
    $fgBmp.Dispose()
    
    # Also generate the legacy icons but padded so they look good on older devices too
    $legacySize = [int]($targetSize * 0.66) # legacy icons are smaller than adaptive icons
    $legacyBmp = New-Object System.Drawing.Bitmap($legacySize, $legacySize)
    $legacyGraphics = [System.Drawing.Graphics]::FromImage($legacyBmp)
    $legacyGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $legacyGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    
    # We'll use a black background for the legacy icon since the logo seems to have a black background
    $legacyGraphics.Clear([System.Drawing.Color]::Black)
    
    # Make the logo take up about 90% of the legacy icon
    $legLogoSize = [int]($legacySize * 0.9)
    $legOffset = [int](($legacySize - $legLogoSize) / 2)
    $legRect = New-Object System.Drawing.Rectangle($legOffset, $legOffset, $legLogoSize, $legLogoSize)
    
    $legacyGraphics.DrawImage($srcImg, $legRect)
    
    $legacyPath = Join-Path $folderPath 'ic_launcher.png'
    $legacyRoundPath = Join-Path $folderPath 'ic_launcher_round.png'
    
    $legacyBmp.Save($legacyPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $legacyBmp.Save($legacyRoundPath, [System.Drawing.Imaging.ImageFormat]::Png)
    
    $legacyGraphics.Dispose()
    $legacyBmp.Dispose()
}

$srcImg.Dispose()
Write-Host 'Icons regenerated with padding!'
