$port = 8080
$dir = $PSScriptRoot
if (-not $dir) { $dir = (Get-Location).Path }

# Yerel Ag / Wi-Fi IP Adresini Bul
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { 
    $_.InterfaceAlias -notlike "*Loopback*" -and 
    $_.IPAddress -notlike "169.254*"
} | Select-Object -ExpandProperty IPAddress -First 1)

if (-not $ip) { $ip = "127.0.0.1" }

$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Any, $port)

try {
    $listener.Start()
} catch {
    Write-Host "Port $port baska bir uygulama tarafindan kullaniliyor olabilir. Hata: $_" -ForegroundColor Red
    exit 1
}

Clear-Host
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  [+] KANTIN TAKIP - TELEFON & MOBIL UYGULAMA SUNUCUSU" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Bilgisayardan Ac:       http://localhost:$port" -ForegroundColor White
Write-Host "  TELEFONDAN AC (Wi-Fi):  http://$($ip):$port" -ForegroundColor Yellow
Write-Host ""
Write-Host "----------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host "  TELEFONA YUKLEME ADIMLARI:" -ForegroundColor Cyan
Write-Host "  1. Telefonunuz ile bu bilgisayarin AYNI Wi-Fi aginda oldugundan emin olun." -ForegroundColor Gray
Write-Host "  2. iPhone (iOS): Safari tarayicisindan sari adrese gidin:" -ForegroundColor Gray
Write-Host "     http://$($ip):$port" -ForegroundColor Yellow
Write-Host "     -> Alt kısımdaki Paylas butonuna basin." -ForegroundColor Gray
Write-Host "     -> 'Ana Ekrana Ekle' secenegine dokunun." -ForegroundColor Gray
Write-Host ""
Write-Host "  3. Android: Google Chrome ile sari adrese gidin:" -ForegroundColor Gray
Write-Host "     http://$($ip):$port" -ForegroundColor Yellow
Write-Host "     -> Sag ustteki uc noktaya basin." -ForegroundColor Gray
Write-Host "     -> 'Uygulamayi Yukle' veya 'Ana Ekrana Ekle'ye basin." -ForegroundColor Gray
Write-Host "----------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host "  Kapatmak icin bu pencereyi kapatin veya Ctrl + C tuslayin." -ForegroundColor DarkGray
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

try {
    while ($true) {
        $client = $listener.AcceptTcpClient()
        try {
            $stream = $client.GetStream()
            $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII)
            $requestLine = $reader.ReadLine()
            
            if ($requestLine) {
                $tokens = $requestLine.Split(" ")
                if ($tokens.Length -ge 2) {
                    $rawPath = $tokens[1]
                    $pathOnly = $rawPath.Split("?")[0].TrimStart('/')
                    if ([string]::IsNullOrEmpty($pathOnly)) { $pathOnly = "index.html" }
                    $decodedPath = [System.Uri]::UnescapeDataString($pathOnly)
                    $filePath = Join-Path $dir $decodedPath
                    
                    if (Test-Path -LiteralPath $filePath -PathType Leaf) {
                        $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
                        $contentType = switch ($ext) {
                            ".html" { "text/html; charset=utf-8" }
                            ".css"  { "text/css; charset=utf-8" }
                            ".js"   { "application/javascript; charset=utf-8" }
                            ".json" {
                                if ($decodedPath -like "*manifest*") {
                                    "application/manifest+json; charset=utf-8"
                                } else {
                                    "application/json; charset=utf-8"
                                }
                            }
                            ".png"  { "image/png" }
                            ".jpg"  { "image/jpeg" }
                            ".jpeg" { "image/jpeg" }
                            ".svg"  { "image/svg+xml" }
                            ".ico"  { "image/x-icon" }
                            default { "application/octet-stream" }
                        }
                        
                        $fileBytes = [System.IO.File]::ReadAllBytes($filePath)
                        $header = "HTTP/1.1 200 OK`r`n" +
                                  "Content-Type: $contentType`r`n" +
                                  "Content-Length: $($fileBytes.Length)`r`n" +
                                  "Access-Control-Allow-Origin: *`r`n" +
                                  "Cache-Control: no-cache`r`n" +
                                  "Connection: close`r`n`r`n"
                        $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
                        $stream.Write($headerBytes, 0, $headerBytes.Length)
                        $stream.Write($fileBytes, 0, $fileBytes.Length)
                    } else {
                        $notFound = "HTTP/1.1 404 Not Found`r`nContent-Length: 0`r`nConnection: close`r`n`r`n"
                        $nfBytes = [System.Text.Encoding]::ASCII.GetBytes($notFound)
                        $stream.Write($nfBytes, 0, $nfBytes.Length)
                    }
                }
            }
            $stream.Close()
        } catch {
            # Client disconnected early, continue listening
        } finally {
            $client.Close()
        }
    }
} finally {
    $listener.Stop()
}
