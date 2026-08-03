'use client'

import type { ReactNode } from 'react'
import {
  AlertTriangle,
  Bot,
  ClipboardList,
  Gauge,
  History,
  Package,
  ShoppingCart,
  Tags,
  Truck,
  UserCog,
  Users,
  WalletCards,
} from 'lucide-react'
import type { RolUsuario, Tab } from '@/types'
import AppShell from '@/components/AppShell'
import MobileBottomNav from '@/components/MobileBottomNav'
import Sidebar, { type NavigationItem } from '@/components/Sidebar'
import TopHeader from '@/components/TopHeader'

interface NavegacionProps {
  tab: Tab
  usuarioRol: RolUsuario
  usuarioNombre: string
  usuarioCorreo: string
  onCambiarTab: (tab: Tab) => void
  onCerrarSistema: () => void
  children: ReactNode
}

const itemsGenerales: NavigationItem[] = [
  { tab: 'precios', label: 'Lista de precios', icon: Tags },
  { tab: 'venta', label: 'Generar venta', icon: ShoppingCart },
  { tab: 'stock', label: 'Stock bajo', icon: AlertTriangle },
  { tab: 'ia', label: 'Asistente', icon: Bot },
  { tab: 'clientes', label: 'Clientes', icon: Users },
]

const itemsAdmin: NavigationItem[] = [
  { tab: 'inventario', label: 'Inventario', icon: Package },
  { tab: 'corte', label: 'Corte de caja', icon: WalletCards },
  { tab: 'proveedores', label: 'Proveedores', icon: Truck },
  { tab: 'compras', label: 'Lista de compras', icon: ClipboardList },
  { tab: 'movimientos', label: 'Movimientos', icon: History },
  { tab: 'dashboard', label: 'Dashboard', icon: Gauge },
  { tab: 'usuarios', label: 'Usuarios', icon: UserCog },
]

export default function Navegacion({
  tab,
  usuarioRol,
  usuarioNombre,
  usuarioCorreo,
  onCambiarTab,
  onCerrarSistema,
  children,
}: NavegacionProps) {
  const items = usuarioRol === 'Admin' ? [...itemsGenerales, ...itemsAdmin] : itemsGenerales
  const buscar = (destino: Tab) => items.find((item) => item.tab === destino) as NavigationItem
  const primaryItems = usuarioRol === 'Admin'
    ? [buscar('precios'), buscar('venta'), buscar('inventario')]
    : [buscar('precios'), buscar('venta'), buscar('stock')]
  const quickTabs: Tab[] = usuarioRol === 'Admin'
    ? ['venta', 'inventario', 'ia', 'clientes', 'corte']
    : ['venta', 'precios', 'ia', 'clientes', 'stock']
  const quickItems = quickTabs.map(buscar)
  const primaryTabs = new Set(primaryItems.map((item) => item.tab))
  const moreItems = items.filter((item) => !primaryTabs.has(item.tab))

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
      header={<TopHeader usuarioNombre={usuarioNombre} usuarioRol={usuarioRol} onBuscar={() => onCambiarTab('precios')} />}
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
    >
      {children}
    </AppShell>
  )
}
