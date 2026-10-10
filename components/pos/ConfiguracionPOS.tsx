'use client'

import { useEffect, useState } from 'react'
import { guardarTokenPOSLocal, obtenerTokenPOSLocal, servicioPOSLocal, type EstadoPOS } from '@/lib/pos/servicioPOS'
import type { TicketPOS } from '@/utils/pos'

const ticketPrueba: TicketPOS = { ticketId: 'prueba-local', folio: 'PRUEBA', fecha: new Date().toISOString(), cajero: 'Administrador', metodoPago: 'Prueba', total: 0, efectivoRecibido: null, cambio: null, lineas: [{ nombre: 'Prueba de impresora Fast Look', cantidad: 1, precio: 0, subtotal: 0, personalizada: false }] }

export default function ConfiguracionPOS() {
  const [token, setToken] = useState('')
  const [estado, setEstado] = useState<EstadoPOS | null>(null)
  const [mensaje, setMensaje] = useState('')
  const [ocupado, setOcupado] = useState(false)
  useEffect(() => { setToken(obtenerTokenPOSLocal()) }, [])
  const ejecutar = async (accion: () => Promise<void>, exito: string) => { setOcupado(true); setMensaje(''); try { await accion(); setMensaje(exito) } catch { setMensaje('No fue posible comunicarse con Fast Look POS Bridge.') } finally { setOcupado(false) } }
  const consultar = () => ejecutar(async () => setEstado(await servicioPOSLocal.obtenerEstado()), 'Estado actualizado.')
  return <section className="fl-pos-settings" aria-labelledby="titulo-config-pos">
    <header><span>HARDWARE DE CAJA</span><h2 id="titulo-config-pos">Configuración POS</h2><p>Disponible únicamente en esta PC. La configuración física vive en Fast Look POS Bridge.</p></header>
    <label>Token local<input type="password" value={token} autoComplete="off" onChange={(e) => setToken(e.target.value)} /></label>
    <div className="fl-pos-settings-actions"><button type="button" onClick={() => { guardarTokenPOSLocal(token); void consultar() }} disabled={ocupado || token.trim().length < 24}>Guardar y comprobar</button><button type="button" onClick={() => void consultar()} disabled={ocupado}>Actualizar estado</button></div>
    <div className="fl-pos-status-grid">
      <article><span>Bridge</span><b className={estado?.bridgeDisponible ? 'is-ok' : ''}>{estado?.bridgeDisponible ? 'Conectado' : 'Desconectado'}</b></article>
      <article><span>Impresora</span><b className={estado?.impresoraDisponible ? 'is-ok' : ''}>{estado?.impresoraDisponible ? estado.impresoraNombre || 'Conectada' : 'No configurada'}</b></article>
      <article><span>Cajón</span><b className={estado?.cajonDisponible ? 'is-ok' : ''}>{estado?.cajonDisponible ? 'Disponible' : 'No disponible'}</b></article>
    </div>
    <div className="fl-pos-settings-actions"><button type="button" onClick={() => void ejecutar(() => servicioPOSLocal.imprimirTicket(ticketPrueba), 'Ticket de prueba enviado.') } disabled={ocupado || !estado?.impresoraDisponible}>Probar impresora</button><button type="button" onClick={() => void ejecutar(() => servicioPOSLocal.abrirCajon(), 'Comando enviado al cajón.') } disabled={ocupado || !estado?.cajonDisponible}>Abrir cajón</button></div>
    {mensaje && <p role="status">{mensaje}</p>}
  </section>
}
