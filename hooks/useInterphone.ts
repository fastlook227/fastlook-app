'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { RolUsuario } from '@/types'
import type { EstadoConexionInterphone, SenalWebRTC, UsuarioInterphone } from '@/types/interphone'
import { normalizarVolumen } from '@/utils/interphone'

const CANAL = 'interphone:bodega'
const STUN_FALLBACK = 'stun:stun.l.google.com:19302'
const diagnostico = (...datos: unknown[]) => {
  if (process.env.NODE_ENV !== 'production') console.debug('[Interphone]', ...datos)
}
const diagnosticoSdp = (tipo: 'offer' | 'answer', peerId: string, sdp?: string) => {
  if (process.env.NODE_ENV === 'production') return
  const audio = sdp?.split(/\r?\n/).some((linea) => linea.startsWith('m=audio')) ?? false
  const direccion = sdp?.match(/^a=(sendrecv|sendonly|recvonly|inactive)$/m)?.[1] || 'desconocida'
  diagnostico(`${tipo} SDP`, { peerId, audio, direccion })
}
const diagnosticoTransceivers = (peerId: string, conexion: RTCPeerConnection) => diagnostico('TRANSCEIVERS', {
  peerId,
  total: conexion.getTransceivers().length,
  transceivers: conexion.getTransceivers().map((transceiver) => ({ mid: transceiver.mid, kind: transceiver.sender.track?.kind || transceiver.receiver.track?.kind, direction: transceiver.direction, currentDirection: transceiver.currentDirection })),
})

interface UseInterphoneArgs { usuarioId: string; nombre: string; rol: RolUsuario }

const configuracionRTC = (): RTCConfiguration => ({
  iceServers: [{ urls: process.env.NEXT_PUBLIC_INTERPHONE_STUN_URL || STUN_FALLBACK }],
})

