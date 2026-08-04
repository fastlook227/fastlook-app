'use client'

import { AlertCircle, RotateCw, Shield, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Producto, RolUsuario } from '@/types'
import type { CascoCatalogo } from '@/types/cascos'
import { agruparCascosPorPrecio, normalizarTextoCasco, obtenerCascosDisponibles } from '@/utils/cascos'
import FiltrosCascos from '@/components/cascos/FiltrosCascos'
import TarjetaCasco from '@/components/cascos/TarjetaCasco'
import VisorCasco from '@/components/cascos/VisorCasco'

interface CatalogoCascosProps {
  productos: Producto[]
  rol: RolUsuario
  error: string
  onReintentar: () => Promise<void>
}

export default function CatalogoCascos({ productos, rol, error, onReintentar }: CatalogoCascosProps) {
  const [busqueda, setBusqueda] = useState('')
  const [talla, setTalla] = useState('')
  const [certificacion, setCertificacion] = useState('')
  const [cascoActivo, setCascoActivo] = useState<CascoCatalogo | null>(null)
  const [reintentando, setReintentando] = useState(false)

  const disponibles = useMemo(() => obtenerCascosDisponibles(productos), [productos])
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

  if (error) {
    return <section className="fl-helmets-state"><AlertCircle size={38} aria-hidden="true" /><h1>No fue posible cargar el catálogo.</h1><p>{error}</p><button type="button" onClick={() => void reintentar()} disabled={reintentando}><RotateCw size={18} aria-hidden="true" />{reintentando ? 'Reintentando…' : 'Reintentar'}</button></section>
  }

  return (
    <section className="fl-helmets-catalog">
      <header className="fl-helmets-header">
        <div><span><Shield size={20} aria-hidden="true" />FAST LOOK</span><h1>Catálogo de cascos</h1><p>Modelos disponibles actualmente</p></div>
        {rol === 'Admin' && <div className="fl-helmets-admin-note">Vista administrativa · costos visibles</div>}
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
          {grupos.map((grupo) => <section key={grupo.id}><header><h2>{grupo.titulo}</h2><span>{grupo.cascos.length} {grupo.cascos.length === 1 ? 'modelo' : 'modelos'}</span></header><div className="fl-helmet-grid">{grupo.cascos.map((casco) => <TarjetaCasco key={casco.id} casco={casco} rol={rol} onVer={setCascoActivo} />)}</div></section>)}
        </div>
      )}

      {cascoActivo && <VisorCasco casco={cascoActivo} onCerrar={() => setCascoActivo(null)} />}
    </section>
  )
}
