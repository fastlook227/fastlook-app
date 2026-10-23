'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Mic } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { reconocerImporteVoz } from '@/utils/ventaVoz'

type Estado = 'oculto' | 'escuchando' | 'procesando' | 'guardando' | 'exito' | 'incierto'
type Aviso = { tipo: 'exito' | 'error'; texto: string } | null
type ResultadoVoz = { ok?: boolean; captura_id?: string; ticket_id?: string; folio?: string; total?: number | string }
interface ResultadoReconocimiento { isFinal: boolean; 0: { transcript: string }; length: number }
interface EventoReconocimiento extends Event { results: ArrayLike<ResultadoReconocimiento> }
interface ErrorReconocimiento extends Event { error: string }
interface ReconocedorVoz { lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number; start(): void; stop(): void; abort(): void; onresult: ((evento: EventoReconocimiento) => void) | null; onerror: ((evento: ErrorReconocimiento) => void) | null; onend: (() => void) | null }
type ConstructorReconocedor = new () => ReconocedorVoz

const ESPERA_RESULTADO_MS = 10_000, TIMEOUT_RPC_MS = 15_000, DURACION_AVISO_MS = 4_500, DURACION_EXITO_MS = 1_350
const esEdicion = (objetivo: EventTarget | null) => objetivo instanceof HTMLInputElement || objetivo instanceof HTMLTextAreaElement || objetivo instanceof HTMLSelectElement || (objetivo instanceof HTMLElement && (objetivo.isContentEditable || Boolean(objetivo.closest('[contenteditable="true"],[role="textbox"]'))))
const hayModalAbierto = () => Boolean(document.querySelector('[aria-modal="true"],dialog[open]'))
const esDispositivoMovil = () => /Android|webOS|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.matchMedia('(hover: none) and (pointer: coarse)').matches
const moneda = (importe: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(importe)
const mensajeErrorMicrofono = (error: string) => error === 'not-allowed' || error === 'service-not-allowed' ? 'No se registró. Habilita el permiso de micrófono para FAST LOOK en el navegador.' : error === 'audio-capture' ? 'No se registró. No se encontró un micrófono conectado.' : error === 'network' ? 'No se registró. El servicio de voz necesita conexión a Internet.' : 'No se registró; repite el importe.'

export default function VentaVozGlobal({ onActualizar }: { onActualizar: () => Promise<void> }) {
  const [estado, setEstadoUI] = useState<Estado>('oculto')
  const [mensaje, setMensaje] = useState('Escuchando')
  const [aviso, setAviso] = useState<Aviso>(null)
  const [disponible, setDisponible] = useState(false)
  const reconocedorRef = useRef<ReconocedorVoz | null>(null), ocupadaRef = useRef(false), capturaActivaRef = useRef(false), shiftPresionadoRef = useRef(false), estadoRef = useRef<Estado>('oculto'), avisoTimerRef = useRef<number | null>(null), cierreTimerRef = useRef<number | null>(null), resultadoTimerRef = useRef<number | null>(null), focoAnteriorRef = useRef<HTMLElement | null>(null), overlayRef = useRef<HTMLDivElement | null>(null)
  const [esEscritorio, setEsEscritorio] = useState(false)
  const [Constructor] = useState(() => (window as unknown as { SpeechRecognition?: ConstructorReconocedor; webkitSpeechRecognition?: ConstructorReconocedor }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: ConstructorReconocedor }).webkitSpeechRecognition)
  const mostrar = useCallback((siguiente: Estado, texto: string) => { estadoRef.current = siguiente; setEstadoUI(siguiente); setMensaje(texto) }, [])

  const restaurarFoco = useCallback(() => {
    const anterior = focoAnteriorRef.current; focoAnteriorRef.current = null
    if (anterior?.isConnected && !anterior.hasAttribute('disabled')) anterior.focus({ preventScroll: true })
  }, [])
  const ocultarOverlay = useCallback(() => { mostrar('oculto', 'Escuchando'); restaurarFoco() }, [mostrar, restaurarFoco])
  const mostrarAviso = useCallback((tipo: 'exito' | 'error', texto: string) => {
    setAviso({ tipo, texto })
    if (avisoTimerRef.current !== null) window.clearTimeout(avisoTimerRef.current)
    avisoTimerRef.current = window.setTimeout(() => { setAviso(null); avisoTimerRef.current = null }, DURACION_AVISO_MS)
  }, [])

  useEffect(() => {
    if (esDispositivoMovil()) return
    setEsEscritorio(true)
    let activo = true
    // PGRST202 significa que la migración todavía no está aplicada; en ese caso no se instala el atajo.
    void supabase.rpc('consultar_venta_voz', { p_captura_id: crypto.randomUUID() }).abortSignal(AbortSignal.timeout(TIMEOUT_RPC_MS)).then(({ error }) => { if (activo) setDisponible(error?.code !== 'PGRST202') })
    return () => { activo = false }
  }, [])

  useEffect(() => { if (estado !== 'oculto') window.requestAnimationFrame(() => overlayRef.current?.focus({ preventScroll: true })) }, [estado])

  const cancelar = useCallback((avisar = false) => {
    const habiaCaptura = capturaActivaRef.current || reconocedorRef.current !== null
    capturaActivaRef.current = false
    const reconocedor = reconocedorRef.current; reconocedorRef.current = null; reconocedor?.abort()
    if (resultadoTimerRef.current !== null) window.clearTimeout(resultadoTimerRef.current)
    resultadoTimerRef.current = null
    if (habiaCaptura && !ocupadaRef.current) { ocultarOverlay(); if (avisar) mostrarAviso('error', 'Venta por voz cancelada. No se registró ninguna venta.') }
  }, [mostrarAviso, ocultarOverlay])

  const consultar = useCallback(async (capturaId: string) => {
    const { data, error } = await supabase.rpc('consultar_venta_voz', { p_captura_id: capturaId }).abortSignal(AbortSignal.timeout(TIMEOUT_RPC_MS))
    if (error) throw error
    return data as ResultadoVoz | null
  }, [])

  const confirmarExito = useCallback(async (respuesta: ResultadoVoz, importe: number) => {
    const total = Number(respuesta.total ?? importe), texto = `Venta registrada: ${moneda(total)}`
    mostrar('exito', texto)
    // La venta ya fue confirmada por servidor; un fallo al refrescar vistas no debe dejar abierto el overlay.
    await onActualizar().catch(() => undefined)
    mostrarAviso('exito', texto)
    cierreTimerRef.current = window.setTimeout(() => { cierreTimerRef.current = null; ocultarOverlay() }, DURACION_EXITO_MS)
  }, [mostrar, mostrarAviso, ocultarOverlay, onActualizar])

  const guardar = useCallback(async (transcripcion: string) => {
    if (ocupadaRef.current) return
    const resultado = reconocerImporteVoz(transcripcion)
    if (!resultado.ok) { ocultarOverlay(); mostrarAviso('error', 'No se registró; repite el importe.'); return }
    const capturaId = crypto.randomUUID()
    ocupadaRef.current = true; mostrar('guardando', 'Registrando venta…')
    try {
      const { data, error } = await supabase.rpc('registrar_venta_voz', { p_captura_id: capturaId, p_importe: resultado.importe }).abortSignal(AbortSignal.timeout(TIMEOUT_RPC_MS))
      const respuesta = data as ResultadoVoz | null
      if (!error && respuesta?.ok && respuesta.folio) { await confirmarExito(respuesta, resultado.importe); return }
      if (error?.code) { ocultarOverlay(); mostrarAviso('error', `No se registró: ${error.message.replace(/^[A-Z_]+:\s*/, '')}`); return }
      const verificada = await consultar(capturaId).catch(() => undefined)
      if (verificada?.ok && verificada.folio) { await confirmarExito(verificada, resultado.importe); return }
      // No se permite otra captura hasta resolver este UUID: repetir podría duplicar una venta cuya respuesta se perdió.
      mostrar('incierto', 'No se pudo confirmar el registro. Comprobando…')
      const comprobar = async () => {
        try {
          const respuestaConsulta = await consultar(capturaId)
          if (respuestaConsulta?.ok && respuestaConsulta.folio) await confirmarExito(respuestaConsulta, resultado.importe)
          else { ocultarOverlay(); mostrarAviso('error', 'No se registró; repite el importe.') }
        } catch { mostrar('incierto', 'Sin conexión. No repitas el importe hasta recuperar la conexión.') }
      }
      window.setTimeout(() => void comprobar(), 2_000)
    } finally { ocupadaRef.current = false }
  }, [confirmarExito, consultar, mostrar, mostrarAviso, ocultarOverlay])

  const iniciar = useCallback(() => {
    if (!Constructor || ocupadaRef.current || capturaActivaRef.current || reconocedorRef.current || estadoRef.current === 'incierto') return
    focoAnteriorRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    capturaActivaRef.current = true
    const reconocedor = new Constructor(); reconocedor.lang = 'es-MX'; reconocedor.continuous = false; reconocedor.interimResults = false; reconocedor.maxAlternatives = 1
    let texto = '', terminada = false
    const vigente = () => reconocedorRef.current === reconocedor && !terminada
    reconocedorRef.current = reconocedor; mostrar('escuchando', 'Escuchando')
    reconocedor.onresult = (evento) => { if (vigente()) texto = Array.from(evento.results).filter((r) => r.isFinal).map((r) => r[0].transcript).join(' ') }
    reconocedor.onerror = (evento) => { if (!vigente()) return; terminada = true; capturaActivaRef.current = false; reconocedorRef.current = null; ocultarOverlay(); mostrarAviso('error', mensajeErrorMicrofono(evento.error)) }
    reconocedor.onend = () => {
      if (!vigente()) return
      terminada = true; capturaActivaRef.current = false; reconocedorRef.current = null
      if (!texto.trim()) { ocultarOverlay(); mostrarAviso('error', 'No se registró; repite el importe.'); return }
      mostrar('procesando', 'Procesando importe…'); void guardar(texto.trim())
    }
    try {
      reconocedor.start()
      resultadoTimerRef.current = window.setTimeout(() => { if (reconocedorRef.current === reconocedor) { reconocedorRef.current = null; capturaActivaRef.current = false; reconocedor.abort(); ocultarOverlay(); mostrarAviso('error', 'No se registró; repite el importe.') } }, ESPERA_RESULTADO_MS)
    } catch { reconocedorRef.current = null; capturaActivaRef.current = false; ocultarOverlay(); mostrarAviso('error', 'No se pudo iniciar. Habilita el permiso de micrófono para FAST LOOK en el navegador.') }
  }, [Constructor, guardar, mostrar, mostrarAviso, ocultarOverlay])

  useEffect(() => {
    if (!esEscritorio || !Constructor || !disponible) return
    const keydown = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape' && capturaActivaRef.current) { evento.preventDefault(); cancelar(true); return }
      if (evento.key === 'Shift') {
        if (evento.repeat || evento.ctrlKey || evento.altKey || evento.metaKey || shiftPresionadoRef.current || esEdicion(evento.target) || hayModalAbierto() || ocupadaRef.current || capturaActivaRef.current || estadoRef.current !== 'oculto') return
        shiftPresionadoRef.current = true; iniciar(); return
      }
      // Si aparece otra tecla antes de soltar Shift, era una combinación y la captura no es válida.
      if (shiftPresionadoRef.current && capturaActivaRef.current) cancelar()
    }
    const keyup = (evento: KeyboardEvent) => { if (evento.key === 'Shift') shiftPresionadoRef.current = false }
    const visibilidad = () => { if (document.hidden) cancelar() }
    const perderFoco = () => cancelar()
    document.addEventListener('keydown', keydown, true); document.addEventListener('keyup', keyup, true); window.addEventListener('blur', perderFoco); document.addEventListener('visibilitychange', visibilidad)
    return () => { document.removeEventListener('keydown', keydown, true); document.removeEventListener('keyup', keyup, true); window.removeEventListener('blur', perderFoco); document.removeEventListener('visibilitychange', visibilidad); cancelar() }
  }, [Constructor, cancelar, disponible, esEscritorio, iniciar])

  useEffect(() => () => {
    if (avisoTimerRef.current !== null) window.clearTimeout(avisoTimerRef.current)
    if (cierreTimerRef.current !== null) window.clearTimeout(cierreTimerRef.current)
    if (resultadoTimerRef.current !== null) window.clearTimeout(resultadoTimerRef.current)
  }, [])

  if (!esEscritorio || !disponible) return null
  return <>
    {estado !== 'oculto' && <div ref={overlayRef} className={`fl-voice-overlay is-${estado}`} role="dialog" aria-modal="true" aria-labelledby="fl-voice-title" aria-describedby="fl-voice-status" tabIndex={-1}>
      <div className="fl-voice-content">
        <div className="fl-voice-mic" aria-hidden="true"><Mic /></div>
        <h2 id="fl-voice-title">DI LA CANTIDAD</h2>
        <p id="fl-voice-status" role="status">{mensaje}</p>
        {(estado === 'escuchando' || estado === 'procesando') && <div className="fl-voice-waves" aria-hidden="true">{[0, 1, 2, 3, 4].map((barra) => <i key={barra} />)}</div>}
        {estado === 'escuchando' && <small>Escape para cancelar</small>}
      </div>
    </div>}
    {aviso && <div className={`fl-voice-toast is-${aviso.tipo}`} role={aviso.tipo === 'error' ? 'alert' : 'status'}>{aviso.texto}</div>}
  </>
}
