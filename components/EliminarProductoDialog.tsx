'use client'

import { AlertTriangle, Trash2, X } from 'lucide-react'
import { useRef, useState } from 'react'
import type { Producto } from '@/types'
import { supabase } from '@/lib/supabase'
import { esRespuestaArchivadoExitosa } from '@/utils/productos'

type RespuestaArchivarProducto = {
  ok?: boolean
  codigo?: string
  producto_id?: string
  archivado?: boolean
}

const mensajesError: Record<string, string> = {
  SIN_SESION: 'Tu sesión terminó. Inicia sesión nuevamente.',
  USUARIO_INACTIVO: 'Tu usuario está inactivo.',
  ROL_NO_PERMITIDO: 'Esta acción requiere permisos de Administrador.',
  PRODUCTO_INEXISTENTE: 'El producto ya no existe.',
  PRODUCTO_ID_INVALIDO: 'No fue posible identificar el producto.',
}

const mensajeSeguro = (mensaje?: string) => {
  const codigo = Object.keys(mensajesError).find((clave) => mensaje?.includes(`${clave}:`))
  return codigo ? mensajesError[codigo] : 'No fue posible eliminar el producto. Inténtalo nuevamente.'
}

export default function EliminarProductoDialog({ producto, onCancelar, onArchivado, onRefrescar }: {
  producto: Producto
  onCancelar: () => void
  onArchivado: () => void | Promise<void>
  onRefrescar: () => Promise<void>
}) {
  const [eliminando, setEliminando] = useState(false)
  const [error, setError] = useState('')
  const eliminandoRef = useRef(false)

  const eliminar = async () => {
    if (eliminandoRef.current) return
    eliminandoRef.current = true
    setEliminando(true)
    setError('')
    try {
      const { data, error: errorRpc } = await supabase.rpc('archivar_producto', {
        p_producto_id: producto.id,
      })
      if (errorRpc) {
        setError(mensajeSeguro(errorRpc.message))
        return
      }
      const respuesta = data as RespuestaArchivarProducto | null
      if (esRespuestaArchivadoExitosa(respuesta)) {
        await onArchivado()
        return
      }
      if (respuesta?.codigo === 'PRODUCTO_CAMBIO_CONCURRENTE') {
        await onRefrescar().catch(() => undefined)
        setError('El producto cambió mientras se confirmaba. El inventario fue actualizado; inténtalo nuevamente.')
        return
      }
      if (respuesta?.codigo && mensajesError[respuesta.codigo]) {
        setError(mensajesError[respuesta.codigo])
        return
      }
      setError('La operación no devolvió una confirmación válida. Actualiza el inventario antes de reintentar.')
    } catch {
      setError('No fue posible eliminar el producto. Revisa tu conexión e inténtalo nuevamente.')
    } finally {
      eliminandoRef.current = false
      setEliminando(false)
    }
  }

  return <div className="fl-delete-product-backdrop" role="presentation">
    <section className="fl-delete-product-dialog" role="alertdialog" aria-modal="true" aria-labelledby="titulo-eliminar-producto" aria-describedby="descripcion-eliminar-producto">
      <header><div><span>INVENTARIO</span><h2 id="titulo-eliminar-producto">Eliminar producto</h2></div><button type="button" aria-label="Cerrar" onClick={onCancelar} disabled={eliminando}><X size={20} /></button></header>
      <div className="fl-delete-product-body"><AlertTriangle size={34} /><strong>{producto.nombre}</strong><small>Código: {producto.codigo}</small><p id="descripcion-eliminar-producto">Este producto dejará de aparecer en las búsquedas, ventas y listados activos.</p><p>Los registros históricos no se eliminarán.</p>{error && <p className="fl-delete-product-error" role="alert">{error}</p>}</div>
      <footer><button type="button" className="is-cancel" onClick={onCancelar} disabled={eliminando}>Cancelar</button><button type="button" className="is-delete" onClick={() => void eliminar()} disabled={eliminando}><Trash2 size={17} />{eliminando ? 'Eliminando…' : 'Eliminar producto'}</button></footer>
    </section>
  </div>
}
