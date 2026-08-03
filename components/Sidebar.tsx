import type { LucideIcon } from 'lucide-react'
import { LogOut } from 'lucide-react'
import type { RolUsuario, Tab } from '@/types'

export interface NavigationItem {
  tab: Tab
  label: string
  icon: LucideIcon
}

interface SidebarProps {
  items: NavigationItem[]
  tab: Tab
  usuarioNombre: string
  usuarioCorreo: string
  usuarioRol: RolUsuario
  onCambiarTab: (tab: Tab) => void
  onCerrarSistema: () => void
}

export default function Sidebar({
  items,
  tab,
  usuarioNombre,
  usuarioCorreo,
  usuarioRol,
  onCambiarTab,
  onCerrarSistema,
}: SidebarProps) {
  return (
    <aside className="fl-sidebar" aria-label="Navegación principal">
      <div className="fl-sidebar-brand">
        <span className="fl-brand-mark" aria-hidden="true">FL</span>
        <div><strong>FAST LOOK</strong><small>Sistema de gestión</small></div>
      </div>

      <nav className="fl-sidebar-nav">
        {items.map(({ tab: itemTab, label, icon: Icon }) => (
          <button
            key={itemTab}
            type="button"
            className={`fl-sidebar-link${tab === itemTab ? ' is-active' : ''}`}
            aria-current={tab === itemTab ? 'page' : undefined}
            onClick={() => onCambiarTab(itemTab)}
          >
            <Icon size={20} strokeWidth={1.9} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="fl-sidebar-user">
        <span className="fl-user-avatar" aria-hidden="true">{usuarioNombre.trim().charAt(0).toUpperCase() || 'U'}</span>
        <div className="fl-user-copy">
          <strong>{usuarioNombre}</strong>
          <span>{usuarioRol}</span>
          <small title={usuarioCorreo}>{usuarioCorreo}</small>
        </div>
        <button type="button" className="fl-icon-button fl-logout-icon" onClick={onCerrarSistema} aria-label="Cerrar sesión" title="Cerrar sesión">
          <LogOut size={19} aria-hidden="true" />
        </button>
      </div>
    </aside>
  )
}
