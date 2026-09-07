'use client'

import { Mic, MicOff, Radio, Volume2, VolumeX, Wifi, WifiOff } from 'lucide-react'
import type { RolUsuario } from '@/types'
import { useInterphone } from '@/hooks/useInterphone'
import { identificarHablante } from '@/utils/interphone'

interface InterphoneProps { usuarioId: string; usuarioNombre: string; usuarioRol: RolUsuario }

const etiquetaEstado = { desconectado: 'Desconectado', conectando: 'Conectando…', conectado: 'Conectado', reconectando: 'Reconectando…', 'sin-microfono': 'Sin micrófono', error: 'Error' } as const

export default function Interphone({ usuarioId, usuarioNombre, usuarioRol }: InterphoneProps) {
  const radio = useInterphone({ usuarioId, nombre: usuarioNombre, rol: usuarioRol })
  const hablante = identificarHablante(radio.usuarios, radio.hablandoId)
  const otroHablando = Boolean(radio.hablandoId && radio.hablandoId !== usuarioId)
  const canalOcupado = otroHablando && !radio.transmitiendo
  const activo = radio.estado !== 'desconectado' && radio.estado !== 'sin-microfono' && radio.estado !== 'error'

  return <section className="fl-interphone">
    <header><div><span><Radio size={18} /> Comunicación interna</span><h2>INTERPHONE</h2><p>Radio interno de audio en tiempo real. El audio no se graba ni se almacena.</p></div><strong>BODEGA</strong></header>
    <div className="fl-interphone-grid">
      <aside className="fl-radio-presence">
        <div className={`fl-radio-status is-${radio.estado}`}>{radio.estado === 'conectado' ? <Wifi /> : <WifiOff />}<span>Estado<strong>{etiquetaEstado[radio.estado]}</strong></span></div>
        <div className="fl-radio-users-heading"><span>Usuarios conectados</span><b>{radio.usuarios.length}</b></div>
        <ul>{radio.usuarios.map((usuario) => <li key={usuario.id} className={radio.hablandoId === usuario.id ? 'is-speaking' : ''}><i /><span><strong>{usuario.nombre}{usuario.id === usuarioId ? ' (tú)' : ''}</strong><small>{usuario.rol}</small></span>{radio.hablandoId === usuario.id && <Radio size={18} />}</li>)}</ul>
        {!activo && <button type="button" className="fl-radio-activate" onClick={() => void radio.conectar()}><Mic size={20} /> Activar Interphone</button>}
        {activo && <button type="button" className="fl-radio-disconnect" onClick={() => void radio.desconectar()}>Salir del canal</button>}
        {radio.error && <p className="fl-radio-error" role="alert">{radio.error}</p>}
      </aside>
      <div className="fl-radio-console">
        <div className="fl-radio-channel"><span>CANAL</span><strong>BODEGA</strong><small>{radio.transmitiendo ? 'TRANSMITIENDO…' : canalOcupado ? `${(hablante || 'OTRO USUARIO').toUpperCase()} ESTÁ HABLANDO` : radio.estado === 'conectado' ? 'LISTO PARA HABLAR' : etiquetaEstado[radio.estado].toUpperCase()}</small></div>
        <button
          type="button"
          className={`fl-ptt${radio.transmitiendo ? ' is-transmitting' : ''}${canalOcupado ? ' is-busy' : ''}`}
          disabled={radio.estado !== 'conectado' || canalOcupado}
          onPointerDown={(evento) => { evento.currentTarget.setPointerCapture(evento.pointerId); radio.iniciarTransmision() }}
          onPointerUp={radio.detenerTransmision}
          onPointerCancel={radio.detenerTransmision}
          onPointerLeave={() => { if (radio.transmitiendo) radio.detenerTransmision() }}
          onContextMenu={(evento) => evento.preventDefault()}
        >{radio.transmitiendo ? <><Radio /><strong>TRANSMITIENDO…</strong><span>Suelta para terminar</span></> : canalOcupado ? <><MicOff /><strong>CANAL OCUPADO</strong><span>{hablante} está hablando</span></> : <><Mic /><strong>MANTENER<br />PARA HABLAR</strong><span>Presiona y sostén</span></>}</button>
        <div className="fl-radio-controls"><label><span><Volume2 size={18} /> Volumen</span><b>{radio.volumen}%</b><input type="range" min="0" max="100" value={radio.volumen} onChange={(evento) => radio.setVolumen(Number(evento.target.value))} /></label><button type="button" onClick={radio.cambiarSilenciado}>{radio.silenciado ? <Volume2 /> : <VolumeX />}{radio.silenciado ? 'Activar recepción' : 'Silenciar recepción'}</button></div>
        {radio.audioBloqueado && <button className="fl-radio-audio-unlock" type="button" onClick={radio.activarAudio}>Activar audio</button>}
      </div>
    </div>
  </section>
}

