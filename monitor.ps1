# monitor.ps1
# Lee impresoras.json, consulta SNMP, escribe historico.json + meta.json (sin BOM).

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

$root              = $PSScriptRoot
$archivoImpresoras = Join-Path $root "impresoras.json"
$archivoHistorico  = Join-Path $root "historico.json"
$archivoMeta       = Join-Path $root "meta.json"

$oid_lexmark   = ".1.3.6.1.4.1.641.6.4.2.4.1.3.1.1"
$comunidadSNMP = "public"
$timeoutMs     = 1000
$reintentos    = 0

$mesActualKey = (Get-Date).ToString("yyyy-MM")

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Write-Info { param([string]$Msg) Write-Output $Msg }

Write-Info "=== monitor.ps1 iniciado ==="
Write-Info "Fecha: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Info "Mes actual: $mesActualKey"

# ============================================================
# Funciones BER/SNMP
# ============================================================

function ConvertTo-BerLength {
    param([int]$Length)
    if ($Length -lt 0x80) { return [byte[]]@([byte]$Length) }
    $bytes = New-Object 'System.Collections.Generic.List[byte]'
    $value = $Length
    while ($value -gt 0) {
        $bytes.Insert(0, [byte]($value -band 0xFF))
        $value = [int][Math]::Floor($value / 256)
    }
    $result = New-Object 'System.Collections.Generic.List[byte]'
    $result.Add([byte](0x80 -bor $bytes.Count))
    $result.AddRange($bytes)
    return $result.ToArray()
}

function New-BerTlv {
    param([byte]$Tag, [byte[]]$Value)
    $result = New-Object 'System.Collections.Generic.List[byte]'
    $result.Add($Tag)
    $result.AddRange([byte[]](ConvertTo-BerLength -Length $Value.Length))
    $result.AddRange($Value)
    return $result.ToArray()
}

function ConvertTo-BerInteger {
    param([long]$Value)
    $bytes = New-Object 'System.Collections.Generic.List[byte]'
    $n = $Value
    do {
        $bytes.Insert(0, [byte]($n -band 0xFF))
        $n = $n -shr 8
    } while (($n -ne 0 -and ($bytes[0] -band 0x80) -eq 0) -or ($n -lt 0 -and ($bytes[0] -band 0x80) -eq 0x80))
    if (($Value -ge 0) -and (($bytes[0] -band 0x80) -ne 0)) { $bytes.Insert(0, [byte]0) }
    return New-BerTlv -Tag 0x02 -Value $bytes.ToArray()
}

function Join-BerBytes {
    param([byte[]]$First, [byte[]]$Second)
    $combined = New-Object 'System.Collections.Generic.List[byte]'
    if ($null -ne $First  -and $First.Length  -gt 0) { $combined.AddRange($First)  }
    if ($null -ne $Second -and $Second.Length -gt 0) { $combined.AddRange($Second) }
    return ,([byte[]]$combined.ToArray())
}

function ConvertTo-BerOid {
    param([string]$Oid)
    $arcs = @($Oid.Trim('.').Split('.') | ForEach-Object { [UInt64]$_ })
    if ($arcs.Count -lt 2 -or $arcs[0] -gt 2 -or ($arcs[0] -lt 2 -and $arcs[1] -gt 39)) { throw "OID no valido: $Oid" }
    $encoded = New-Object 'System.Collections.Generic.List[byte]'
    $values  = New-Object 'System.Collections.Generic.List[UInt64]'
    $values.Add([UInt64]($arcs[0] * 40 + $arcs[1]))
    for ($arcIndex = 2; $arcIndex -lt $arcs.Count; $arcIndex++) { $values.Add([UInt64]$arcs[$arcIndex]) }
    foreach ($number in $values) {
        $parts = New-Object 'System.Collections.Generic.List[byte]'
        $v = [UInt64]$number
        $parts.Insert(0, [byte]($v -band 0x7F))
        $v = $v -shr 7
        while ($v -gt 0) {
            $parts.Insert(0, [byte](0x80 -bor ($v -band 0x7F)))
            $v = $v -shr 7
        }
        $encoded.AddRange($parts)
    }
    return New-BerTlv -Tag 0x06 -Value $encoded.ToArray()
}

