'use client'

import { AlertTriangle, Barcode, CheckCircle, FileDown, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import type { Producto } from '@/types'
import type { RespuestaAsignacionCodigosBarras } from '@/types/codigosBarras'
import { supabase } from '@/lib/supabase'
import SelectorPDFProductos from '@/components/codigos-barras/SelectorPDFProductos'

const mensajesError: Record<string, string> = {
  SIN_SESION: 'Tu sesión terminó. Inicia sesión nuevamente.',
  USUARIO_INACTIVO: 'Tu usuario está inactivo.',
  ROL_NO_PERMITIDO: 'Esta acción requiere permisos de Administrador.',
}

const mensajeSeguro = (mensaje?: string) => {
  const codigo = Object.keys(mensajesError).find((clave) => mensaje?.includes(`${clave}:`))
  return codigo ? mensajesError[codigo] : 'No fue posible asignar los códigos de barras. Inténtalo nuevamente.'
}

export default function HerramientasCodigosBarras({ productos, onActualizar }: {
  productos: Producto[]
  onActualizar: () => Promise<void>
}) {
  const [selectorAbierto, setSelectorAbierto] = useState(false)
  const [dialogoAbierto, setDialogoAbierto] = useState(false)
  const [asignando, setAsignando] = useState(false)
  const [respuesta, setRespuesta] = useState<RespuestaAsignacionCodigosBarras | null>(null)
  const [error, setError] = useState('')
  const asignandoRef = useRef(false)
  const pendientes = useMemo(() => productos.filter((producto) => producto.codigo_barras == null).length, [productos])
  const productosPorId = useMemo(() => new Map(productos.map((producto) => [producto.id, producto])), [productos])

  const abrirConfirmacion = () => {
    setRespuesta(null)
    setError('')
    setDialogoAbierto(true)
  }

  const asignar = async () => {
    if (asignandoRef.current) return
    asignandoRef.current = true
    setAsignando(true)
    setError('')
    try {
      const { data, error: errorRpc } = await supabase.rpc('asignar_codigos_barras_faltantes')
      if (errorRpc) {
        setError(mensajeSeguro(errorRpc.message))
        return
      }
      const resultado = data as RespuestaAsignacionCodigosBarras | null
      if (!resultado || !['CODIGOS_BARRAS_ASIGNADOS', 'CONFLICTOS_CODIGOS_BARRAS'].includes(resultado.codigo)) {
        setError('La operación no devolvió una respuesta válida. Actualiza el inventario antes de reintentar.')
        return
      }
      setRespuesta(resultado)
      if (resultado.ok && resultado.codigo === 'CODIGOS_BARRAS_ASIGNADOS') {
        await onActualizar().catch(() => setError('Los códigos se asignaron, pero no fue posible refrescar el inventario. Actualízalo antes de continuar.'))
      }
    } catch {
      setError('No fue posible asignar los códigos de barras. Revisa tu conexión e inténtalo nuevamente.')
    } finally {
      asignandoRef.current = false
      setAsignando(false)
    }
  }

  return <>
    <section className="fl-barcode-tools">
      <div><Barcode size={24} /><span><strong>Códigos de barras</strong><small>{pendientes} {pendientes === 1 ? 'producto sin código de barras' : 'productos sin código de barras'}</small></span></div>
      <div><button type="button" onClick={abrirConfirmacion} disabled={pendientes === 0}><Barcode size={17} />Asignar códigos faltantes</button><button type="button" onClick={() => setSelectorAbierto(true)}><FileDown size={17} />Códigos de barras de productos PDF</button></div>
    </section>

    {dialogoAbierto && <div className="fl-bulk-barcode-backdrop" role="presentation"><section className="fl-bulk-barcode-dialog" role="dialog" aria-modal="true" aria-labelledby="titulo-asignacion-masiva">
      <header><div><span>FAST LOOK · INVENTARIO</span><h2 id="titulo-asignacion-masiva">Asignar códigos de barras faltantes</h2></div><button type="button" aria-label="Cerrar" onClick={() => setDialogoAbierto(false)} disabled={asignando}><X size={20} /></button></header>
      <div className="fl-bulk-barcode-body">
        {respuesta?.ok ? <section className="fl-bulk-barcode-success" role="status"><CheckCircle size={38} /><h3>Códigos asignados</h3><p><b>{respuesta.productos_actualizados}</b> productos actualizados.</p><p>Los códigos existentes se conservaron.</p></section> : respuesta?.codigo === 'CONFLICTOS_CODIGOS_BARRAS' ? <section className="fl-bulk-barcode-conflicts" role="alert"><AlertTriangle size={34} /><h3>No se realizaron cambios.</h3><p>Se encontraron {respuesta.conflictos} conflictos.</p><div>{respuesta.detalle_conflictos.map((conflicto, indice) => { const afectado = productosPorId.get(conflicto.producto_id); const relacionado = conflicto.producto_conflicto_id ? productosPorId.get(conflicto.producto_conflicto_id) : null; return <article key={`${conflicto.tipo}-${conflicto.producto_id}-${indice}`}><strong>{conflicto.codigo || 'Código vacío'}</strong><span>{conflicto.tipo.replaceAll('_', ' ')}</span><small>Producto afectado: {afectado ? `${afectado.nombre} (${afectado.codigo})` : conflicto.producto_id}</small>{conflicto.producto_conflicto_id && <small>Producto en conflicto: {relacionado ? `${relacionado.nombre} (${relacionado.codigo})` : conflicto.producto_conflicto_id}</small>}</article> })}</div></section> : <><p>Los productos que todavía no tienen código de barras recibirán su Código Fast Look como código de barras.</p><p>Los códigos de fabricante existentes no serán modificados.</p><strong>Productos pendientes: {pendientes}</strong></>}
        {error && <p className="fl-bulk-barcode-error" role="alert">{error}</p>}
      </div>
      <footer>{respuesta ? <button type="button" className="is-primary" onClick={() => setDialogoAbierto(false)}>Cerrar</button> : <><button type="button" className="is-cancel" onClick={() => setDialogoAbierto(false)} disabled={asignando}>Cancelar</button><button type="button" className="is-primary" onClick={() => void asignar()} disabled={asignando || pendientes === 0}>{asignando ? 'Asignando…' : 'Asignar códigos'}</button></>}</footer>
    </section></div>}

    {selectorAbierto && <SelectorPDFProductos productos={productos} onCerrar={() => setSelectorAbierto(false)} onAsignarFaltantes={abrirConfirmacion} />}
  </>
}
