'use client'

import { GripVertical, Maximize2, Minimize2, RotateCcw, ShoppingCart } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CarritoLinea } from '@/types'
import { ajustarAlBorde, limitarPosicionCarrito, obtenerClavePosicionCarrito, obtenerModoViewportCarrito, posicionInicialCarrito, restaurarPosicionCarrito, serializarPosicionCarrito, superoUmbralArrastre, resumirCarritoFlotante, type EntornoCarrito, type ModoViewportCarrito, type PosicionCarrito } from '@/utils/carritoFlotante'

const MARGEN = 12
const CLAVE_MINIMIZADO = 'fastlook_carrito_flotante_minimizado_v1'

function leerSafeAreas() {
  const medidor = document.createElement('div'); medidor.className = 'fl-safe-area-meter'; document.body.appendChild(medidor)
  const estilo = getComputedStyle(medidor)
  const areas = { safeTop: parseFloat(estilo.paddingTop) || 0, safeRight: parseFloat(estilo.paddingRight) || 0, safeBottom: parseFloat(estilo.paddingBottom) || 0, safeLeft: parseFloat(estilo.paddingLeft) || 0 }
  medidor.remove(); return areas
}

function obtenerEntorno(minimizado: boolean): EntornoCarrito {
  const viewport = window.visualViewport
  return { anchoViewport: viewport?.width || window.innerWidth, altoViewport: viewport?.height || window.innerHeight, anchoBurbuja: minimizado ? 52 : 230, altoBurbuja: minimizado ? 52 : 64, margen: MARGEN, reservaIzquierda: 0, reservaInferior: 0, ...leerSafeAreas() }
}

export default function CarritoFlotanteGlobal({ carrito, onAbrirVenta, disabled = false }: { carrito: readonly CarritoLinea[]; onAbrirVenta: () => void; disabled?: boolean }) {
  const resumen = useMemo(() => resumirCarritoFlotante(carrito), [carrito])
  const [posicion, setPosicion] = useState<PosicionCarrito | null>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const [minimizado, setMinimizado] = useState(false)
  const gesto = useRef<{ pointerId: number; inicioPuntero: PosicionCarrito; inicioBurbuja: PosicionCarrito; arrastro: boolean } | null>(null)
  const ignorarClick = useRef(false)
  const modoViewport = useRef<ModoViewportCarrito | null>(null)
  const minimizadoRef = useRef(false)

  useEffect(() => {
    const estado = window.sessionStorage.getItem(CLAVE_MINIMIZADO) === '1'; minimizadoRef.current = estado; setMinimizado(estado)
    const entorno = obtenerEntorno(estado); modoViewport.current = obtenerModoViewportCarrito(entorno.anchoViewport)
    setPosicion(restaurarPosicionCarrito(window.localStorage.getItem(obtenerClavePosicionCarrito(modoViewport.current)), entorno))
    const reajustar = () => { const e = obtenerEntorno(minimizadoRef.current); const modo = obtenerModoViewportCarrito(e.anchoViewport); modoViewport.current = modo; setPosicion((actual) => actual ? limitarPosicionCarrito(actual, e) : posicionInicialCarrito(e)) }
    window.addEventListener('resize', reajustar); window.visualViewport?.addEventListener('resize', reajustar)
    return () => { window.removeEventListener('resize', reajustar); window.visualViewport?.removeEventListener('resize', reajustar) }
  }, [])

  useEffect(() => { minimizadoRef.current = minimizado; window.sessionStorage.setItem(CLAVE_MINIMIZADO, minimizado ? '1' : '0'); setPosicion((actual) => actual ? limitarPosicionCarrito(actual, obtenerEntorno(minimizado)) : actual) }, [minimizado])
  const iniciar = (evento: React.PointerEvent<HTMLElement>) => { if (!posicion || evento.button !== 0) return; evento.currentTarget.setPointerCapture(evento.pointerId); gesto.current = { pointerId: evento.pointerId, inicioPuntero: { x: evento.clientX, y: evento.clientY }, inicioBurbuja: posicion, arrastro: false } }
  const mover = (evento: React.PointerEvent<HTMLElement>) => { const g = gesto.current; if (!g || g.pointerId !== evento.pointerId) return; const p = { x: evento.clientX, y: evento.clientY }; if (!g.arrastro && superoUmbralArrastre(g.inicioPuntero, p)) { g.arrastro = true; setArrastrando(true) }; if (!g.arrastro) return; evento.preventDefault(); setPosicion(limitarPosicionCarrito({ x: g.inicioBurbuja.x + p.x - g.inicioPuntero.x, y: g.inicioBurbuja.y + p.y - g.inicioPuntero.y }, obtenerEntorno(minimizado))) }
  const terminar = (evento: React.PointerEvent<HTMLElement>) => { if (!gesto.current || gesto.current.pointerId !== evento.pointerId) return; const movio = gesto.current.arrastro; gesto.current = null; setArrastrando(false); evento.currentTarget.releasePointerCapture?.(evento.pointerId); if (!movio) return; ignorarClick.current = true; setPosicion((actual) => { const e = obtenerEntorno(minimizado); const final = ajustarAlBorde(actual || posicionInicialCarrito(e), e); window.localStorage.setItem(obtenerClavePosicionCarrito(obtenerModoViewportCarrito(e.anchoViewport)), serializarPosicionCarrito(final)); return final }) }
  const restablecer = () => { const e = obtenerEntorno(minimizado); const p = posicionInicialCarrito(e); setPosicion(p); window.localStorage.setItem(obtenerClavePosicionCarrito(obtenerModoViewportCarrito(e.anchoViewport)), serializarPosicionCarrito(p)) }

  if (minimizado) return <button type="button" className={`fl-global-cart is-minimized${arrastrando ? ' is-dragging' : ''}`} style={posicion ? { left: posicion.x, top: posicion.y } : undefined} aria-label={`Restaurar carrito, ${resumen.unidades} artículos`} disabled={disabled} onPointerDown={iniciar} onPointerMove={mover} onPointerUp={terminar} onPointerCancel={terminar} onClick={() => { if (ignorarClick.current) { ignorarClick.current = false; return }; setMinimizado(false) }}><ShoppingCart /><span className="fl-global-cart-badge">{resumen.unidades}</span><Maximize2 className="fl-global-cart-restore" /></button>
  return <aside className={`fl-global-cart is-expanded${arrastrando ? ' is-dragging' : ''}`} style={posicion ? { left: posicion.x, top: posicion.y } : undefined} aria-label="Carrito flotante"><button type="button" className="fl-global-cart-grip" aria-label="Mover carrito" onPointerDown={iniciar} onPointerMove={mover} onPointerUp={terminar} onPointerCancel={terminar}><GripVertical /></button><button type="button" className="fl-global-cart-open" onClick={() => onAbrirVenta()} disabled={disabled}><ShoppingCart /><span><b>{resumen.unidades} artículos</b><small>${resumen.total.toFixed(2)}</small></span></button><button type="button" className="fl-global-cart-control" onClick={() => setMinimizado(true)} aria-label="Minimizar carrito"><Minimize2 /></button><button type="button" className="fl-global-cart-reset" onClick={restablecer} aria-label="Restablecer posición del carrito"><RotateCcw /></button></aside>
}