function Read-BerTlv {
    param([byte[]]$Data, [int]$Offset)
    if ($Offset + 2 -gt $Data.Length) { throw "Respuesta SNMP incompleta." }
    $tag         = $Data[$Offset]
    $firstLength = [int]$Data[$Offset + 1]
    $position    = $Offset + 2
    if (($firstLength -band 0x80) -eq 0) { $length = $firstLength }
    else {
        $lengthBytes = $firstLength -band 0x7F
        $length = 0
        for ($i = 0; $i -lt $lengthBytes; $i++) { $length = ($length * 256) + [int]$Data[$position + $i] }
        $position += $lengthBytes
    }
    $content = New-Object byte[] $length
    if ($length -gt 0) { [Array]::Copy($Data, $position, $content, 0, $length) }
    return [PSCustomObject]@{ Tag = $tag; Content = $content; NextOffset = $position + $length }
}

function Get-SnmpIntegerValue {
    param($Tlv)
    if ($Tlv.Tag -eq 0x02) {
        [Int64]$value = 0
        foreach ($b in $Tlv.Content) { $value = ($value * 256) + [Int64]$b }
        if (($Tlv.Content[0] -band 0x80) -ne 0) {
            $bits = 8 * $Tlv.Content.Length
            $value -= [Int64]([Math]::Pow(2, $bits))
        }
        return $value
    }
    if ($Tlv.Tag -in @(0x41, 0x42, 0x43, 0x46)) {
        [UInt64]$value = 0
        foreach ($b in $Tlv.Content) { $value = ($value * 256) + [UInt64]$b }
        return $value
    }
    throw ("Tipo SNMP inesperado: 0x{0:X2}" -f $Tlv.Tag)
}

function Get-SnmpCounter {
    param([string]$HostName, [string]$Oid, [string]$Community, [int]$Timeout, [int]$Retries)
    $requestId      = Get-Random -Minimum 1 -Maximum 128
    $nullValue      = New-BerTlv -Tag 0x05 -Value ([byte[]]@())
    $varBindContent = Join-BerBytes -First (ConvertTo-BerOid -Oid $Oid) -Second $nullValue
    $varBind        = New-BerTlv -Tag 0x30 -Value $varBindContent
    $varBindList    = New-BerTlv -Tag 0x30 -Value $varBind
    $pduContent     = ConvertTo-BerInteger -Value $requestId
    $pduContent     = Join-BerBytes -First $pduContent -Second (ConvertTo-BerInteger -Value 0)
    $pduContent     = Join-BerBytes -First $pduContent -Second (ConvertTo-BerInteger -Value 0)
    $pduContent     = Join-BerBytes -First $pduContent -Second $varBindList
    $pdu            = New-BerTlv -Tag 0xA0 -Value $pduContent
    $version        = ConvertTo-BerInteger -Value 1
    $communityTlv   = New-BerTlv -Tag 0x04 -Value ([Text.Encoding]::ASCII.GetBytes($Community))
    $messageContent = Join-BerBytes -First $version -Second $communityTlv
    $messageContent = Join-BerBytes -First $messageContent -Second $pdu
    $request        = New-BerTlv -Tag 0x30 -Value $messageContent

    $udp = New-Object System.Net.Sockets.UdpClient
    try {
        $udp.Client.ReceiveTimeout = $Timeout
        $udp.Connect($HostName, 161)
        for ($attempt = 0; $attempt -le $Retries; $attempt++) {
            [void]$udp.Send($request, $request.Length)
            try {
                $remote   = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Any, 0)
                $response = $udp.Receive([ref]$remote)
                break
            }
            catch { if ($attempt -eq $Retries) { throw "Timeout consultando $HostName." } }
        }
        $outer             = Read-BerTlv -Data $response -Offset 0
        $messageOffset     = 0
        $versionResponse   = Read-BerTlv -Data $outer.Content -Offset $messageOffset
        $messageOffset     = $versionResponse.NextOffset
        $communityResponse = Read-BerTlv -Data $outer.Content -Offset $messageOffset
        $messageOffset     = $communityResponse.NextOffset
        $pduResponse       = Read-BerTlv -Data $outer.Content -Offset $messageOffset
        $offset            = 0
        $requestIdResponse = Read-BerTlv -Data $pduResponse.Content -Offset $offset
        $offset            = $requestIdResponse.NextOffset
        $errorStatus       = Read-BerTlv -Data $pduResponse.Content -Offset $offset
        $offset            = $errorStatus.NextOffset
        $errorIndex        = Read-BerTlv -Data $pduResponse.Content -Offset $offset
        $offset            = $errorIndex.NextOffset
        $varBinds          = Read-BerTlv -Data $pduResponse.Content -Offset $offset
        if ((Get-SnmpIntegerValue -Tlv $errorStatus) -ne 0) { throw "Error devuelto por agente SNMP." }
        $varBindResponse = Read-BerTlv -Data $varBinds.Content -Offset 0
        $oidResponse     = Read-BerTlv -Data $varBindResponse.Content -Offset 0
        $valueTlv        = Read-BerTlv -Data $varBindResponse.Content -Offset $oidResponse.NextOffset
        return Get-SnmpIntegerValue -Tlv $valueTlv
    }
    finally { $udp.Dispose() }
}

