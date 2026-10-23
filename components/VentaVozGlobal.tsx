'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Mic, MicOff, RotateCcw, Volume2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { reconocerImporteVoz } from '@/utils/ventaVoz'

type Estado = 'listo' | 'escuchando' | 'procesando' | 'guardando' | 'exito' | 'error' | 'incierto'
type ResultadoVoz = { ok?: boolean; captura_id?: string; ticket_id?: string; folio?: string; total?: number | string; deshecha?: boolean }
interface ResultadoReconocimiento { isFinal: boolean; 0: { transcript: string }; length: number }
interface EventoReconocimiento extends Event { results: ArrayLike<ResultadoReconocimiento> }
interface ErrorReconocimiento extends Event { error: string }
interface ReconocedorVoz { lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number; start(): void; stop(): void; abort(): void; onresult: ((evento: EventoReconocimiento) => void) | null; onerror: ((evento: ErrorReconocimiento) => void) | null; onend: (() => void) | null }
type ConstructorReconocedor = new () => ReconocedorVoz

const ESPERA_SHIFT_MS = 280, ESPERA_RESULTADO_MS = 10_000, TIMEOUT_RPC_MS = 15_000, CLAVE_HABILITADA = 'fastlook-venta-voz-habilitada'
const MENSAJE_LISTO = 'Mantén Shift para registrar una venta'
const esEdicion = (objetivo: EventTarget | null) => objetivo instanceof HTMLInputElement || objetivo instanceof HTMLTextAreaElement || objetivo instanceof HTMLSelectElement || (objetivo instanceof HTMLElement && (objetivo.isContentEditable || Boolean(objetivo.closest('[contenteditable="true"],[role="textbox"]'))))
const moneda = (importe: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(importe)
const mensajeErrorMicrofono = (error: string) => error === 'not-allowed' || error === 'service-not-allowed' ? 'No se registró: el navegador no tiene permiso para usar el micrófono. Pulsa “Activar micrófono”.' : error === 'no-speech' ? 'No se registró; no se escuchó un importe.' : error === 'audio-capture' ? 'No se registró: no se encontró un micrófono conectado.' : error === 'network' ? 'No se registró: sin conexión con el servicio de voz del navegador.' : 'No se registró; repite el importe.'
const leerHabilitada = () => { try { return window.localStorage.getItem(CLAVE_HABILITADA) !== '0' } catch { return true } }

export default function VentaVozGlobal({ onActualizar }: { onActualizar: () => Promise<void> }) {
  const [habilitada, setHabilitada] = useState(leerHabilitada)
  const [estado, setEstadoUI] = useState<Estado>('listo')
  const [mensaje, setMensaje] = useState(MENSAJE_LISTO)
  const [ultima, setUltima] = useState<{ capturaId: string; importe: number; folio: string; deshacerKey: string } | null>(null)
  const reconocedorRef = useRef<ReconocedorVoz | null>(null), temporizadorRef = useRef<number | null>(null), shiftRef = useRef(false), soltoRef = useRef(false), ocupadaRef = useRef(false), hablandoRef = useRef(false), estadoRef = useRef<Estado>('listo')
  const [Constructor] = useState(() => (window as unknown as { SpeechRecognition?: ConstructorReconocedor; webkitSpeechRecognition?: ConstructorReconocedor }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: ConstructorReconocedor }).webkitSpeechRecognition)
  const mostrar = useCallback((siguiente: Estado, texto: string) => { estadoRef.current = siguiente; setEstadoUI(siguiente); setMensaje(texto) }, [])
  const [disponible, setDisponible] = useState(false)

  // PGRST202 = la función no existe: la migración de voz no está aplicada y la función queda oculta.
  useEffect(() => {
    let activo = true
    void supabase.rpc('consultar_venta_voz', { p_captura_id: crypto.randomUUID() }).abortSignal(AbortSignal.timeout(TIMEOUT_RPC_MS)).then(({ error }) => { if (activo) setDisponible(error?.code !== 'PGRST202') })
    return () => { activo = false }
  }, [])

  // Cancela sólo la captura en curso; los avisos de éxito o guardado incierto se conservan.
  const cancelar = useCallback(() => {
    const habiaCaptura = shiftRef.current || temporizadorRef.current !== null || reconocedorRef.current !== null
    shiftRef.current = false; soltoRef.current = false
    if (temporizadorRef.current !== null) window.clearTimeout(temporizadorRef.current)
    temporizadorRef.current = null
    const reconocedor = reconocedorRef.current; reconocedorRef.current = null; reconocedor?.abort()
    if (habiaCaptura && !ocupadaRef.current) mostrar('listo', MENSAJE_LISTO)
  }, [mostrar])

  const consultar = useCallback(async (capturaId: string) => {
    const { data, error } = await supabase.rpc('consultar_venta_voz', { p_captura_id: capturaId }).abortSignal(AbortSignal.timeout(TIMEOUT_RPC_MS))
    if (error) throw error
    return data as ResultadoVoz | null
  }, [])

  const confirmarExito = useCallback(async (capturaId: string, respuesta: ResultadoVoz, importe: number) => {
    const total = Number(respuesta.total ?? importe)
    setUltima({ capturaId, importe: total, folio: String(respuesta.folio), deshacerKey: crypto.randomUUID() })
    mostrar('exito', `Registrado: ${moneda(total)} · Efectivo`)
    await onActualizar()
    if ('speechSynthesis' in window) {
      // No se inicia otra captura mientras habla el aviso, para no registrarlo como venta.
      hablandoRef.current = true
      const liberar = () => { hablandoRef.current = false }, respaldo = window.setTimeout(liberar, 8_000)
      const aviso = new SpeechSynthesisUtterance(`Registrado: ${moneda(total)} en efectivo`); aviso.lang = 'es-MX'; aviso.onend = aviso.onerror = () => { window.clearTimeout(respaldo); liberar() }
      window.speechSynthesis.speak(aviso)
    }
  }, [mostrar, onActualizar])

  const guardar = useCallback(async (transcripcion: string) => {
    if (ocupadaRef.current) return
    const resultado = reconocerImporteVoz(transcripcion)
    if (!resultado.ok) { mostrar('error', resultado.motivo === 'metodo' ? 'No se registró; la venta por voz sólo admite efectivo.' : 'No se registró; repite el importe'); return }
    const capturaId = crypto.randomUUID()
    ocupadaRef.current = true; mostrar('guardando', 'Guardando…')
    try {
      const { data, error } = await supabase.rpc('registrar_venta_voz', { p_captura_id: capturaId, p_importe: resultado.importe }).abortSignal(AbortSignal.timeout(TIMEOUT_RPC_MS))
      const respuesta = data as ResultadoVoz | null
      if (!error && respuesta?.ok && respuesta.folio) { await confirmarExito(capturaId, respuesta, resultado.importe); return }
      // Con código, el servidor respondió y revirtió la transacción: no hubo venta.
      if (error?.code) { mostrar('error', `No se registró: ${error.message.replace(/^[A-Z_]+:\s*/, '')}`); return }
      const verificada = await consultar(capturaId).catch(() => undefined)
      if (verificada?.ok && verificada.folio) { await confirmarExito(capturaId, verificada, resultado.importe); return }
      setUltima({ capturaId, importe: resultado.importe, folio: '', deshacerKey: crypto.randomUUID() })
      mostrar('incierto', 'Sin conexión: no se pudo confirmar el guardado. Pulsa “Comprobar estado” antes de repetir.')
    } finally { ocupadaRef.current = false }
  }, [confirmarExito, consultar, mostrar])

  const iniciar = useCallback(() => {
    temporizadorRef.current = null
    if (!Constructor || !shiftRef.current || ocupadaRef.current || hablandoRef.current || reconocedorRef.current) return
    const reconocedor = new Constructor(); reconocedor.lang = 'es-MX'; reconocedor.continuous = true; reconocedor.interimResults = false; reconocedor.maxAlternatives = 1
    let texto = '', terminada = false
    const vigente = () => reconocedorRef.current === reconocedor && !terminada
    reconocedorRef.current = reconocedor; mostrar('escuchando', 'Escuchando…')
    reconocedor.onresult = (evento) => { if (vigente()) texto = Array.from(evento.results).filter((r) => r.isFinal).map((r) => r[0].transcript).join(' ') }
    reconocedor.onerror = (evento) => { if (!vigente()) return; terminada = true; reconocedorRef.current = null; mostrar('error', mensajeErrorMicrofono(evento.error)) }
    reconocedor.onend = () => {
      if (!vigente()) return
      terminada = true; reconocedorRef.current = null
      // Sólo se procesa el resultado final tras soltar Shift; si terminó antes, no se guarda nada.
      if (!soltoRef.current || !texto.trim()) { mostrar('error', 'No se registró; repite el importe'); return }
      mostrar('procesando', 'Procesando…'); void guardar(texto.trim())
    }
    try { reconocedor.start() } catch { reconocedorRef.current = null; mostrar('error', 'No se pudo iniciar el micrófono. Pulsa “Activar micrófono” y concede permiso.') }
  }, [Constructor, guardar, mostrar])

  useEffect(() => {
    if (!habilitada || !Constructor || !disponible) return
    const keydown = (evento: KeyboardEvent) => {
      if (evento.key === 'Shift' && !evento.repeat && !evento.ctrlKey && !evento.altKey && !evento.metaKey && !esEdicion(evento.target) && !ocupadaRef.current && !hablandoRef.current && !reconocedorRef.current && estadoRef.current !== 'incierto') { shiftRef.current = true; soltoRef.current = false; temporizadorRef.current = window.setTimeout(iniciar, ESPERA_SHIFT_MS); return }
      if (evento.key !== 'Shift' && (shiftRef.current || temporizadorRef.current !== null)) cancelar()
    }
    const keyup = (evento: KeyboardEvent) => {
      if (evento.key !== 'Shift' || !shiftRef.current) return
      shiftRef.current = false; soltoRef.current = true
      if (temporizadorRef.current !== null) { window.clearTimeout(temporizadorRef.current); temporizadorRef.current = null; return }
      const reconocedor = reconocedorRef.current
      if (!reconocedor) return
      mostrar('procesando', 'Procesando…'); reconocedor.stop()
      window.setTimeout(() => { if (reconocedorRef.current === reconocedor) { reconocedorRef.current = null; reconocedor.abort(); mostrar('error', 'No se registró: el servicio de voz no respondió. Repite el importe.') } }, ESPERA_RESULTADO_MS)
    }
    const visibilidad = () => { if (document.hidden) cancelar() }
    document.addEventListener('keydown', keydown, true); document.addEventListener('keyup', keyup, true); window.addEventListener('blur', cancelar); document.addEventListener('visibilitychange', visibilidad)
    return () => { document.removeEventListener('keydown', keydown, true); document.removeEventListener('keyup', keyup, true); window.removeEventListener('blur', cancelar); document.removeEventListener('visibilitychange', visibilidad); cancelar() }
  }, [Constructor, cancelar, disponible, habilitada, iniciar, mostrar])

  const activarMicrofono = async () => { try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); stream.getTracks().forEach((track) => track.stop()); mostrar('listo', `Micrófono listo. ${MENSAJE_LISTO}`) } catch { mostrar('error', 'No se concedió permiso para usar el micrófono o no hay uno conectado.') } }
  const comprobar = async () => {
    if (!ultima || ocupadaRef.current) return
    ocupadaRef.current = true; mostrar('guardando', 'Comprobando…')
    try {
      const respuesta = await consultar(ultima.capturaId)
      if (respuesta?.ok && respuesta.folio) await confirmarExito(ultima.capturaId, respuesta, ultima.importe)
      else { setUltima(null); mostrar('error', 'Esa captura no generó venta. Ya puedes repetir el importe.') }
    } catch { mostrar('incierto', 'Sigue sin conexión. Vuelve a pulsar “Comprobar estado” antes de repetir.') } finally { ocupadaRef.current = false }
  }
  const deshacer = async () => {
    if (!ultima?.folio || ocupadaRef.current) return
    ocupadaRef.current = true; mostrar('guardando', 'Deshaciendo…')
    try {
      const { data, error } = await supabase.rpc('deshacer_venta_voz', { p_captura_id: ultima.capturaId, p_idempotency_key: ultima.deshacerKey }).abortSignal(AbortSignal.timeout(TIMEOUT_RPC_MS))
      if (error?.message.includes('VENTA_CON_DEVOLUCION:')) { setUltima(null); mostrar('error', `No se puede deshacer ${ultima.folio}: ya tiene una devolución registrada.`); return }
      if (error || !(data as ResultadoVoz)?.ok) throw error
      setUltima(null); mostrar('listo', `Venta ${ultima.folio} cancelada. ${MENSAJE_LISTO}`); await onActualizar()
    } catch { mostrar('exito', `No se pudo confirmar la cancelación de ${ultima.folio}; revisa la conexión y vuelve a pulsar “Deshacer”.`) } finally { ocupadaRef.current = false }
  }
  const alternar = () => { cancelar(); const siguiente = !habilitada; setHabilitada(siguiente); try { window.localStorage.setItem(CLAVE_HABILITADA, siguiente ? '1' : '0') } catch { /* sin almacenamiento local: aplica sólo en esta sesión */ } if (estadoRef.current !== 'incierto') mostrar('listo', siguiente ? MENSAJE_LISTO : 'Venta por voz desactivada') }

  if (!disponible) return null
  return <aside className={`fl-voice-sale is-${estado}`} aria-live="polite"><div>{habilitada ? <Mic aria-hidden="true" /> : <MicOff aria-hidden="true" />}<span><strong>Venta por voz</strong><small>{Constructor ? mensaje : 'Este navegador no admite reconocimiento de voz. Usa la venta manual.'}</small></span></div><div className="fl-voice-actions">{Constructor && habilitada && (estado === 'listo' || estado === 'error') && <button type="button" onClick={() => void activarMicrofono()}><Mic />Activar micrófono</button>}{estado === 'exito' && ultima?.folio && <button type="button" className="is-danger" onClick={() => void deshacer()}><RotateCcw />Deshacer última venta</button>}{estado === 'incierto' && <button type="button" onClick={() => void comprobar()}><RotateCcw />Comprobar estado</button>}<button type="button" onClick={alternar}>{habilitada ? <><MicOff />Desactivar</> : <><Volume2 />Activar</>}</button></div>{Constructor && <p>Sólo efectivo. La primera vez el navegador pedirá permiso de micrófono. El reconocimiento usa el servicio de voz del navegador y requiere internet; no se guardan grabaciones.</p>}</aside>
}
