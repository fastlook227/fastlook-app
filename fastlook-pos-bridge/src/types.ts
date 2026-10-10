export interface BridgeConfig {
  port: number
  token: string
  allowedOrigins: string[]
  printer: { name: string; widthMm: 58; charactersPerLine: number; encoding: 'windows-1252' | 'ascii'; profile: 'escpos-generic' }
  drawer: { enabled: boolean; pin: 0 | 1; pulseOnMs: number; pulseOffMs: number }
}

export interface TicketBridge {
  ticketId: string
  folio: string
  fecha: string
  cajero: string
  metodoPago: string
  total: number
  efectivoRecibido: number | null
  cambio: number | null
  lineas: Array<{ nombre: string; cantidad: number; precio: number; subtotal: number; personalizada: boolean }>
}
