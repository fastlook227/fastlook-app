'use client'

import { Barcode, CheckCircle, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Producto } from '@/types'
import { normalizarCodigoBarras } from '@/utils/codigoBarras'

type RespuestaBarcode = {
  ok?: boolean
  codigo?: string
  producto_id?: string
  producto_existente_id?: string
  codigo_anterior?: string | null
  codigo_nuevo?: string | null
}

const mensajesError: Record<string, string> = {
  SIN_SESION: 'Tu sesión terminó. Inicia sesión nuevamente.',
  USUARIO_INACTIVO: 'Tu usuario está inactivo.',
  ROL_NO_PERMITIDO: 'Esta acción requiere permisos de Administrador.',
  PRODUCTO_INEXISTENTE: 'El producto ya no existe.',
}

const mensajeSeguro = (mensaje?: string) => {
  const codigo = Object.keys(mensajesError).find((clave) => mensaje?.includes(`${clave}:`))
  return codigo ? mensajesError[codigo] : 'No fue posible guardar el código de barras. Inténtalo nuevamente.'
}

export default function CodigoBarrasDialog({ producto, productos, onCerrar, onActualizado }: {
  producto: Producto
  productos: Producto[]
  onCerrar: () => void
  onActualizado: () => Promise<void>
}) {
  const [codigo, setCodigo] = useState(producto.codigo_barras || '')
  const [guardando, setGuardando] = useState(false)
  const guardandoRef = useRef(false)
  const [error, setError] = useState('')
  const [duplicado, setDuplicado] = useState<Producto | null>(null)
  const [resultado, setResultado] = useState<{ anterior: string | null; nuevo: string | null; sinCambios: boolean } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => {
    if (!resultado) return
    const temporizador = window.setTimeout(onCerrar, 1600)
    return () => window.clearTimeout(temporizador)
  }, [onCerrar, resultado])

  const guardar = async (codigoSolicitado: string | null) => {
    if (guardandoRef.current || resultado) return
    const normalizado = codigoSolicitado === null ? null : normalizarCodigoBarras(codigoSolicitado)
    if (codigoSolicitado !== null && !normalizado) {
      setError('Escribe un código de barras válido o utiliza “Quitar código”.')
      return
    }

    guardandoRef.current = true
    setGuardando(true)
    setError('')
    setDuplicado(null)
    try {
      const { data, error: errorRpc } = await supabase.rpc('asignar_codigo_barras_producto', {
        p_producto_id: producto.id,
        p_codigo_barras: normalizado || null,
      })
      if (errorRpc) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('Error controlado en asignar_codigo_barras_producto:', {
            code: errorRpc.code,
            message: errorRpc.message,
            details: errorRpc.details,
            hint: errorRpc.hint,
          })
        }
        setError(mensajeSeguro(errorRpc.message))
        return
      }

      const respuesta = data as RespuestaBarcode | null
      if (respuesta?.codigo === 'CODIGO_BARRAS_DUPLICADO') {
        const propietario = productos.find((item) => item.id === respuesta.producto_existente_id) || null
        setDuplicado(propietario)
        setError(propietario ? '' : 'Este código ya está asignado a otro producto.')
        return
      }
      if (respuesta?.ok && (respuesta.codigo === 'CODIGO_BARRAS_ACTUALIZADO' || respuesta.codigo === 'CODIGO_BARRAS_SIN_CAMBIOS')) {
        setResultado({
          anterior: respuesta.codigo_anterior ?? null,
          nuevo: respuesta.codigo_nuevo ?? null,
          sinCambios: respuesta.codigo === 'CODIGO_BARRAS_SIN_CAMBIOS',
        })
        await onActualizado().catch(() => undefined)
        return
      }
      setError('La operación no devolvió una confirmación válida. Actualiza el inventario antes de reintentar.')
    } catch {
      setError('No fue posible guardar el código de barras. Revisa tu conexión e inténtalo nuevamente.')
    } finally {
      guardandoRef.current = false
      setGuardando(false)
    }
  }

  return <div className="fl-barcode-dialog-backdrop" role="presentation">
    <section className="fl-barcode-dialog" role="dialog" aria-modal="true" aria-labelledby="titulo-barcode">
      <header><div><span>PRODUCTO</span><h2 id="titulo-barcode">Asignar código de barras</h2></div><button type="button" aria-label="Cerrar" onClick={onCerrar} disabled={guardando}><X size={20} /></button></header>
      {resultado ? <div className="fl-barcode-result" role="status"><CheckCircle size={38} /><h3>{resultado.sinCambios ? 'Código sin cambios' : resultado.nuevo ? 'Código actualizado' : 'Código eliminado'}</h3><p>{resultado.anterior || 'Sin código'} → {resultado.nuevo || 'Sin código'}</p></div> : <div className="fl-barcode-dialog-body">
        <strong>{producto.nombre}</strong>
        <dl><div><dt>Código Fast Look</dt><dd>{producto.codigo}</dd></div><div><dt>Código de barras actual</dt><dd>{producto.codigo_barras || 'Sin código asignado'}</dd></div></dl>
        <label><span>Nuevo código</span><div><Barcode size={20} /><input ref={inputRef} value={codigo} onChange={(evento) => { setCodigo(evento.target.value); setError(''); setDuplicado(null) }} onKeyDown={(evento) => { if (evento.key === 'Enter') { evento.preventDefault(); void guardar(codigo) } }} placeholder="Escanea o escribe el código" /></div><small>El lector puede escribir aquí y confirmar con Enter.</small></label>
        {duplicado && <div className="fl-barcode-duplicate" role="alert"><b>Este código ya pertenece a:</b><strong>{duplicado.nombre}</strong><span>{duplicado.codigo}</span></div>}
        {error && <p className="fl-barcode-error" role="alert">{error}</p>}
      </div>}
      <footer><button type="button" className="is-cancel" onClick={onCerrar} disabled={guardando}>Cancelar</button>{!resultado && producto.codigo_barras && <button type="button" className="is-remove" onClick={() => void guardar(null)} disabled={guardando}><Trash2 size={16} />Quitar código</button>}{!resultado && <button type="button" className="is-primary" onClick={() => void guardar(codigo)} disabled={guardando || !normalizarCodigoBarras(codigo)}>{guardando ? 'Guardando…' : 'Guardar código'}</button>}</footer>
    </section>
  </div>
}
