$body = @{
  code = "x"
  redirect_uri = "https://classroom50.htlweiz.at/login"
  code_verifier = "x"
} | ConvertTo-Json -Compress

try {
  $res = Invoke-WebRequest -Method Post -Uri "http://localhost:8787/web/token" -ContentType "application/json" -Body $body
  $res.StatusCode
  $res.Content
} catch {
  $_.Exception.Response.StatusCode.value__
  $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
  $reader.ReadToEnd()
}