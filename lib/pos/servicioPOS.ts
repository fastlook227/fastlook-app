import type { TicketPOS } from '@/utils/pos'

export interface EstadoPOS { bridgeDisponible: boolean; impresoraDisponible: boolean; impresoraNombre: string | null; cajonConfigurado: boolean }
export interface ServicioPOS { obtenerEstado(): Promise<EstadoPOS>; imprimirTicket(ticket: TicketPOS): Promise<void>; abrirCajon(): Promise<void> }

const URL_BRIDGE = 'http://127.0.0.1:17891'
const TOKEN_KEY = 'fastlook_pos_bridge_token_v1'
const tokenLocal = () => window.localStorage.getItem(TOKEN_KEY) || ''

async function solicitar<T>(ruta: string, opciones?: RequestInit): Promise<T> {
  const respuesta = await fetch(`${URL_BRIDGE}${ruta}`, { ...opciones, signal: AbortSignal.timeout(3500), headers: { 'Content-Type': 'application/json', 'X-FastLook-POS-Token': tokenLocal(), ...opciones?.headers } })
  if (!respuesta.ok) throw new Error(`POS_BRIDGE_${respuesta.status}`)
  return respuesta.json() as Promise<T>
}

export const servicioPOSLocal: ServicioPOS = {
  obtenerEstado: () => solicitar<EstadoPOS>('/status'),
  imprimirTicket: async (ticket) => { await solicitar('/print', { method: 'POST', body: JSON.stringify({ ticket }) }) },
  abrirCajon: async () => { await solicitar('/drawer/open', { method: 'POST', body: '{}' }) },
}
