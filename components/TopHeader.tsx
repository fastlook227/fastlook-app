import { Bell, Menu, Search } from 'lucide-react'
import type { RolUsuario } from '@/types'

interface TopHeaderProps {
  usuarioNombre: string
  usuarioRol: RolUsuario
  notificaciones?: number
  onNotificaciones?: () => void
  onBuscar: () => void
  onMenu: (boton: HTMLButtonElement) => void
}

export default function TopHeader({ usuarioNombre, usuarioRol, notificaciones = 0, onBuscar, onNotificaciones, onMenu }: TopHeaderProps) {
  return (
    <header className="fl-top-header">
      <button type="button" className="fl-menu-button" onClick={(evento) => onMenu(evento.currentTarget)} aria-haspopup="dialog"><Menu aria-hidden="true" /><span>Menú</span></button>
      <img className="fl-mobile-brand-logo" src="/fast-look-logo.png" alt="" aria-hidden="true" />
      <div className="fl-top-title">
        <span>Hola,</span>
        <h1>{usuarioNombre}</h1>
        <p>{usuarioRol}</p>
      </div>
      <div className="fl-top-actions">
        <button type="button" className="fl-icon-button" onClick={onBuscar} aria-label="Buscar productos" title="Buscar productos">
          <Search size={21} aria-hidden="true" />
        </button>
        <button type="button" className="fl-icon-button" onClick={onNotificaciones} aria-label={`${notificaciones} notificaciones`} title="Notificaciones">
          <Bell size={21} aria-hidden="true" />
          {notificaciones > 0 && <span className="fl-notification-badge">{notificaciones > 99 ? '99+' : notificaciones}</span>}
        </button>
      </div>
    </header>
  )
}
