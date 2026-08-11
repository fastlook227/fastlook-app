'use client'

import { AlertCircle, FileDown, PackageX, Plus, RotateCw, Shield, Sparkles, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Producto, RolUsuario } from '@/types'
import type { CascoCatalogo, OpcionesPDFCascos } from '@/types/cascos'
import { agruparCascosPorPrecio, esProductoCasco, normalizarTextoCasco, obtenerCascosDisponibles } from '@/utils/cascos'
import { generarPDFCascos } from '@/utils/pdfCascos'
import { generarCodigoProductoDisponible } from '@/utils/codigosProducto'
import { comprimirImagenProducto } from '@/utils/imagenes'
import { supabase } from '@/lib/supabase'
import LoadingOverlay from '@/components/LoadingOverlay'
import CascosAgotados from '@/components/cascos/CascosAgotados'
import EliminarCascoDialog from '@/components/cascos/EliminarCascoDialog'
import FiltrosCascos from '@/components/cascos/FiltrosCascos'
import FormularioCasco from '@/components/cascos/FormularioCasco'
import ReponerStockCascoDialog from '@/components/cascos/ReponerStockCascoDialog'
import SelectorPDFCascos from '@/components/cascos/SelectorPDFCascos'
import TarjetaCasco from '@/components/cascos/TarjetaCasco'
import VisorCasco from '@/components/cascos/VisorCasco'

interface CatalogoCascosProps {
  productos: Producto[]
  rol: RolUsuario
  error: string
  onReintentar: () => Promise<void>
  onProductoActualizado: (producto: Producto) => void
  onProductoEliminado: (productoId: string) => void
  onVender: (producto: Producto) => { ok: boolean; mensaje: string }
  onIrAVenta: () => void
}