export function useInterphone({ usuarioId, nombre, rol }: UseInterphoneArgs) {
  const [estado, setEstado] = useState<EstadoConexionInterphone>('desconectado')
  const [usuarios, setUsuarios] = useState<UsuarioInterphone[]>([])
  const [hablandoId, setHablandoId] = useState<string | null>(null)
  const [transmitiendo, setTransmitiendo] = useState(false)
  const [error, setError] = useState('')
  const [audioBloqueado, setAudioBloqueado] = useState(false)
  const [volumen, setVolumenState] = useState(100)
  const [silenciado, setSilenciado] = useState(false)
  const canalRef = useRef<RealtimeChannel | null>(null)
  const streamLocalRef = useRef<MediaStream | null>(null)
  const conexionesRef = useRef(new Map<string, RTCPeerConnection>())
  const audiosRef = useRef(new Map<string, HTMLAudioElement>())
  const activoRef = useRef(false)
  const transmitiendoRef = useRef(false)
  const volumenRef = useRef(100)
  const silenciadoRef = useRef(false)
  const statsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const colasNegociacionRef = useRef(new Map<string, Promise<void>>())
  const ofertasSolicitadasRef = useRef(new Set<string>())
  const makingOfferRef = useRef(new Set<string>())
  const settingRemoteAnswerRef = useRef(new Set<string>())
  const ignoreOfferRef = useRef(new Set<string>())
  const negociadosRef = useRef(new Set<string>())
  const candidatosPendientesRef = useRef(new Map<string, RTCIceCandidateInit[]>())

  const encolarNegociacion = useCallback((peerId: string, operacion: () => Promise<void>) => {
    const anterior = colasNegociacionRef.current.get(peerId) || Promise.resolve()
    const siguiente = anterior.catch(() => undefined).then(operacion)
    colasNegociacionRef.current.set(peerId, siguiente)
    siguiente.then(() => { if (colasNegociacionRef.current.get(peerId) === siguiente) colasNegociacionRef.current.delete(peerId) }, () => { if (colasNegociacionRef.current.get(peerId) === siguiente) colasNegociacionRef.current.delete(peerId) })
    return siguiente
  }, [])

  const apagarMicrofono = useCallback(() => {
    streamLocalRef.current?.getAudioTracks().forEach((track) => { track.enabled = false; diagnostico('LOCAL_AUDIO_TRACK', { enabled: track.enabled, muted: track.muted, readyState: track.readyState }) })
    transmitiendoRef.current = false
    setTransmitiendo(false)
  }, [])

  const emitir = useCallback(async (event: string, payload: object) => {
    if (!canalRef.current) return
    await canalRef.current.send({ type: 'broadcast', event, payload })
  }, [])

  const detenerTransmision = useCallback(() => {
    const estabaTransmitiendo = transmitiendoRef.current
    apagarMicrofono()
    setHablandoId((actual) => actual === usuarioId ? null : actual)
    if (estabaTransmitiendo) void emitir('ptt-stop', { usuarioId })
  }, [apagarMicrofono, emitir, usuarioId])

  const cerrarConexion = useCallback((peerId: string) => {
    const conexion = conexionesRef.current.get(peerId)
    if (conexion) { diagnostico('PEER_CLOSED', peerId); conexion.close() }
    conexionesRef.current.delete(peerId)
    colasNegociacionRef.current.delete(peerId); ofertasSolicitadasRef.current.delete(peerId); makingOfferRef.current.delete(peerId); settingRemoteAnswerRef.current.delete(peerId); ignoreOfferRef.current.delete(peerId); negociadosRef.current.delete(peerId); candidatosPendientesRef.current.delete(peerId)
    const audio = audiosRef.current.get(peerId)
    if (audio) { audio.pause(); audio.srcObject = null; audio.remove() }
    audiosRef.current.delete(peerId)
  }, [])

  const reproducirAudio = useCallback(async (audio: HTMLAudioElement) => {
    audio.volume = normalizarVolumen(volumenRef.current)
    audio.muted = silenciadoRef.current
    try { await audio.play(); diagnostico('AUTOPLAY_ALLOWED'); setAudioBloqueado(false) } catch { diagnostico('AUTOPLAY_BLOCKED'); setAudioBloqueado(true) }
  }, [])

  const obtenerConexion = useCallback((peerId: string) => {
    const existente = conexionesRef.current.get(peerId)
    if (existente) return existente
    const conexion = new RTCPeerConnection(configuracionRTC())
    diagnostico('PEER_CREATED', peerId)
    const streamLocal = streamLocalRef.current
    if (streamLocal) streamLocal.getAudioTracks().forEach((track) => { conexion.addTrack(track, streamLocal); diagnostico('LOCAL_AUDIO_ADDED', { peerId, enabled: track.enabled, muted: track.muted, readyState: track.readyState }); diagnosticoTransceivers(peerId, conexion) })
    conexion.onsignalingstatechange = () => diagnostico('signalingState', peerId, conexion.signalingState)
    conexion.onicegatheringstatechange = () => diagnostico('iceGatheringState', peerId, conexion.iceGatheringState)
    conexion.oniceconnectionstatechange = () => diagnostico('iceConnectionState', peerId, conexion.iceConnectionState)
    conexion.onicecandidate = ({ candidate }) => {
      if (candidate) void emitir('ice-candidate', { origen: usuarioId, destino: peerId, candidato: candidate.toJSON() } satisfies SenalWebRTC)
    }
    conexion.ontrack = ({ streams, track }) => {
      const eventoTrack = track || conexion.getReceivers().map((receiver) => receiver.track).find((remote) => remote?.kind === 'audio')
      diagnostico('REMOTE_TRACK_RECEIVED', { peerId, kind: eventoTrack?.kind, enabled: eventoTrack?.enabled, muted: eventoTrack?.muted, readyState: eventoTrack?.readyState })
      const stream = streams[0] || (eventoTrack ? new MediaStream([eventoTrack]) : undefined)
      if (!stream) return
      let audio = audiosRef.current.get(peerId)
      if (!audio) {
        audio = document.createElement('audio')
        audio.autoplay = true
        audio.setAttribute('playsinline', '')
        audio.hidden = true
        document.body.appendChild(audio)
        audiosRef.current.set(peerId, audio)
      }
      audio.srcObject = stream
      void reproducirAudio(audio)
    }
    conexion.onconnectionstatechange = () => {
      diagnostico('connectionState', peerId, conexion.connectionState)
      if (['failed', 'closed'].includes(conexion.connectionState)) cerrarConexion(peerId)
    }
    conexionesRef.current.set(peerId, conexion)
    return conexion
  }, [cerrarConexion, emitir, reproducirAudio, usuarioId])

  const crearOferta = useCallback(async (peerId: string) => {
    if (negociadosRef.current.has(peerId) || ofertasSolicitadasRef.current.has(peerId)) return
    ofertasSolicitadasRef.current.add(peerId)
    await encolarNegociacion(peerId, async () => {
      const conexion = obtenerConexion(peerId)
      if (conexion.signalingState !== 'stable' || negociadosRef.current.has(peerId)) return
      makingOfferRef.current.add(peerId)
      try {
        diagnostico('CREATE_OFFER', peerId); diagnosticoTransceivers(peerId, conexion)
        const oferta = await conexion.createOffer()
        await conexion.setLocalDescription(oferta)
        diagnostico('SET_LOCAL_OFFER', peerId); diagnosticoSdp('offer', peerId, oferta.sdp); diagnosticoTransceivers(peerId, conexion)
        await emitir('offer', { origen: usuarioId, destino: peerId, descripcion: oferta } satisfies SenalWebRTC)
      } catch (causa) {
        diagnostico('NEGOTIATION_FAILED', peerId, causa instanceof Error ? causa.name : 'unknown')
        cerrarConexion(peerId)
      } finally {
        makingOfferRef.current.delete(peerId); ofertasSolicitadasRef.current.delete(peerId)
      }
    })
  }, [cerrarConexion, emitir, encolarNegociacion, obtenerConexion, usuarioId])

  const desconectar = useCallback(async () => {
    activoRef.current = false
    detenerTransmision()
    streamLocalRef.current?.getTracks().forEach((track) => track.stop())
    streamLocalRef.current = null
    conexionesRef.current.forEach((_, peerId) => cerrarConexion(peerId))
    const canal = canalRef.current
    canalRef.current = null
    if (canal) await supabase.removeChannel(canal)
    if (statsTimerRef.current) clearInterval(statsTimerRef.current)
    statsTimerRef.current = null
    setUsuarios([]); setHablandoId(null); setEstado('desconectado'); setAudioBloqueado(false)
  }, [cerrarConexion, detenerTransmision])

  const conectar = useCallback(async () => {
    if (activoRef.current) return
    setEstado('conectando'); setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      stream.getAudioTracks().forEach((track) => { track.enabled = false })
      diagnostico('getUserMedia ok', stream.getAudioTracks().map((track) => ({ enabled: track.enabled, muted: track.muted, readyState: track.readyState })))
      streamLocalRef.current = stream
      activoRef.current = true
      const canal = supabase.channel(CANAL, { config: { presence: { key: usuarioId }, broadcast: { self: false } } })
      canalRef.current = canal
      const procesarSenal = async (evento: string, senal: SenalWebRTC) => {
        if (senal.destino !== usuarioId || !activoRef.current) return
        await encolarNegociacion(senal.origen, async () => {
          const conexion = obtenerConexion(senal.origen)
          try {
            if (evento === 'offer' && senal.descripcion) {
              const listo = !makingOfferRef.current.has(senal.origen) && (conexion.signalingState === 'stable' || settingRemoteAnswerRef.current.has(senal.origen))
              const colision = !listo
              const polite = usuarioId > senal.origen
              if (colision) diagnostico('NEGOTIATION_COLLISION', { peerId: senal.origen, polite, signalingState: conexion.signalingState })
              if (colision && !polite) { ignoreOfferRef.current.add(senal.origen); return }
              ignoreOfferRef.current.delete(senal.origen)
              if (colision) await conexion.setLocalDescription({ type: 'rollback' })
              diagnostico('REMOTE_OFFER', senal.origen); diagnosticoSdp('offer', senal.origen, senal.descripcion.sdp)
              await conexion.setRemoteDescription(senal.descripcion)
              for (const candidato of candidatosPendientesRef.current.get(senal.origen) || []) await conexion.addIceCandidate(candidato)
              candidatosPendientesRef.current.delete(senal.origen)
              diagnostico('CREATE_ANSWER', senal.origen)
              const respuesta = await conexion.createAnswer()
              await conexion.setLocalDescription(respuesta)
              negociadosRef.current.add(senal.origen)
              diagnostico('SET_LOCAL_ANSWER', senal.origen); diagnosticoSdp('answer', senal.origen, respuesta.sdp); diagnosticoTransceivers(senal.origen, conexion)
              await emitir('answer', { origen: usuarioId, destino: senal.origen, descripcion: respuesta } satisfies SenalWebRTC)
            } else if (evento === 'answer' && senal.descripcion) {
              settingRemoteAnswerRef.current.add(senal.origen)
              try { diagnostico('REMOTE_ANSWER', senal.origen); diagnosticoSdp('answer', senal.origen, senal.descripcion.sdp); await conexion.setRemoteDescription(senal.descripcion); negociadosRef.current.add(senal.origen); diagnosticoTransceivers(senal.origen, conexion) }
              finally { settingRemoteAnswerRef.current.delete(senal.origen) }
              for (const candidato of candidatosPendientesRef.current.get(senal.origen) || []) await conexion.addIceCandidate(candidato)
              candidatosPendientesRef.current.delete(senal.origen)
            } else if (evento === 'ice-candidate' && senal.candidato && !ignoreOfferRef.current.has(senal.origen)) {
              if (conexion.remoteDescription) await conexion.addIceCandidate(senal.candidato)
              else candidatosPendientesRef.current.set(senal.origen, [...(candidatosPendientesRef.current.get(senal.origen) || []), senal.candidato])
            }
          } catch (causa) {
            diagnostico('NEGOTIATION_FAILED', senal.origen, causa instanceof Error ? causa.name : 'unknown')
            cerrarConexion(senal.origen)
          }
        })
      }
      canal
        .on('presence', { event: 'sync' }, () => {
          const presentes = (Object.values(canal.presenceState()).flat() as unknown[])
            .filter((dato): dato is Record<string, unknown> => typeof dato === 'object' && dato !== null && 'id' in dato)
          diagnostico('presence sync', presentes.map((dato) => String(dato.id)))
          setUsuarios(presentes.map((dato) => ({ id: String(dato.id), nombre: String(dato.nombre), rol: dato.rol === 'Admin' ? 'Admin' : 'Vendedor', hablando: Boolean(dato.hablando), onlineAt: String(dato.onlineAt) })))
          presentes.forEach((peer) => { const peerId = String(peer.id); if (peerId !== usuarioId && usuarioId < peerId && !negociadosRef.current.has(peerId)) void crearOferta(peerId) })
        })
        .on('presence', { event: 'join' }, ({ newPresences }) => diagnostico('presence join', newPresences.map((dato) => String((dato as { id?: string }).id || ''))))
        .on('presence', { event: 'leave' }, ({ leftPresences }) => {
          diagnostico('presence leave', leftPresences.map((dato) => String((dato as { id?: string }).id || '')))
          leftPresences.forEach((dato) => { const id = String((dato as { id?: string }).id || ''); if (id) { cerrarConexion(id); setHablandoId((actual) => actual === id ? null : actual) } })
        })
        .on('broadcast', { event: 'ping' }, ({ payload }) => diagnostico('broadcast ping received', String((payload as { origen?: string }).origen || 'desconocido')))
        .on('broadcast', { event: 'offer' }, ({ payload }) => { diagnostico('broadcast offer received', String((payload as SenalWebRTC).origen)); void procesarSenal('offer', payload as SenalWebRTC) })
        .on('broadcast', { event: 'answer' }, ({ payload }) => { diagnostico('broadcast answer received', String((payload as SenalWebRTC).origen)); void procesarSenal('answer', payload as SenalWebRTC) })
        .on('broadcast', { event: 'ice-candidate' }, ({ payload }) => { diagnostico('broadcast ice-candidate received', String((payload as SenalWebRTC).origen)); void procesarSenal('ice-candidate', payload as SenalWebRTC) })
        .on('broadcast', { event: 'ptt-start' }, ({ payload }) => {
          const id = String((payload as { usuarioId?: string }).usuarioId || '')
          diagnostico('broadcast ptt-start received', id)
          if (!id || id === usuarioId) return
          if (transmitiendoRef.current && usuarioId < id) { void emitir('ptt-start', { usuarioId }); return }
          apagarMicrofono(); setHablandoId(id)
        })
        .on('broadcast', { event: 'ptt-stop' }, ({ payload }) => { const id = String((payload as { usuarioId?: string }).usuarioId || ''); diagnostico('broadcast ptt-stop received', id); setHablandoId((actual) => actual === id ? null : actual) })
        .subscribe(async (status) => {
          diagnostico('channel status', status, { topic: `realtime:${CANAL}`, peerId: usuarioId })
          if (status === 'SUBSCRIBED') {
            const resultado = await canal.track({ id: usuarioId, nombre, rol, hablando: false, onlineAt: new Date().toISOString() } satisfies UsuarioInterphone)
            diagnostico('presence track', resultado, usuarioId)
            if (resultado === 'ok') {
              setEstado('conectado')
              if (process.env.NODE_ENV !== 'production') await canal.send({ type: 'broadcast', event: 'ping', payload: { origen: usuarioId } })
            } else {
              apagarMicrofono(); setEstado('reconectando')
            }
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            apagarMicrofono(); setEstado('reconectando')
          } else if (status === 'CLOSED' && activoRef.current) { apagarMicrofono(); setEstado('reconectando') }
        })
      if (process.env.NODE_ENV !== 'production') statsTimerRef.current = setInterval(() => conexionesRef.current.forEach((conexion, peerId) => {
        void conexion.getStats().then((reporte) => reporte.forEach((stat) => {
          const dato = stat as unknown as Record<string, unknown>
          const tipo = String(dato.type || '')
          const medio = String(dato.kind || dato.mediaType || '')
          if (medio !== 'audio' || !['inbound-rtp', 'outbound-rtp'].includes(tipo)) return
          diagnostico('AUDIO_STATS', { peerId, direccion: tipo, bytesSent: dato.bytesSent, packetsSent: dato.packetsSent, bytesReceived: dato.bytesReceived, packetsReceived: dato.packetsReceived, audioLevel: dato.audioLevel })
        })).catch(() => diagnostico('AUDIO_STATS unavailable', peerId))
      }), 2_000)
    } catch (causa) {
      activoRef.current = false; apagarMicrofono()
      const denegado = causa instanceof DOMException && ['NotAllowedError', 'NotFoundError'].includes(causa.name)
      setEstado(denegado ? 'sin-microfono' : 'error')
      setError(denegado ? 'Permite el micrófono en el navegador para usar Interphone.' : 'No fue posible activar Interphone. Revisa la conexión e inténtalo de nuevo.')
    }
  }, [apagarMicrofono, cerrarConexion, crearOferta, emitir, encolarNegociacion, nombre, obtenerConexion, rol, usuarioId])

  const iniciarTransmision = useCallback(() => {
    if (estado !== 'conectado' || hablandoId || transmitiendoRef.current) return
    const track = streamLocalRef.current?.getAudioTracks()[0]
    if (!track) return
    track.enabled = true; transmitiendoRef.current = true; setTransmitiendo(true); setHablandoId(usuarioId)
    diagnostico('LOCAL_AUDIO_TRACK', { enabled: track.enabled, muted: track.muted, readyState: track.readyState })
    void emitir('ptt-start', { usuarioId })
  }, [emitir, estado, hablandoId, usuarioId])

  const setVolumen = useCallback((valor: number) => {
    const seguro = Math.min(100, Math.max(0, valor)); volumenRef.current = seguro; setVolumenState(seguro)
    audiosRef.current.forEach((audio) => { audio.volume = normalizarVolumen(seguro) })
  }, [])
  const cambiarSilenciado = useCallback(() => setSilenciado((actual) => { const siguiente = !actual; silenciadoRef.current = siguiente; audiosRef.current.forEach((audio) => { audio.muted = siguiente }); return siguiente }), [])
  const activarAudio = useCallback(() => { audiosRef.current.forEach((audio) => void reproducirAudio(audio)) }, [reproducirAudio])

  useEffect(() => {
    const asegurarSilencio = () => detenerTransmision()
    const visibilidad = () => { if (document.hidden) asegurarSilencio() }
    window.addEventListener('blur', asegurarSilencio); document.addEventListener('visibilitychange', visibilidad)
    return () => { window.removeEventListener('blur', asegurarSilencio); document.removeEventListener('visibilitychange', visibilidad); void desconectar() }
  }, [desconectar, detenerTransmision])

  return { estado, usuarios, hablandoId, transmitiendo, error, audioBloqueado, volumen, silenciado, conectar, desconectar, iniciarTransmision, detenerTransmision, setVolumen, cambiarSilenciado, activarAudio }
}
