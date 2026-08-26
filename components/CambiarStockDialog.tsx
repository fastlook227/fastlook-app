'use client'

import { AlertTriangle, CheckCircle, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Producto } from '@/types'

type RespuestaCambioStock = {
  ok?: boolean
  codigo?: string
  mensaje?: string
  stock_actual?: number
  stock_esperado?: number
  stock_nuevo_solicitado?: number
  stock_anterior?: number
  stock_nuevo?: number
  diferencia?: number
}

type ConflictoStock = {
  stockActual: number
  stockEsperado: number
  stockNuevoSolicitado: number
}

type ResultadoStock = {
  codigo: 'STOCK_ACTUALIZADO' | 'STOCK_SIN_CAMBIOS'
  stockAnterior: number
  stockNuevo: number
  diferencia: number
}

const mensajesError: Record<string, string> = {
  SIN_SESION: 'Tu sesión terminó. Inicia sesión nuevamente.',
  USUARIO_INACTIVO: 'Tu usuario está inactivo.',
  ROL_NO_PERMITIDO: 'Esta acción requiere permisos de Administrador.',
  PRODUCTO_INEXISTENTE: 'El producto ya no existe.',
  STOCK_INVALIDO: 'El stock debe ser un número entero mayor o igual a cero.',
  MOTIVO_INVALIDO: 'El motivo no puede superar 500 caracteres.',
}

const mensajeSeguro = (error: { code?: string; message?: string }) => {
  if (error.code === '22P02' || error.code === '42883') {
    return 'El stock debe ser un número entero válido.'
  }
  const codigo = Object.keys(mensajesError).find((clave) => error.message?.includes(`${clave}:`))
  return codigo ? mensajesError[codigo] : 'No fue posible cambiar el stock. Intenta nuevamente.'
}

