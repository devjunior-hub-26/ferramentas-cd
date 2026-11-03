# Servidor local simples para testar o site no computador (não é usado no GitHub Pages).
# Use pelo INICIAR-TESTE.bat.
param([string]$Raiz = $PSScriptRoot, [int]$Porta = $(if ($env:PORT) { [int]$env:PORT } else { 8080 }))
$mime = @{ '.html'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8'; '.json'='application/json'; '.svg'='image/svg+xml'; '.png'='image/png'; '.md'='text/plain; charset=utf-8' }
$l = New-Object System.Net.HttpListener
$l.Prefixes.Add("http://localhost:$Porta/")
$l.Start()
Write-Host "Servindo $Raiz em http://localhost:$Porta/"
while ($l.IsListening) {
  $ctx = $l.GetContext()
  $caminho = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
  $arq = Join-Path $Raiz $caminho
  if (Test-Path -LiteralPath $arq -PathType Container) { $arq = Join-Path $arq 'index.html' }
  if (Test-Path -LiteralPath $arq -PathType Leaf) {
    $bytes = [IO.File]::ReadAllBytes($arq)
    $ext = [IO.Path]::GetExtension($arq).ToLower()
    $ctx.Response.ContentType = $(if ($mime[$ext]) { $mime[$ext] } else { 'application/octet-stream' })
    $ctx.Response.ContentLength64 = $bytes.Length
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  } else { $ctx.Response.StatusCode = 404 }
  $ctx.Response.Close()
}