export default function CatalogoCascos({ productos, rol, error, onReintentar, onProductoActualizado, onProductoEliminado, onVender, onIrAVenta }: CatalogoCascosProps) {
  const [busqueda, setBusqueda] = useState('')
  const [talla, setTalla] = useState('')
  const [certificacion, setCertificacion] = useState('')
  const [cascoActivo, setCascoActivo] = useState<CascoCatalogo | null>(null)
  const [reintentando, setReintentando] = useState(false)
  const [selectorPDFAbierto, setSelectorPDFAbierto] = useState(false)
  const [generandoPDF, setGenerandoPDF] = useState(false)
  const [progresoPDF, setProgresoPDF] = useState({ procesado: 0, total: 0 })
  const [mostrarAgotados, setMostrarAgotados] = useState(false)
  const [formularioCasco, setFormularioCasco] = useState<CascoCatalogo | null | 'nuevo'>(null)
  const [codigoInicial, setCodigoInicial] = useState('')
  const [cascoReponer, setCascoReponer] = useState<CascoCatalogo | null>(null)
  const [cascoArchivar, setCascoArchivar] = useState<CascoCatalogo | null>(null)
  const [cascoEliminar, setCascoEliminar] = useState<CascoCatalogo | null>(null)
  const [operacion, setOperacion] = useState('')
  const [notificacion, setNotificacion] = useState<{ tipo: 'ok' | 'error' | 'aviso'; mensaje: string } | null>(null)

  const disponibles = useMemo(() => obtenerCascosDisponibles(productos), [productos])
  const cascosParaPDF = useMemo(
    () => productos.filter((producto) => esProductoCasco(producto) && producto.archivado !== true).sort((a, b) => Number(a.precio || 0) - Number(b.precio || 0)),
    [productos]
  )
  const agotados = useMemo(() => productos.filter((producto) => esProductoCasco(producto) && Number(producto.stock || 0) === 0 && producto.archivado !== true).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es-MX')), [productos])
  const tallas = useMemo(() => [...new Set(disponibles.map((casco) => casco.talla?.trim()).filter((valor): valor is string => Boolean(valor)))].sort(), [disponibles])
  const certificaciones = useMemo(() => [...new Set(disponibles.map((casco) => casco.certificacion?.trim()).filter((valor): valor is string => Boolean(valor)))].sort(), [disponibles])
  const filtrados = useMemo(() => {
    const texto = normalizarTextoCasco(busqueda)
    const textoCompacto = texto.replace(/[^A-Z0-9]/g, '')
    return disponibles.filter((casco) => {
      const contenido = normalizarTextoCasco(`${casco.nombre} ${casco.codigo} ${casco.talla || ''} ${casco.certificacion || ''}`)
      const coincideTexto = !texto || contenido.includes(texto) || contenido.replace(/[^A-Z0-9]/g, '').includes(textoCompacto)
      const coincideTalla = !talla || normalizarTextoCasco(casco.talla) === normalizarTextoCasco(talla)
      const coincideCertificacion = !certificacion || normalizarTextoCasco(casco.certificacion) === normalizarTextoCasco(certificacion)
      return coincideTexto && coincideTalla && coincideCertificacion
    })
  }, [disponibles, busqueda, talla, certificacion])
  const grupos = useMemo(() => agruparCascosPorPrecio(filtrados), [filtrados])
  const piezas = disponibles.reduce((total, casco) => total + Number(casco.stock || 0), 0)
  const precios = disponibles.map((casco) => Number(casco.precio || 0))
  const limpiar = () => { setBusqueda(''); setTalla(''); setCertificacion('') }

  const reintentar = async () => {
    setReintentando(true)
    try { await onReintentar() } catch { /* El mensaje llega por la prop error. */ } finally { setReintentando(false) }
  }

  const crearPDF = async (seleccionados: CascoCatalogo[], opciones: OpcionesPDFCascos) => {
    if (rol !== 'Admin') return
    setGenerandoPDF(true)
    setProgresoPDF({ procesado: 0, total: seleccionados.length })
    try {
      await generarPDFCascos({
        cascos: seleccionados,
        opciones,
        onProgreso: (procesado, total) => setProgresoPDF({ procesado, total }),
      })
      setSelectorPDFAbierto(false)
    } catch (errorPDF) {
      alert(errorPDF instanceof Error ? errorPDF.message : 'No fue posible generar el PDF de cascos.')
    } finally {
      setGenerandoPDF(false)
    }
  }

  const avisar = (tipo: 'ok' | 'error' | 'aviso', mensaje: string) => setNotificacion({ tipo, mensaje })
  const llamarAPI = async (body: unknown) => {
    const { data } = await supabase.auth.getSession()
    if (!data.session?.access_token) throw new Error('La sesión expiró. Inicia sesión nuevamente.')
    const respuesta = await fetch('/api/cascos', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` }, body: JSON.stringify(body) })
    const resultado = await respuesta.json() as { ok: boolean; mensaje: string; producto?: Producto; productoId?: string; eliminado?: boolean }
    if (!respuesta.ok || !resultado.ok) throw new Error(resultado.mensaje || 'No fue posible completar la operación.')
    return resultado
  }
  const generarCodigo = async () => generarCodigoProductoDisponible(supabase)
  const abrirNuevo = async () => {
    if (rol !== 'Admin') return
    setOperacion('Generando código…')
    try { setCodigoInicial(await generarCodigo()); setFormularioCasco('nuevo') } catch (e) { avisar('error', e instanceof Error ? e.message : 'No fue posible generar el código.') } finally { setOperacion('') }
  }
  const subirImagen = async (archivo: File, codigo: string) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(archivo.type)) throw new Error('Selecciona una imagen JPEG, PNG o WebP válida.')
    if (archivo.size > 15 * 1024 * 1024) throw new Error('La imagen supera el máximo permitido de 15 MB.')
    setOperacion('Procesando imagen…')
    const comprimida = await comprimirImagenProducto(archivo)
    setOperacion('Subiendo imagen…')
    const nombre = `${codigo || 'casco'}-${Date.now()}.webp`
    const { error: errorSubida } = await supabase.storage.from('productos').upload(nombre, comprimida, { contentType: 'image/webp', cacheControl: '31536000' })
    if (errorSubida) throw new Error(errorSubida.message)
    return supabase.storage.from('productos').getPublicUrl(nombre).data.publicUrl
  }
  const guardarCasco = async (datos: import('@/types/cascos').DatosFormularioCasco, imagen: File | null) => {
    if (rol !== 'Admin') return
    const editando = formularioCasco !== 'nuevo' && formularioCasco !== null
    setOperacion(editando ? 'Actualizando casco…' : 'Guardando casco…')
    try {
      const imagen_url = imagen ? await subirImagen(imagen, datos.codigo) : datos.imagen_url
      const body = editando ? { operacion: 'EDITAR', productoId: formularioCasco.id, casco: { ...datos, imagen_url } } : { operacion: 'CREAR', casco: { ...datos, imagen_url } }
      const resultado = await llamarAPI(body)
      if (resultado.producto) onProductoActualizado(resultado.producto)
      setFormularioCasco(null)
      avisar('ok', resultado.mensaje)
    } catch (e) { avisar('error', e instanceof Error ? e.message : 'No fue posible guardar el casco.') } finally { setOperacion('') }
  }
  const vender = (casco: CascoCatalogo) => {
    setOperacion('Añadiendo al carrito…')
    try { const resultado = onVender(casco); avisar(resultado.ok ? 'ok' : 'aviso', resultado.mensaje); if (resultado.ok) onIrAVenta() } finally { setOperacion('') }
  }
  const reponer = async (cantidad: number) => {
    if (!cascoReponer || rol !== 'Admin') return
    setOperacion('Reponiendo stock…')
    try { const resultado = await llamarAPI({ operacion: 'REPONER', productoId: cascoReponer.id, cantidad }); if (resultado.producto) onProductoActualizado(resultado.producto); setCascoReponer(null); avisar('ok', resultado.mensaje) } catch (e) { avisar('error', e instanceof Error ? e.message : 'No fue posible reponer stock.') } finally { setOperacion('') }
  }
  const archivar = async () => {
    if (!cascoArchivar || rol !== 'Admin') return
    setOperacion('Archivando casco…')
    try { const resultado = await llamarAPI({ operacion: 'ARCHIVAR', productoId: cascoArchivar.id }); if (resultado.producto) onProductoActualizado(resultado.producto); setCascoArchivar(null); avisar('ok', resultado.mensaje) } catch (e) { avisar('error', e instanceof Error ? e.message : 'No fue posible archivar el casco.') } finally { setOperacion('') }
  }
  const eliminar = async () => {
    if (!cascoEliminar || rol !== 'Admin') return
    setOperacion('Eliminando casco…')
    try { const resultado = await llamarAPI({ operacion: 'ELIMINAR', productoId: cascoEliminar.id, confirmacion: 'ELIMINAR' }); if (resultado.eliminado && resultado.productoId) onProductoEliminado(resultado.productoId); else if (resultado.producto) onProductoActualizado(resultado.producto); setCascoEliminar(null); avisar(resultado.eliminado ? 'ok' : 'aviso', resultado.mensaje) } catch (e) { avisar('error', e instanceof Error ? e.message : 'No fue posible eliminar el casco.') } finally { setOperacion('') }
  }
  const accionesTarjeta = { onVender: vender, onEditar: (casco: CascoCatalogo) => setFormularioCasco(casco), onReponer: setCascoReponer, onArchivar: setCascoArchivar, onEliminar: setCascoEliminar }

  if (error) {
    return <section className="fl-helmets-state"><AlertCircle size={38} aria-hidden="true" /><h1>No fue posible cargar el catálogo.</h1><p>{error}</p><button type="button" onClick={() => void reintentar()} disabled={reintentando}><RotateCw size={18} aria-hidden="true" />{reintentando ? 'Reintentando…' : 'Reintentar'}</button></section>
  }

  return (
    <section className="fl-helmets-catalog">
      <header className="fl-helmets-header">
        <div><span><Shield size={20} aria-hidden="true" />FAST LOOK</span><h1>Catálogo de cascos</h1><p>Modelos disponibles actualmente</p></div>
        {rol === 'Admin' && <div className="fl-helmets-admin-actions"><button type="button" onClick={() => void abrirNuevo()}><Plus size={18} />Añadir casco</button><button type="button" className={mostrarAgotados ? 'is-active' : ''} onClick={() => setMostrarAgotados(!mostrarAgotados)}><PackageX size={18} />Ver agotados ({agotados.length})</button><button type="button" onClick={() => setSelectorPDFAbierto(true)}><FileDown size={18} />Generar PDF para cajas</button></div>}
      </header>

      <div className="fl-helmets-stats">
        <article><strong>{disponibles.length}</strong><span>Modelos disponibles</span></article>
        <article><strong>{piezas}</strong><span>Piezas disponibles</span></article>
        <article><strong>{precios.length ? `$${Math.min(...precios).toLocaleString('es-MX')} – $${Math.max(...precios).toLocaleString('es-MX')}` : '$0'}</strong><span>Rango de precios</span></article>
      </div>

      <FiltrosCascos busqueda={busqueda} talla={talla} certificacion={certificacion} tallas={tallas} certificaciones={certificaciones} onBusqueda={setBusqueda} onTalla={setTalla} onCertificacion={setCertificacion} onLimpiar={limpiar} />

      {disponibles.length === 0 ? (
        <div className="fl-helmets-state"><Sparkles size={38} aria-hidden="true" /><h2>No hay cascos disponibles actualmente.</h2><p>{rol === 'Admin' ? 'Cuando existan cascos con stock aparecerán en este catálogo.' : 'No hay modelos disponibles para venta.'}</p></div>
      ) : filtrados.length === 0 ? (
        <div className="fl-helmets-state"><Shield size={38} aria-hidden="true" /><h2>No encontramos cascos con esos filtros.</h2><button type="button" onClick={limpiar}>Limpiar filtros</button></div>
      ) : (
        <div className="fl-helmet-groups">
          {grupos.map((grupo) => <section key={grupo.id}><header><h2>{grupo.titulo}</h2><span>{grupo.cascos.length} {grupo.cascos.length === 1 ? 'modelo' : 'modelos'}</span></header><div className="fl-helmet-grid">{grupo.cascos.map((casco) => <TarjetaCasco key={casco.id} casco={casco} rol={rol} onVer={setCascoActivo} {...accionesTarjeta} />)}</div></section>)}
        </div>
      )}

      {cascoActivo && <VisorCasco casco={cascoActivo} onCerrar={() => setCascoActivo(null)} />}
      {rol === 'Admin' && mostrarAgotados && <CascosAgotados cascos={agotados} rol={rol} onVer={setCascoActivo} onEditar={accionesTarjeta.onEditar} onReponer={setCascoReponer} onArchivar={setCascoArchivar} onEliminar={setCascoEliminar} />}
      {rol === 'Admin' && formularioCasco && <FormularioCasco casco={formularioCasco === 'nuevo' ? null : formularioCasco} codigoInicial={codigoInicial} ocupado={Boolean(operacion)} onGenerarCodigo={generarCodigo} onGuardar={guardarCasco} onCancelar={() => setFormularioCasco(null)} />}
      {rol === 'Admin' && cascoReponer && <ReponerStockCascoDialog casco={cascoReponer} ocupado={Boolean(operacion)} onConfirmar={reponer} onCancelar={() => setCascoReponer(null)} />}
      {rol === 'Admin' && cascoEliminar && <EliminarCascoDialog casco={cascoEliminar} ocupado={Boolean(operacion)} onConfirmar={eliminar} onCancelar={() => setCascoEliminar(null)} />}
      {rol === 'Admin' && cascoArchivar && <div className="fl-casco-dialog-backdrop"><section className="fl-casco-small-dialog" role="dialog" aria-modal="true"><header><Shield /><h2>Archivar casco</h2><button type="button" aria-label="Cerrar" onClick={() => setCascoArchivar(null)}><X /></button></header><p>Este casco dejará de aparecer en el catálogo y en búsquedas activas. Su historial se conservará.</p><footer><button onClick={() => setCascoArchivar(null)}>Cancelar</button><button className="is-primary" onClick={() => void archivar()}>Archivar</button></footer></section></div>}
      {rol === 'Admin' && selectorPDFAbierto && <SelectorPDFCascos cascos={cascosParaPDF} onCancelar={() => setSelectorPDFAbierto(false)} onGenerar={crearPDF} />}
      <LoadingOverlay
        visible={generandoPDF || Boolean(operacion)}
        titulo={generandoPDF ? 'Preparando PDF de cascos…' : operacion}
        detalle={generandoPDF ? (progresoPDF.total ? `Procesando etiqueta ${progresoPDF.procesado} de ${progresoPDF.total}` : 'Preparando imágenes…') : ''}
        progreso={generandoPDF && progresoPDF.total ? (progresoPDF.procesado / progresoPDF.total) * 100 : undefined}
      />
      {notificacion && <div className={`fl-casco-toast is-${notificacion.tipo}`} role="status"><span>{notificacion.mensaje}</span><button type="button" aria-label="Cerrar notificación" onClick={() => setNotificacion(null)}><X size={17} /></button></div>}
    </section>
  )
}
