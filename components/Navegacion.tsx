import type { CSSProperties } from 'react'
import type { RolUsuario, Tab } from '@/types'

interface NavegacionProps {
  tab: Tab
  usuarioRol: RolUsuario
  onCambiarTab: (tab: Tab) => void
  onCerrarSistema: () => void
  styles: {
    header: CSSProperties
    logo: CSSProperties
    subtitle: CSSProperties
    userBox: CSSProperties
    userText: CSSProperties
    logoutButton: CSSProperties
    nav: CSSProperties
    activeBtn: CSSProperties
    navBtn: CSSProperties
  }
}

export default function Navegacion({
  tab,
  usuarioRol,
  onCambiarTab,
  onCerrarSistema,
  styles,
}: NavegacionProps) {
  return (
    <>
      <header style={styles.header}>
        <h1 style={styles.logo}>FAST LOOK</h1>
        <p style={styles.subtitle}>Sistema de Gestión</p>

        <div style={styles.userBox}>
          <p style={styles.userText}>
            Modo actual: <b>{usuarioRol}</b>
          </p>

          <button style={styles.logoutButton} onClick={onCerrarSistema}>
            Salir
          </button>
        </div>
      </header>

      <nav style={styles.nav}>
        <button style={tab === 'precios' ? styles.activeBtn : styles.navBtn} onClick={() => onCambiarTab('precios')}>Lista de precios</button>
        <button style={tab === 'venta' ? styles.activeBtn : styles.navBtn} onClick={() => onCambiarTab('venta')}>Generar venta</button>
        <button style={tab === 'stock' ? styles.activeBtn : styles.navBtn} onClick={() => onCambiarTab('stock')}>Stock bajo</button>
        <button style={tab === 'ia' ? styles.activeBtn : styles.navBtn} onClick={() => onCambiarTab('ia')}>Asistente IA</button>
        <button
          style={tab === 'clientes' ? styles.activeBtn : styles.navBtn}
          onClick={() => onCambiarTab('clientes')}
        >
          Clientes
        </button>

        {usuarioRol === 'Admin' && (
          <>
            <button style={tab === 'inventario' ? styles.activeBtn : styles.navBtn} onClick={() => onCambiarTab('inventario')}>Inventario</button>
            <button style={tab === 'corte' ? styles.activeBtn : styles.navBtn} onClick={() => onCambiarTab('corte')}>Corte de caja</button>
            <button style={tab === 'proveedores' ? styles.activeBtn : styles.navBtn} onClick={() => onCambiarTab('proveedores')}>Proveedores</button>
            <button style={tab === 'compras' ? styles.activeBtn : styles.navBtn} onClick={() => onCambiarTab('compras')}>Lista de compras</button>
            <button style={tab === 'movimientos' ? styles.activeBtn : styles.navBtn} onClick={() => onCambiarTab('movimientos')}>Movimientos</button>
            <button style={tab === 'dashboard' ? styles.activeBtn : styles.navBtn} onClick={() => onCambiarTab('dashboard')}>Dashboard</button>
          </>
        )}
      </nav>
    </>
  )
}
