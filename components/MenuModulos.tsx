'use client'

import { useEffect, useRef } from 'react'
import { LogOut, X } from 'lucide-react'
import type { RolUsuario, Tab } from '@/types'
import type { NavigationItem } from '@/components/Sidebar'

interface Props {
  abierto: boolean
  items: NavigationItem[]
  tab: Tab
  usuarioNombre: string
  usuarioCorreo: string
  usuarioRol: RolUsuario
  onCerrar: () => void
  onCambiarTab: (tab: Tab) => void
  onCerrarSistema: () => void
}

export default function MenuModulos({ abierto, items, tab, usuarioNombre, usuarioCorreo, usuarioRol, onCerrar, onCambiarTab, onCerrarSistema }: Props) {
  const dialogoRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!abierto) return
    const overflowAnterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    requestAnimationFrame(() => dialogoRef.current?.focus())
    const cerrarConEscape = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') {
        evento.preventDefault()
        onCerrar()
        return
      }
      if (evento.key !== 'Tab' || !dialogoRef.current) return
      const enfocables = Array.from(dialogoRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'))
      const primero = enfocables[0]
      const ultimo = enfocables.at(-1)
      if (evento.shiftKey && document.activeElement === primero) { evento.preventDefault(); ultimo?.focus() }
      else if (!evento.shiftKey && document.activeElement === ultimo) { evento.preventDefault(); primero?.focus() }
    }
    document.addEventListener('keydown', cerrarConEscape)
    return () => {
      document.body.style.overflow = overflowAnterior
      document.removeEventListener('keydown', cerrarConEscape)
    }
  }, [abierto, onCerrar])

  if (!abierto) return null

  return (
    <div className="fl-module-menu-backdrop" onMouseDown={(evento) => { if (evento.target === evento.currentTarget) onCerrar() }}>
      <section ref={dialogoRef} className="fl-module-menu" role="dialog" aria-modal="true" aria-labelledby="titulo-menu-modulos" tabIndex={-1}>
        <header>
          <div><span>FAST LOOK</span><h2 id="titulo-menu-modulos">Menú de secciones</h2></div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar menú"><X aria-hidden="true" /></button>
        </header>
        <nav className="fl-module-menu-grid" aria-label="Secciones disponibles">
          {items.map((item) => {
            const Icon = item.icon
            const activo = item.tab === tab
            return <button type="button" key={item.tab} className={activo ? 'is-active' : ''} aria-current={activo ? 'page' : undefined} onClick={() => { onCambiarTab(item.tab); onCerrar() }}><Icon aria-hidden="true" /><span>{item.label}</span></button>
          })}
        </nav>
        <footer>
          <div className="fl-user-avatar" aria-hidden="true">{usuarioNombre.trim().charAt(0).toUpperCase() || 'F'}</div>
          <div className="fl-user-copy"><strong>{usuarioNombre}</strong><span>{usuarioRol}</span><small>{usuarioCorreo}</small></div>
          <button type="button" className="fl-module-logout" onClick={onCerrarSistema}><LogOut aria-hidden="true" /><span>Cerrar sesión</span></button>
        </footer>
      </section>
    </div>
  )
}