# ============================================================
# Carga de datos
# ============================================================

if (-not (Test-Path $archivoImpresoras)) {
    Write-Info "ERROR: No existe $archivoImpresoras"
    Write-Info "Agregá impresoras desde la web primero."
    exit 1
}

try {
    $rawConfig = Get-Content $archivoImpresoras -Raw -Encoding UTF8
    if ($rawConfig.Length -gt 0 -and [int]$rawConfig[0] -eq 0xFEFF) {
        $rawConfig = $rawConfig.Substring(1)
    }
    $config = $rawConfig | ConvertFrom-Json
    $impresoras = @($config.impresoras | Where-Object { $_ -ne $null -and $_.ip -and -not $_.borradaEn -and ($_.escanear -ne $false) })
} catch {
    Write-Info "ERROR leyendo impresoras.json: $($_.Exception.Message)"
    exit 1
}

Write-Info "Impresoras a consultar: $($impresoras.Count)"

if ($impresoras.Count -eq 0) {
    Write-Info "No hay impresoras configuradas."
    exit 0
}

$registros = @{}
if (Test-Path $archivoHistorico) {
    try {
        $rawH = Get-Content $archivoHistorico -Raw -Encoding UTF8
        if ($rawH.Length -gt 0 -and [int]$rawH[0] -eq 0xFEFF) {
            $rawH = $rawH.Substring(1)
        }
        $histAnterior = $rawH | ConvertFrom-Json
        if ($histAnterior.registros) {
            foreach ($prop in $histAnterior.registros.PSObject.Properties) {
                $entry = $prop.Value
                $meses = @{}
                if ($entry.meses) {
                    foreach ($m in $entry.meses.PSObject.Properties) {
                        $meses[$m.Name] = $m.Value
                    }
                }
                $deltasManuales = @{}
                if ($null -ne $entry.deltasManuales) {
                    foreach ($d in $entry.deltasManuales.PSObject.Properties) {
                        $deltasManuales[$d.Name] = $d.Value
                    }
                }
                $registros[$prop.Name] = @{
                    meses           = $meses
                    deltasManuales  = $deltasManuales
                    ultimoIntento   = $entry.ultimoIntento
                    ultimaRespuesta = $entry.ultimaRespuesta
                    ultimoEstado    = $entry.ultimoEstado
                }
            }
        }
    } catch {
        Write-Info "historico.json previo invalido, se reinicia."
    }
}

# ============================================================
# Procesar cada impresora
# ============================================================

