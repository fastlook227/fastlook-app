'use client'

import { ShoppingCart } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CarritoLinea } from '@/types'
import { ajustarAlBorde, limitarPosicionCarrito, obtenerClavePosicionCarrito, obtenerModoViewportCarrito, posicionInicialCarrito, restaurarPosicionCarrito, serializarPosicionCarrito, superoUmbralArrastre, resumirCarritoFlotante, type EntornoCarrito, type ModoViewportCarrito, type PosicionCarrito } from '@/utils/carritoFlotante'

const BURBUJA = 60
const MARGEN = 12
const RESERVA_NAV = 78
const ANCHO_SIDEBAR = 264

function leerSafeAreas() {
  const medidor = document.createElement('div')
  medidor.className = 'fl-safe-area-meter'
  document.body.appendChild(medidor)
  const estilo = getComputedStyle(medidor)
  const areas = { safeTop: parseFloat(estilo.paddingTop) || 0, safeRight: parseFloat(estilo.paddingRight) || 0, safeBottom: parseFloat(estilo.paddingBottom) || 0, safeLeft: parseFloat(estilo.paddingLeft) || 0 }
  medidor.remove()
  return areas
}

function obtenerEntorno(): EntornoCarrito {
  const viewport = window.visualViewport
  const anchoViewport = viewport?.width || window.innerWidth
  const desktop = obtenerModoViewportCarrito(anchoViewport) === 'desktop'
  return { anchoViewport, altoViewport: viewport?.height || window.innerHeight, anchoBurbuja: BURBUJA, altoBurbuja: BURBUJA, margen: MARGEN, reservaIzquierda: desktop ? ANCHO_SIDEBAR : 0, reservaInferior: desktop ? 0 : RESERVA_NAV, ...leerSafeAreas() }
}

export default function CarritoFlotanteGlobal({ carrito, onAbrirVenta, disabled = false }: { carrito: readonly CarritoLinea[]; onAbrirVenta: () => void; disabled?: boolean }) {
  const resumen = useMemo(() => resumirCarritoFlotante(carrito), [carrito])
  const [posicion, setPosicion] = useState<PosicionCarrito | null>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const gesto = useRef<{ pointerId: number; inicioPuntero: PosicionCarrito; inicioBurbuja: PosicionCarrito; arrastro: boolean } | null>(null)
  const ignorarClick = useRef(false)
  const modoViewport = useRef<ModoViewportCarrito | null>(null)

  useEffect(() => {
    const entorno = obtenerEntorno()
    modoViewport.current = obtenerModoViewportCarrito(entorno.anchoViewport)
    setPosicion(restaurarPosicionCarrito(window.localStorage.getItem(obtenerClavePosicionCarrito(modoViewport.current)), entorno))
    const reajustar = () => {
      const siguienteEntorno = obtenerEntorno()
      const siguienteModo = obtenerModoViewportCarrito(siguienteEntorno.anchoViewport)
      if (siguienteModo !== modoViewport.current) {
        modoViewport.current = siguienteModo
        setPosicion(restaurarPosicionCarrito(window.localStorage.getItem(obtenerClavePosicionCarrito(siguienteModo)), siguienteEntorno))
        return
      }
      setPosicion((actual) => actual ? limitarPosicionCarrito(actual, siguienteEntorno) : posicionInicialCarrito(siguienteEntorno))
    }
    window.addEventListener('resize', reajustar)
    window.visualViewport?.addEventListener('resize', reajustar)
    return () => { window.removeEventListener('resize', reajustar); window.visualViewport?.removeEventListener('resize', reajustar) }
  }, [])

  const terminar = (evento: React.PointerEvent<HTMLButtonElement>) => {
    if (!gesto.current || gesto.current.pointerId !== evento.pointerId) return
    const fueArrastre = gesto.current.arrastro
    gesto.current = null; setArrastrando(false)
    evento.currentTarget.releasePointerCapture?.(evento.pointerId)
    if (fueArrastre) {
      ignorarClick.current = true
      setPosicion((actual) => {
        const entorno = obtenerEntorno()
        const final = ajustarAlBorde(actual || posicionInicialCarrito(entorno), entorno)
        const modo = obtenerModoViewportCarrito(entorno.anchoViewport)
        modoViewport.current = modo
        window.localStorage.setItem(obtenerClavePosicionCarrito(modo), serializarPosicionCarrito(final))
        return final
      })
    }
  }

  return <button
    type="button"
    className={`fl-global-cart${arrastrando ? ' is-dragging' : ''}`}
    style={posicion ? { left: posicion.x, top: posicion.y } : undefined}
    aria-label="Abrir carrito de venta"
    disabled={disabled}
    onPointerDown={(evento) => {
      if (!posicion || evento.button !== 0) return
      evento.currentTarget.setPointerCapture(evento.pointerId)
      gesto.current = { pointerId: evento.pointerId, inicioPuntero: { x: evento.clientX, y: evento.clientY }, inicioBurbuja: posicion, arrastro: false }
    }}
    onPointerMove={(evento) => {
      const activo = gesto.current
      if (!activo || activo.pointerId !== evento.pointerId) return
      const puntero = { x: evento.clientX, y: evento.clientY }
      if (!activo.arrastro && superoUmbralArrastre(activo.inicioPuntero, puntero)) { activo.arrastro = true; setArrastrando(true) }
      if (!activo.arrastro) return
      evento.preventDefault()
      setPosicion(limitarPosicionCarrito({ x: activo.inicioBurbuja.x + puntero.x - activo.inicioPuntero.x, y: activo.inicioBurbuja.y + puntero.y - activo.inicioPuntero.y }, obtenerEntorno()))
    }}
    onPointerUp={terminar}
    onPointerCancel={terminar}
    onClick={() => { if (ignorarClick.current) { ignorarClick.current = false; return } onAbrirVenta() }}
  >
    <ShoppingCart aria-hidden="true" />
    <span className="fl-global-cart-badge" aria-label={`${resumen.unidades} artículos en el carrito`}>{resumen.unidades}</span>
  </button>
}
