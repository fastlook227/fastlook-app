'use client'

import type { CSSProperties, Dispatch, SetStateAction } from 'react'
import type {
  Cliente,
  FormCliente,
  MovimientoCliente,
} from '@/types'

interface ClientesProps {
  clientesFiltrados: Cliente[]
  clientes: Cliente[]
  movimientosClientes: MovimientoCliente[]
  busquedaClientes: string
  formCliente: FormCliente
  guardarCliente: () => void
  limpiarCliente: () => void
  agregarDeudaCliente: (cliente: Cliente) => void
  abonarCliente: (cliente: Cliente) => void
  liquidarCliente: (cliente: Cliente) => void
  operacionAbono: { clienteId: string; tipo: 'ABONO' | 'LIQUIDACION' } | null
  abrirWhatsAppCliente: (cliente: Cliente) => void
  editarCliente: (cliente: Cliente) => void
  eliminarClienteSinRegistro: (cliente: Cliente) => void
  setBusquedaClientes: Dispatch<SetStateAction<string>>
  setFormCliente: Dispatch<SetStateAction<FormCliente>>
  obtenerFechaLocal: (fecha: string | Date) => string
  styles: {
    card: CSSProperties
    input: CSSProperties
    bigButton: CSSProperties
    grayButton: CSSProperties
    alert: CSSProperties
    deudaBox: CSSProperties
    sinDeudaBox: CSSProperties
    redButton: CSSProperties
    blackButton: CSSProperties
    ticketItem: CSSProperties
  }
}

export default function Clientes({
  clientesFiltrados,
  clientes,
  movimientosClientes,
  busquedaClientes,
  formCliente,
  guardarCliente,
  limpiarCliente,
  agregarDeudaCliente,
  abonarCliente,
  liquidarCliente,
  operacionAbono,
  abrirWhatsAppCliente,
  editarCliente,
  eliminarClienteSinRegistro,
  setBusquedaClientes,
  setFormCliente,
  obtenerFechaLocal,
  styles,
}: ClientesProps) {
  return (
    <>
      <h2>Clientes</h2>

      <div style={styles.card}>
        <h3>{formCliente.id ? 'Editar cliente' : 'Agregar cliente'}</h3>

        <input
          style={styles.input}
          placeholder="Nombre del cliente *"
          value={formCliente.nombre}
          onChange={(e) => setFormCliente({ ...formCliente, nombre: e.target.value })}
        />

        <input
          style={styles.input}
          placeholder="Número de WhatsApp / teléfono (opcional)"
          value={formCliente.numero}
          onChange={(e) => setFormCliente({ ...formCliente, numero: e.target.value })}
        />

        <input
          style={styles.input}
          placeholder="¿Qué moto tiene? (opcional)"
          value={formCliente.moto}
          onChange={(e) => setFormCliente({ ...formCliente, moto: e.target.value })}
        />

        <input
          style={styles.input}
          type="number"
          placeholder="Deuda inicial"
          value={formCliente.deuda}
          onChange={(e) => setFormCliente({ ...formCliente, deuda: e.target.value })}
        />

        <button style={styles.bigButton} onClick={guardarCliente}>
          {formCliente.id ? 'Guardar cambios' : 'Agregar cliente'}
        </button>

        <button style={styles.grayButton} onClick={limpiarCliente}>
          Limpiar formulario
        </button>
      </div>

      <input
        style={styles.input}
        placeholder="Buscar cliente por nombre, número o moto..."
        value={busquedaClientes}
        onChange={(e) => setBusquedaClientes(e.target.value)}
      />

      <p>
        Mostrando <b>{clientesFiltrados.length}</b> de <b>{clientes.length}</b> clientes
      </p>

      {clientesFiltrados.length === 0 && (
        <div style={styles.alert}>No hay clientes registrados.</div>
      )}

      {clientesFiltrados.map((cliente) => {
        const movimientosDelCliente = movimientosClientes.filter(
          (m) => m.cliente_id === cliente.id
        )

        return (
          <div key={cliente.id} style={styles.card}>
            <h3>{cliente.nombre}</h3>

            <p><b>Número:</b> {cliente.numero || 'Sin número'}</p>
            <p><b>Moto:</b> {cliente.moto || 'No registrada'}</p>

            <div
              style={
                Number(cliente.deuda || 0) > 0
                  ? styles.deudaBox
                  : styles.sinDeudaBox
              }
            >
              <b>Deuda pendiente:</b> ${Number(cliente.deuda || 0).toFixed(2)}
            </div>

            <button style={styles.redButton} onClick={() => agregarDeudaCliente(cliente)}>
              Añadir más deuda
            </button>

            <button style={styles.blackButton} disabled={Boolean(operacionAbono)} onClick={() => abonarCliente(cliente)}>
              {operacionAbono?.clienteId === cliente.id && operacionAbono.tipo === 'ABONO' ? 'Registrando abono…' : 'Registrar abono'}
            </button>

            <button style={styles.bigButton} disabled={Boolean(operacionAbono)} onClick={() => liquidarCliente(cliente)}>
              {operacionAbono?.clienteId === cliente.id && operacionAbono.tipo === 'LIQUIDACION' ? 'Registrando abono…' : 'Liquidación total'}
            </button>

            {cliente.numero && (
              <button style={styles.grayButton} onClick={() => abrirWhatsAppCliente(cliente)}>
                Recordar por WhatsApp
              </button>
            )}

            <button style={styles.grayButton} onClick={() => editarCliente(cliente)}>
              Editar cliente
            </button>

            <button style={styles.blackButton} onClick={() => eliminarClienteSinRegistro(cliente)}>
              Eliminar sin registro
            </button>

            <h4>Historial del cliente</h4>

            {movimientosDelCliente.length === 0 && (
              <p>No hay movimientos registrados.</p>
            )}

            {movimientosDelCliente.slice(0, 5).map((m) => (
              <div key={m.id} style={styles.ticketItem}>
                <p><b>{m.tipo}</b> - ${Number(m.monto || 0).toFixed(2)}</p>
                <p>{m.nota}</p>
                <p>Fecha: {obtenerFechaLocal(m.created_at)}</p>
              </div>
            ))}
          </div>
        )
      })}
    </>
  )
}
