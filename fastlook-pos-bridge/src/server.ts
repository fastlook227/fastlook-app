import { createHash, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { cargarConfig } from './config.js'
import { bytesCajon, bytesTicket58 } from './escpos.js'
import { validarTicket } from './validation.js'
import { estadoImpresora, imprimirRaw } from './windowsPrinter.js'

const config = cargarConfig()
const MAX_BODY = 64 * 1024
const hash = (valor: string) => createHash('sha256').update(valor).digest()
const tokenEsperado = hash(config.token)
const responder = (res: ServerResponse, status: number, body: object) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(body)) }
const tokenValido = (req: IncomingMessage) => { const recibido = req.headers['x-fastlook-pos-token']; if (typeof recibido !== 'string') return false; return timingSafeEqual(hash(recibido), tokenEsperado) }
const leerJson = async (req: IncomingMessage) => {
  const partes: Buffer[] = []; let total = 0
  for await (const parte of req) { const buffer = Buffer.from(parte); total += buffer.length; if (total > MAX_BODY) throw new Error('PAYLOAD_DEMASIADO_GRANDE'); partes.push(buffer) }
  return JSON.parse(Buffer.concat(partes).toString('utf8') || '{}') as unknown
}
const aplicarCors = (req: IncomingMessage, res: ServerResponse) => {
  const origen = req.headers.origin
  if (!origen) return true
  if (!config.allowedOrigins.includes(origen)) return false
  res.setHeader('Access-Control-Allow-Origin', origen); res.setHeader('Vary', 'Origin'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-FastLook-POS-Token'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); res.setHeader('Access-Control-Max-Age', '600')
  if (req.headers['access-control-request-private-network'] === 'true') res.setHeader('Access-Control-Allow-Private-Network', 'true')
  return true
}

const server = createServer(async (req, res) => {
  const inicio = Date.now(); const ruta = new URL(req.url || '/', 'http://127.0.0.1').pathname
  const log = (status: number) => console.log(JSON.stringify({ at: new Date().toISOString(), method: req.method, route: ruta, status, ms: Date.now() - inicio }))
  try {
    if (!aplicarCors(req, res)) { log(403); return responder(res, 403, { ok: false, error: 'ORIGIN_NO_PERMITIDO' }) }
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end() }
    if (!tokenValido(req)) { log(401); return responder(res, 401, { ok: false, error: 'TOKEN_INVALIDO' }) }
    if (req.method === 'GET' && ruta === '/status') {
      const impresora = await estadoImpresora(config.printer.name); log(200)
      return responder(res, 200, { bridgeDisponible: true, version: '1.0.0', impresoraDisponible: impresora.disponible, impresoraNombre: impresora.nombre, impresoraPuerto: impresora.puerto, cajonConfigurado: config.drawer.enabled, cajonDisponible: config.drawer.enabled && impresora.disponible })
    }
    if (req.method === 'POST' && ruta === '/print') {
      const body = await leerJson(req) as { ticket?: unknown }; const ticket = validarTicket(body.ticket)
      await imprimirRaw(config.printer.name, bytesTicket58(ticket, config)); log(200); return responder(res, 200, { ok: true })
    }
    if (req.method === 'POST' && ruta === '/drawer/open') {
      await leerJson(req); await imprimirRaw(config.printer.name, bytesCajon(config)); log(200); return responder(res, 200, { ok: true })
    }
    log(404); return responder(res, 404, { ok: false, error: 'RUTA_NO_ENCONTRADA' })
  } catch (error) {
    const codigo = error instanceof Error ? error.message : 'ERROR_INTERNO'; const status = codigo === 'PAYLOAD_DEMASIADO_GRANDE' ? 413 : codigo.includes('INVALID') || codigo.startsWith('TICKET_') ? 400 : 503
    log(status); return responder(res, status, { ok: false, error: codigo })
  }
})

server.requestTimeout = 7000; server.headersTimeout = 5000; server.keepAliveTimeout = 1000
server.listen(config.port, '127.0.0.1', () => console.log(JSON.stringify({ at: new Date().toISOString(), event: 'ready', host: '127.0.0.1', port: config.port })))
