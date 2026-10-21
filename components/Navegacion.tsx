'use client'

import type { ReactNode } from 'react'
import type { RolUsuario, Tab } from '@/types'
import { puedeAccederCorteCaja } from '@/lib/permisos/corteCaja'
import { obtenerNavegacionVisible } from '@/lib/navegacion/configuracion'
import usePOSDesktop from '@/hooks/usePOSDesktop'
import AppShell from '@/components/AppShell'
import MobileBottomNav from '@/components/MobileBottomNav'
import Sidebar, { type NavigationItem } from '@/components/Sidebar'
import TopHeader from '@/components/TopHeader'

interface NavegacionProps {
  tab: Tab
  usuarioRol: RolUsuario
  usuarioNombre: string
  usuarioCorreo: string
  fechaOperativa: string
  onCambiarTab: (tab: Tab) => void
  onCerrarSistema: () => void
  onBuscarProductos: () => void
  children: ReactNode
  floatingCart?: ReactNode
}

export default function Navegacion({
  tab,
  usuarioRol,
  usuarioNombre,
  usuarioCorreo,
  fechaOperativa,
  onCambiarTab,
  onCerrarSistema,
  onBuscarProductos,
  children,
  floatingCart,
}: NavegacionProps) {
  const accesoCorte = puedeAccederCorteCaja(usuarioCorreo)
  const esDesktopPOS = usePOSDesktop()
  const items = obtenerNavegacionVisible(usuarioRol, accesoCorte, esDesktopPOS, fechaOperativa)
  const primaryItems = items.slice(0, 3)
  const quickItems = items
  const moreItems = items.slice(3)

  return (
    <AppShell
      sidebar={
        <Sidebar
          items={items}
          tab={tab}
          usuarioNombre={usuarioNombre}
          usuarioCorreo={usuarioCorreo}
          usuarioRol={usuarioRol}
          onCambiarTab={onCambiarTab}
          onCerrarSistema={onCerrarSistema}
        />
      }
      header={<TopHeader usuarioNombre={usuarioNombre} usuarioRol={usuarioRol} onBuscar={onBuscarProductos} />}
      mobileNavigation={
        <MobileBottomNav
          primaryItems={primaryItems}
          quickItems={quickItems}
          moreItems={moreItems}
          tab={tab}
          onCambiarTab={onCambiarTab}
          onCerrarSistema={onCerrarSistema}
        />
      }
      floatingCart={floatingCart}
    >
      {children}
    </AppShell>
  )
}
