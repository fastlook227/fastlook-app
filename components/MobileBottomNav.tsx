'use client'

import { Home, Menu, Plus, X } from 'lucide-react'
import { useState } from 'react'
import type { Tab } from '@/types'
import type { NavigationItem } from '@/components/Sidebar'

interface MobileBottomNavProps {
  primaryItems: NavigationItem[]
  quickItems: NavigationItem[]
  moreItems: NavigationItem[]
  tab: Tab
  onCambiarTab: (tab: Tab) => void
  onCerrarSistema: () => void
}

export default function MobileBottomNav({
  primaryItems,
  quickItems,
  moreItems,
  tab,
  onCambiarTab,
  onCerrarSistema,
}: MobileBottomNavProps) {
  const [panel, setPanel] = useState<'quick' | 'more' | null>(null)
  const irA = (destino: Tab) => {
    onCambiarTab(destino)
    setPanel(null)
  }
  const renderItem = ({ tab: itemTab, label, icon: Icon }: NavigationItem) => (
    <button key={itemTab} type="button" className="fl-mobile-sheet-item" onClick={() => irA(itemTab)}>
      <Icon size={21} aria-hidden="true" /><span>{label}</span>
    </button>
  )

  return (
    <>
      {panel && (
        <div className="fl-mobile-sheet-backdrop" onClick={() => setPanel(null)}>
          <section className="fl-mobile-sheet" role="dialog" aria-modal="true" aria-label={panel === 'quick' ? 'Acciones rápidas' : 'Más opciones'} onClick={(event) => event.stopPropagation()}>
            <div className="fl-mobile-sheet-heading">
              <h2>{panel === 'quick' ? 'Acciones rápidas' : 'Más opciones'}</h2>
              <button type="button" className="fl-icon-button" onClick={() => setPanel(null)} aria-label="Cerrar menú"><X size={21} /></button>
            </div>
            <div className="fl-mobile-sheet-grid">
              {(panel === 'quick' ? quickItems : moreItems).map(renderItem)}
            </div>
            {panel === 'more' && <button type="button" className="fl-mobile-logout" onClick={onCerrarSistema}>Cerrar sesión</button>}
          </section>
        </div>
      )}

      <nav className="fl-mobile-nav" aria-label="Navegación móvil">
        {primaryItems.slice(0, 2).map(({ tab: itemTab, label, icon: Icon }, index) => (
          <button key={itemTab} type="button" className={`fl-mobile-nav-item${tab === itemTab ? ' is-active' : ''}`} onClick={() => irA(itemTab)} aria-current={tab === itemTab ? 'page' : undefined}>
            {index === 0 ? <Home size={22} aria-hidden="true" /> : <Icon size={22} aria-hidden="true" />}<span>{index === 0 ? 'Inicio' : label}</span>
          </button>
        ))}
        <button type="button" className="fl-mobile-quick" onClick={() => setPanel(panel === 'quick' ? null : 'quick')} aria-label="Abrir acciones rápidas" aria-expanded={panel === 'quick'}>
          <Plus size={27} aria-hidden="true" /><span>Acción</span>
        </button>
        {primaryItems.slice(2, 3).map(({ tab: itemTab, label, icon: Icon }) => (
          <button key={itemTab} type="button" className={`fl-mobile-nav-item${tab === itemTab ? ' is-active' : ''}`} onClick={() => irA(itemTab)} aria-current={tab === itemTab ? 'page' : undefined}>
            <Icon size={22} aria-hidden="true" /><span>{label}</span>
          </button>
        ))}
        <button type="button" className="fl-mobile-nav-item" onClick={() => setPanel(panel === 'more' ? null : 'more')} aria-expanded={panel === 'more'}>
          <Menu size={22} aria-hidden="true" /><span>Más</span>
        </button>
      </nav>
    </>
  )
}
