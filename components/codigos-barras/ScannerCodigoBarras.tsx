'use client'

import { Camera, CameraIcon, RefreshCw, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { detenerMediaStream, evaluarLecturaContinua, normalizarCodigoBarras, type UltimaLecturaContinua } from '@/utils/codigoBarras'

export type FeedbackScanner = {
  tipo: 'ok' | 'error'
  titulo: string
  detalle?: string
}

type BarcodeNativo = { rawValue: string; format?: string }
type DetectorNativo = { detect: (fuente: ImageBitmapSource) => Promise<BarcodeNativo[]> }
type ConstructorDetector = {
  new (opciones?: { formats?: string[] }): DetectorNativo
  getSupportedFormats: () => Promise<string[]>
}

const FORMATOS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'qr_code']
const AUSENCIA_PARA_REPETIR_MS = 900

const mensajeCamara = (error: unknown) => {
  const nombre = error instanceof DOMException ? error.name : ''
  if (nombre === 'NotAllowedError') return 'Permiso denegado. Autoriza el uso de la cámara en tu navegador.'
  if (nombre === 'NotFoundError') return 'No se encontró una cámara disponible en este dispositivo.'
  if (nombre === 'NotReadableError') return 'La cámara está siendo utilizada por otra aplicación o no puede iniciarse.'
  if (!window.isSecureContext) return 'La cámara requiere HTTPS o localhost para funcionar.'
  return 'Cámara no disponible. Puedes continuar usando el lector o escribir el código.'
}