$t0 = Get-Date
$okCount = 0
$errCount = 0

foreach ($imp in $impresoras) {
    $ip     = [string]$imp.ip
    $serial = [string]$imp.serial
    $key    = if (-not [string]::IsNullOrWhiteSpace($serial)) { $serial } else { $ip }
    if ([string]::IsNullOrWhiteSpace($ip)) { continue }

    Write-Host "Consultando $ip (serial: $key)..." -ForegroundColor Cyan

    if (-not $registros.ContainsKey($key)) {
        $registros[$key] = @{
            meses           = @{}
            deltasManuales  = @{}
            ultimoIntento   = $null
            ultimaRespuesta = $null
            ultimoEstado    = "error"
        }
    }
    $reg = $registros[$key]
    $reg.ultimoIntento = (Get-Date).ToString("o")
    if ($ip.ToUpperInvariant().StartsWith("USB")) {
        Write-Info "  USB  : $ip (se omite)"
        $reg.ultimoEstado = "usb"
        continue
    }

    try {
        $valor = Get-SnmpCounter -HostName $ip -Oid $oid_lexmark -Community $comunidadSNMP -Timeout $timeoutMs -Retries $reintentos
        $reg.meses[$mesActualKey] = [UInt64]$valor
        $reg.ultimaRespuesta      = (Get-Date).ToString("o")
        $reg.ultimoEstado         = "ok"
        $okCount++
        Write-Info "  OK   : $ip = $valor"
    } catch {
        $reg.ultimoEstado = "error"
        $errCount++
        Write-Info "  ERROR: $ip : $($_.Exception.Message)"
    }
}

Write-Info ""
Write-Info "Resumen: $okCount OK, $errCount errores"

# ============================================================
# Guardar historico.json (SIN BOM)
# ============================================================

$salidaRegistros = [ordered]@{}
foreach ($ip in ($registros.Keys | Sort-Object)) {
    $r = $registros[$ip]
    $mesesObj = [ordered]@{}
    foreach ($mk in ($r.meses.Keys | Sort-Object)) {
        $mesesObj[$mk] = $r.meses[$mk]
    }
    $deltasObj = [ordered]@{}
    if ($r.deltasManuales) {
        foreach ($dk in ($r.deltasManuales.Keys | Sort-Object)) {
            $deltasObj[$dk] = $r.deltasManuales[$dk]
        }
    }
    $salidaRegistros[$ip] = [ordered]@{
        meses           = $mesesObj
        deltasManuales  = $deltasObj
        ultimoIntento   = $r.ultimoIntento
        ultimaRespuesta = $r.ultimaRespuesta
        ultimoEstado    = $r.ultimoEstado
    }
}

$historicoSalida = [ordered]@{ registros = $salidaRegistros }
$jsonHist = $historicoSalida | ConvertTo-Json -Depth 10

try {
    [System.IO.File]::WriteAllText($archivoHistorico, $jsonHist, $utf8NoBom)
    Write-Info "historico.json guardado ($($jsonHist.Length) bytes)"
} catch {
    Write-Info "ERROR guardando historico.json: $($_.Exception.Message)"
    exit 1
}

# ============================================================
# Guardar meta.json (SIN BOM)
# ============================================================

$duracion = [int]((Get-Date) - $t0).TotalSeconds
$meta = [ordered]@{
    ultimaActualizacion = (Get-Date).ToString("o")
    ultimaDuracion      = $duracion
    totalImpresoras     = $impresoras.Count
    responden           = $okCount
    sinRespuesta        = $errCount
}
$jsonMeta = $meta | ConvertTo-Json

try {
    [System.IO.File]::WriteAllText($archivoMeta, $jsonMeta, $utf8NoBom)
    Write-Info "meta.json guardado"
} catch {
    Write-Info "ERROR guardando meta.json: $($_.Exception.Message)"
    exit 1
}

Write-Info ""
Write-Info "=== monitor.ps1 terminado en $duracion s ==="
exit 0