'use client'

import { useCallback, useRef, useState, type ReactNode } from 'react'
import type { RolUsuario, Tab } from '@/types'
import { puedeAccederCorteCaja } from '@/lib/permisos/corteCaja'
import { obtenerNavegacionVisible } from '@/lib/navegacion/configuracion'
import usePOSDesktop from '@/hooks/usePOSDesktop'
import AppShell from '@/components/AppShell'
import TopHeader from '@/components/TopHeader'
import MenuModulos from '@/components/MenuModulos'

interface NavegacionProps {
  tab: Tab
  usuarioRol: RolUsuario
  usuarioNombre: string
  usuarioCorreo: string
  fechaOperativa: string
  onCambiarTab: (tab: Tab) => void
  onCerrarSistema: () => void
  onBuscarProductos: () => void
  notificaciones?: number
  onNotificaciones?: () => void
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
  notificaciones,
  onNotificaciones,
  children,
  floatingCart,
}: NavegacionProps) {
  const accesoCorte = puedeAccederCorteCaja(usuarioCorreo)
  const esDesktopPOS = usePOSDesktop()
  const items = obtenerNavegacionVisible(usuarioRol, accesoCorte, esDesktopPOS, fechaOperativa)
  const [menuAbierto, setMenuAbierto] = useState(false)
  const disparadorMenuRef = useRef<HTMLButtonElement | null>(null)
  const cerrarMenu = useCallback(() => {
    setMenuAbierto(false)
    requestAnimationFrame(() => disparadorMenuRef.current?.focus())
  }, [])

  return (
    <><AppShell
      sidebar={null}
      header={<TopHeader usuarioNombre={usuarioNombre} usuarioRol={usuarioRol} onMenu={(boton) => { disparadorMenuRef.current = boton; setMenuAbierto(true) }} onBuscar={onBuscarProductos} notificaciones={notificaciones} onNotificaciones={onNotificaciones} />}
      mobileNavigation={null}
      floatingCart={floatingCart}
    >
      {children}
    </AppShell><MenuModulos abierto={menuAbierto} items={items} tab={tab} usuarioNombre={usuarioNombre} usuarioCorreo={usuarioCorreo} usuarioRol={usuarioRol} onCerrar={cerrarMenu} onCambiarTab={onCambiarTab} onCerrarSistema={onCerrarSistema} /></>
  )
}