export default function ScannerCodigoBarras({ abierto, continuo = false, onDetect, onCerrar }: {
  abierto: boolean
  continuo?: boolean
  onDetect: (codigo: string) => FeedbackScanner | void | Promise<FeedbackScanner | void>
  onCerrar: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const onDetectRef = useRef(onDetect)
  const onCerrarRef = useRef(onCerrar)
  const detenerRef = useRef<() => void>(() => undefined)
  const procesandoRef = useRef(false)
  const ultimaLecturaRef = useRef<UltimaLecturaContinua>(null)
  const [estado, setEstado] = useState<'solicitando' | 'escaneando' | 'detectado' | 'error'>('solicitando')
  const [mensaje, setMensaje] = useState('Solicitando cámara…')
  const [feedback, setFeedback] = useState<FeedbackScanner | null>(null)
  const [camaras, setCamaras] = useState<MediaDeviceInfo[]>([])
  const [indiceCamara, setIndiceCamara] = useState(0)
  const [motor, setMotor] = useState<'nativo' | 'zxing' | null>(null)

  useEffect(() => { onDetectRef.current = onDetect }, [onDetect])
  useEffect(() => { onCerrarRef.current = onCerrar }, [onCerrar])

  useEffect(() => {
    if (!abierto) return
    let cancelado = false
    let stream: MediaStream | null = null
    let animacion = 0
    let controlesZxing: { stop: () => void } | null = null

    const detener = () => {
      if (animacion) window.cancelAnimationFrame(animacion)
      animacion = 0
      controlesZxing?.stop()
      controlesZxing = null
      detenerMediaStream(stream)
      stream = null
      if (videoRef.current) {
        videoRef.current.pause()
        videoRef.current.srcObject = null
      }
    }
    detenerRef.current = detener

    const aceptar = async (valor: string) => {
      const codigo = normalizarCodigoBarras(valor)
      if (!codigo || procesandoRef.current || cancelado) return
      const ahora = Date.now()
      const evaluacion = evaluarLecturaContinua(ultimaLecturaRef.current, codigo, ahora, AUSENCIA_PARA_REPETIR_MS)
      ultimaLecturaRef.current = evaluacion.siguiente
      if (continuo && !evaluacion.aceptar) return
      procesandoRef.current = true
      setEstado('detectado')
      setMensaje('Código detectado')
      if ('vibrate' in navigator) navigator.vibrate?.(45)
      try {
        const resultado = await onDetectRef.current(codigo)
        if (cancelado) return
        setFeedback(resultado || null)
        if (!continuo && resultado?.tipo !== 'error') {
          detener()
          onCerrarRef.current()
        } else {
          setEstado('escaneando')
          setMensaje('Incluye el código dentro del recuadro')
        }
      } finally {
        procesandoRef.current = false
      }
    }

    const iniciar = async () => {
      setEstado('solicitando')
      setMensaje('Solicitando cámara…')
      setFeedback(null)
      try {
        if (!window.isSecureContext) throw new DOMException('Contexto inseguro', 'SecurityError')
        const dispositivo = camaras[indiceCamara]
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: dispositivo?.deviceId
            ? { deviceId: { exact: dispositivo.deviceId } }
            : { facingMode: { ideal: 'environment' } },
        })
        if (cancelado) { detenerMediaStream(stream); return }
        const dispositivos = (await navigator.mediaDevices.enumerateDevices()).filter((item) => item.kind === 'videoinput')
        const dispositivoActivo = stream.getVideoTracks()[0]?.getSettings().deviceId
        const camarasOrdenadas = dispositivoActivo
          ? [...dispositivos].sort((a, b) => Number(b.deviceId === dispositivoActivo) - Number(a.deviceId === dispositivoActivo))
          : dispositivos
        if (!cancelado) setCamaras(camarasOrdenadas)
        const video = videoRef.current
        if (!video) throw new Error('Vista previa no disponible')
        video.srcObject = stream
        await video.play()

        const Detector = (window as unknown as { BarcodeDetector?: ConstructorDetector }).BarcodeDetector
        const soportados = Detector ? await Detector.getSupportedFormats().catch(() => []) : []
        const usarNativo = Boolean(Detector && FORMATOS.every((formato) => soportados.includes(formato)))
        setEstado('escaneando')
        setMensaje('Incluye el código dentro del recuadro')

        if (usarNativo && Detector) {
          setMotor('nativo')
          const detector = new Detector({ formats: FORMATOS })
          let detectando = false
          const detectarFrame = async () => {
            if (cancelado) return
            if (!detectando && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
              detectando = true
              try {
                const codigos = await detector.detect(video)
                if (codigos[0]) await aceptar(codigos[0].rawValue)
              } catch {
                // Un frame aún no decodificable no detiene el scanner.
              } finally {
                detectando = false
              }
            }
            if (!cancelado && (continuo || !procesandoRef.current)) animacion = window.requestAnimationFrame(detectarFrame)
          }
          animacion = window.requestAnimationFrame(detectarFrame)
          return
        }

        setMotor('zxing')
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        if (cancelado) return
        const lector = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 120, delayBetweenScanSuccess: 120 })
        controlesZxing = await lector.decodeFromStream(stream, video, (resultado) => {
          if (resultado) void aceptar(resultado.getText())
        })
      } catch (error) {
        detener()
        if (cancelado) return
        setEstado('error')
        setMensaje(mensajeCamara(error))
      }
    }

    void iniciar()
    return () => {
      cancelado = true
      procesandoRef.current = false
      detener()
    }
  }, [abierto, continuo, indiceCamara])

  useEffect(() => {
    if (!abierto) return
    const escapar = (evento: KeyboardEvent) => {
      if (evento.key !== 'Escape') return
      evento.preventDefault()
      detenerRef.current()
      onCerrarRef.current()
    }
    document.addEventListener('keydown', escapar)
    return () => document.removeEventListener('keydown', escapar)
  }, [abierto])

  if (!abierto) return null
  return <div className="fl-scanner-backdrop" role="presentation">
    <section className="fl-scanner" role="dialog" aria-modal="true" aria-labelledby="titulo-scanner">
      <header><div><span>CÁMARA</span><h2 id="titulo-scanner">Escanear código</h2></div><button type="button" aria-label="Cerrar escáner" onClick={() => { detenerRef.current(); onCerrar() }}><X /></button></header>
      <div className="fl-scanner-preview">
        <video ref={videoRef} muted playsInline aria-label="Vista previa de la cámara" />
        <div className="fl-scanner-frame" aria-hidden="true" />
        {feedback && <div className={`fl-scanner-feedback is-${feedback.tipo}`}><strong>{feedback.tipo === 'ok' ? '✓ ' : ''}{feedback.titulo}</strong>{feedback.detalle && <small>{feedback.detalle}</small>}</div>}
      </div>
      <div className={`fl-scanner-status is-${estado}`}>{estado === 'solicitando' ? <RefreshCw className="is-spinning" /> : estado === 'error' ? <CameraIcon /> : <Camera />}<div><strong>{mensaje}</strong>{motor && <small>{motor === 'nativo' ? 'Detector del navegador' : 'Detector compatible ZXing'}</small>}</div></div>
      <footer><button type="button" className="is-cancel" onClick={() => { detenerRef.current(); onCerrar() }}>Cancelar</button>{camaras.length > 1 && <button type="button" className="is-switch" aria-label="Cambiar cámara" onClick={() => setIndiceCamara((actual) => (actual + 1) % camaras.length)}><RefreshCw size={17} />Cambiar cámara</button>}</footer>
    </section>
  </div>
}
