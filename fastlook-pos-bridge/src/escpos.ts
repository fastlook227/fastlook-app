import type { BridgeConfig, TicketBridge } from './types.js'

const ESC = 0x1b
const GS = 0x1d
const normalizarAscii = (texto: string) => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '?')
const normalizarWindows1252 = (texto: string) => texto.replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[\u2013\u2014]/g, '-').replace(/[^\x20-\xff]/g, '?')
const normalizar = (texto: string, encoding: BridgeConfig['printer']['encoding']) => encoding === 'ascii' ? normalizarAscii(texto) : normalizarWindows1252(texto)
const cortar = (texto: string, ancho: number, encoding: BridgeConfig['printer']['encoding']) => {
  const palabras = normalizar(texto, encoding).trim().split(/\s+/)
  const lineas: string[] = []
  let actual = ''
  for (const palabraOriginal of palabras) {
    let palabra = palabraOriginal
    while (palabra.length > ancho) { if (actual) { lineas.push(actual); actual = '' } lineas.push(palabra.slice(0, ancho)); palabra = palabra.slice(ancho) }
    if (!palabra) continue
    const siguiente = actual ? `${actual} ${palabra}` : palabra
    if (siguiente.length > ancho) { lineas.push(actual); actual = palabra } else actual = siguiente
  }
  if (actual) lineas.push(actual)
  return lineas.length ? lineas : ['']
}
const dinero = (valor: number) => `$${valor.toFixed(2)}`
const columnas = (izquierda: string, derecha: string, ancho: number) => `${izquierda.slice(0, Math.max(1, ancho - derecha.length - 1))}${' '.repeat(Math.max(1, ancho - izquierda.length - derecha.length))}${derecha}`.slice(0, ancho)

export function textoTicket58(ticket: TicketBridge, ancho = 32, encoding: BridgeConfig['printer']['encoding'] = 'ascii') {
  const separador = '='.repeat(ancho)
  const fino = '-'.repeat(ancho)
  const lineas = [separador, 'FAST LOOK'.padStart(Math.floor((ancho + 9) / 2)).padEnd(ancho), separador, `FOLIO: ${ticket.folio}`, `FECHA: ${ticket.fecha}`, `CAJERO: ${ticket.cajero}`, fino]
  for (const item of ticket.lineas) {
    lineas.push(...cortar(item.nombre, ancho, encoding))
    lineas.push(columnas(`${item.cantidad} x ${dinero(item.precio)}`, dinero(item.subtotal), ancho))
  }
  lineas.push(fino, columnas('TOTAL', dinero(ticket.total), ancho))
  if (ticket.efectivoRecibido !== null) lineas.push(columnas('RECIBIDO', dinero(ticket.efectivoRecibido), ancho))
  if (ticket.cambio !== null) lineas.push(columnas('CAMBIO', dinero(ticket.cambio), ancho))
  lineas.push('', `METODO: ${normalizar(ticket.metodoPago, encoding).toUpperCase()}`, fino, 'GRACIAS POR TU COMPRA'.padStart(Math.floor((ancho + 22) / 2)).padEnd(ancho), separador, '', '', '')
  return lineas.join('\n')
}

export function bytesTicket58(ticket: TicketBridge, config: BridgeConfig) {
  const contenido = textoTicket58(ticket, config.printer.charactersPerLine, config.printer.encoding)
  const texto = Buffer.from(contenido, config.printer.encoding === 'ascii' ? 'ascii' : 'latin1')
  return Buffer.concat([Buffer.from([ESC, 0x40]), Buffer.from(texto), Buffer.from([GS, 0x56, 0x00])])
}

export function bytesCajon(config: BridgeConfig) {
  if (!config.drawer.enabled) throw new Error('DRAWER_NO_CONFIGURADO')
  const unidad = (ms: number) => Math.max(1, Math.min(255, Math.round(ms / 2)))
  return Buffer.from([ESC, 0x70, config.drawer.pin, unidad(config.drawer.pulseOnMs), unidad(config.drawer.pulseOffMs)])
}