export default function CambiarStockDialog({ producto, onCerrar, onRefrescar }: {
  producto: Producto
  onCerrar: () => void
  onRefrescar: () => Promise<void>
}) {
  const stockInicial = Number(producto.stock)
  const [stockEsperado, setStockEsperado] = useState(stockInicial)
  const [stockNuevo, setStockNuevo] = useState(String(stockInicial))
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState('')
  const [conflicto, setConflicto] = useState<ConflictoStock | null>(null)
  const [resultado, setResultado] = useState<ResultadoStock | null>(null)
  const [actualizando, setActualizando] = useState(false)
  const actualizandoRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const stockValido = /^\d+$/.test(stockNuevo)
  const stockNumerico = stockValido ? Number(stockNuevo) : null
  const motivoValido = motivo.length <= 500
  const diferencia = stockNumerico === null ? null : stockNumerico - stockEsperado

  const resumen = useMemo(() => {
    if (diferencia === null) return ''
    if (diferencia < 0) return `Vas a retirar ${Math.abs(diferencia)} ${Math.abs(diferencia) === 1 ? 'pieza' : 'piezas'}.`
    if (diferencia > 0) return `Vas a agregar ${diferencia} ${diferencia === 1 ? 'pieza' : 'piezas'}.`
    return 'Sin cambios.'
  }, [diferencia])

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    if (!resultado) return
    const temporizador = window.setTimeout(onCerrar, 1800)
    return () => window.clearTimeout(temporizador)
  }, [onCerrar, resultado])

  const confirmar = async () => {
    if (actualizandoRef.current || resultado) return
    setError('')
    if (!stockValido || stockNumerico === null || !Number.isSafeInteger(stockNumerico)) {
      setError('El stock debe ser un número entero válido.')
      return
    }
    if (!motivoValido) {
      setError(mensajesError.MOTIVO_INVALIDO)
      return
    }

    actualizandoRef.current = true
    setActualizando(true)
    try {
      const { data, error: errorRpc } = await supabase.rpc('cambiar_stock_producto', {
        p_producto_id: producto.id,
        p_stock_esperado: stockEsperado,
        p_stock_nuevo: stockNumerico,
        p_motivo: motivo.trim() || null,
      })
      if (errorRpc) {
        setError(mensajeSeguro(errorRpc))
        return
      }

      const respuesta = data as RespuestaCambioStock | null
      if (respuesta?.codigo === 'STOCK_CAMBIO') {
        if (
          typeof respuesta.stock_actual !== 'number' ||
          typeof respuesta.stock_esperado !== 'number' ||
          typeof respuesta.stock_nuevo_solicitado !== 'number'
        ) {
          setError('El stock cambió, pero no fue posible obtener el valor actualizado.')
          return
        }
        setConflicto({
          stockActual: respuesta.stock_actual,
          stockEsperado: respuesta.stock_esperado,
          stockNuevoSolicitado: respuesta.stock_nuevo_solicitado,
        })
        return
      }

      if (respuesta?.ok && (respuesta.codigo === 'STOCK_ACTUALIZADO' || respuesta.codigo === 'STOCK_SIN_CAMBIOS')) {
        const stockAnterior = Number(respuesta.stock_anterior)
        const stockFinal = Number(respuesta.stock_nuevo)
        const diferenciaFinal = Number(respuesta.diferencia || 0)
        setResultado({
          codigo: respuesta.codigo,
          stockAnterior,
          stockNuevo: stockFinal,
          diferencia: diferenciaFinal,
        })
        await onRefrescar().catch(() => undefined)
        return
      }

      setError('La operación no devolvió una confirmación válida. Refresca el inventario antes de reintentar.')
    } catch {
      setError('No fue posible cambiar el stock. Revisa tu conexión e intenta nuevamente.')
    } finally {
      actualizandoRef.current = false
      setActualizando(false)
    }
  }

  const usarStockActualizado = () => {
    if (!conflicto) return
    setStockEsperado(conflicto.stockActual)
    setConflicto(null)
    setError('')
  }

  return <div className="fl-stock-dialog-backdrop" role="presentation">
    <section className="fl-stock-dialog" role="dialog" aria-modal="true" aria-labelledby="titulo-cambiar-stock">
      <header>
        <div><span>AJUSTE RÁPIDO</span><h2 id="titulo-cambiar-stock">Cambiar stock a…</h2></div>
        <button type="button" aria-label="Cerrar" onClick={onCerrar} disabled={actualizando}><X size={20} /></button>
      </header>

      {resultado ? <div className="fl-stock-result" role="status">
        <CheckCircle size={38} />
        <h3>{resultado.codigo === 'STOCK_ACTUALIZADO' ? 'Stock actualizado' : 'Stock sin cambios.'}</h3>
        <strong>{resultado.stockAnterior} → {resultado.stockNuevo}</strong>
        {resultado.codigo === 'STOCK_ACTUALIZADO' && <p>Diferencia: {resultado.diferencia > 0 ? '+' : ''}{resultado.diferencia}</p>}
      </div> : conflicto ? <div className="fl-stock-conflict" role="alert">
        <AlertTriangle size={34} />
        <h3>El stock cambió mientras realizabas el ajuste.</h3>
        <dl>
          <div><dt>Cuando abriste</dt><dd>{conflicto.stockEsperado}</dd></div>
          <div><dt>Stock actual</dt><dd>{conflicto.stockActual}</dd></div>
          <div><dt>Querías establecer</dt><dd>{conflicto.stockNuevoSolicitado}</dd></div>
        </dl>
      </div> : <div className="fl-stock-dialog-body">
        <strong className="fl-stock-product-name">{producto.nombre}</strong>
        <div className="fl-stock-current"><span>Stock actual</span><strong>{stockEsperado}</strong></div>
        <label>
          <span>Cambiar stock a</span>
          <input ref={inputRef} type="text" inputMode="numeric" value={stockNuevo} onChange={(evento) => { setStockNuevo(evento.target.value); setError('') }} aria-invalid={Boolean(error) && !stockValido} />
        </label>
        <label>
          <span>Motivo opcional</span>
          <input type="text" maxLength={501} placeholder="Conteo físico" value={motivo} onChange={(evento) => { setMotivo(evento.target.value); setError('') }} aria-invalid={!motivoValido} />
          <small className={!motivoValido ? 'is-error' : ''}>{motivo.length}/500</small>
        </label>
        {resumen && <p className={`fl-stock-summary ${diferencia && diferencia < 0 ? 'is-down' : diferencia && diferencia > 0 ? 'is-up' : ''}`}>{resumen}</p>}
        {error && <p className="fl-stock-error" role="alert">{error}</p>}
      </div>}

      <footer>
        <button type="button" className="is-cancel" onClick={onCerrar} disabled={actualizando}>Cancelar</button>
        {conflicto ? <button type="button" className="is-primary" onClick={usarStockActualizado}>Usar stock actualizado</button> : !resultado && <button type="button" className="is-primary" onClick={() => void confirmar()} disabled={actualizando || !stockValido || !motivoValido}>{actualizando ? 'Actualizando…' : 'Cambiar stock'}</button>}
      </footer>
    </section>
  </div>
}
