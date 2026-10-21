import { Boxes, ClipboardList, History, Package, Radio, ScanFace, Settings, Shield, ShoppingCart, SlidersHorizontal, Undo2, UserCog, Users, WalletCards, type LucideIcon } from 'lucide-react'
import type { RolUsuario, Tab } from '@/types'
import type { NavigationItem } from '@/components/Sidebar'

interface EntradaNavegacion extends NavigationItem { roles: RolUsuario[]; soloDesktopPOS?: boolean; requiereCorte?: boolean }

export const MODULOS_ARCHIVADOS: Tab[] = ['ia', 'precios', 'dashboard', 'compras', 'proveedores', 'stock']

export const NAVEGACION_FAST_LOOK: EntradaNavegacion[] = [
  { tab: 'venta', label: 'Generar venta', icon: ShoppingCart, roles: ['Admin', 'Vendedor'] },
  { tab: 'productos-personalizados', label: 'Productos personalizados', icon: SlidersHorizontal, roles: ['Admin'] },
  { tab: 'cascos', label: 'Cascos', icon: Shield, roles: ['Admin', 'Vendedor'] },
  { tab: 'devoluciones', label: 'Devoluciones', icon: Undo2, roles: ['Admin', 'Vendedor'] },
  { tab: 'interphone', label: 'Interphone', icon: Radio, roles: ['Admin', 'Vendedor'] },
  { tab: 'faltantes', label: 'Faltantes', icon: ClipboardList, roles: ['Admin', 'Vendedor'] },
  { tab: 'clientes', label: 'Clientes', icon: Users, roles: ['Admin', 'Vendedor'] },
  { tab: 'inventario', label: 'Inventario', icon: Package, roles: ['Admin'] },
  { tab: 'corte', label: 'Corte de caja', icon: WalletCards, roles: ['Admin', 'Vendedor'], requiereCorte: true },
  { tab: 'movimientos', label: 'Movimientos', icon: History, roles: ['Admin'] },
  { tab: 'check-in', label: 'Check In', icon: ScanFace, roles: ['Admin', 'Vendedor'] },
  { tab: 'usuarios', label: 'Usuarios', icon: UserCog, roles: ['Admin'] },
  { tab: 'pos-config', label: 'Configuración POS', icon: Settings, roles: ['Admin'], soloDesktopPOS: true },
]

const CAJAS_TIANGUIS: EntradaNavegacion = { tab: 'cajas-tianguis', label: 'Cajas del tianguis', icon: Boxes, roles: ['Admin', 'Vendedor'] }

export function obtenerNavegacionVisible(rol: RolUsuario, accesoCorte: boolean, esDesktopPOS: boolean, fechaLocal?: string): NavigationItem[] {
  const base = NAVEGACION_FAST_LOOK.filter((item) => item.roles.includes(rol) && (!item.requiereCorte || accesoCorte) && (!item.soloDesktopPOS || esDesktopPOS))
  const dia = fechaLocal ? new Date(`${fechaLocal}T00:00:00Z`).getUTCDay() : -1
  const items = [0, 6].includes(dia) ? [CAJAS_TIANGUIS, ...base] : [...base, CAJAS_TIANGUIS]
  return items.map(({ tab, label, icon }) => ({ tab, label, icon: icon as LucideIcon }))
}
