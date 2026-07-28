'use client'

import type { CSSProperties, Dispatch, SetStateAction } from 'react'
import type { FormProveedor, Proveedor } from '@/types'

interface ProveedoresProps {
  formProveedor: FormProveedor
  setFormProveedor: Dispatch<SetStateAction<FormProveedor>>
  proveedores: Proveedor[]
  guardarProveedor: () => void
  limpiarProveedor: () => void
  editarProveedor: (proveedor: Proveedor) => void
  abrirWhatsAppProveedor: (telefono: string, mensaje: string) => void
  styles: {
    input: CSSProperties
    bigButton: CSSProperties
    grayButton: CSSProperties
    card: CSSProperties
    redButton: CSSProperties
    blackButton: CSSProperties
  }
}

export default function Proveedores({
  formProveedor,
  setFormProveedor,
  proveedores,
  guardarProveedor,
  limpiarProveedor,
  editarProveedor,
  abrirWhatsAppProveedor,
  styles,
}: ProveedoresProps) {
  return (
    <>
      <h2>Proveedores</h2>

      <input
        style={styles.input}
        placeholder="Nombre del proveedor"
        value={formProveedor.nombre}
        onChange={(e) => setFormProveedor({ ...formProveedor, nombre: e.target.value })}
      />

      <input
        style={styles.input}
        placeholder="Teléfono WhatsApp"
        value={formProveedor.telefono}
        onChange={(e) => setFormProveedor({ ...formProveedor, telefono: e.target.value })}
      />

      <input
        style={styles.input}
        placeholder="Productos que maneja"
        value={formProveedor.productos}
        onChange={(e) => setFormProveedor({ ...formProveedor, productos: e.target.value })}
      />

      <input
        style={styles.input}
        placeholder="Tiempo de entrega"
        value={formProveedor.tiempo_entrega}
        onChange={(e) => setFormProveedor({ ...formProveedor, tiempo_entrega: e.target.value })}
      />

      <textarea
        style={styles.input}
        placeholder="Notas"
        value={formProveedor.notas}
        onChange={(e) => setFormProveedor({ ...formProveedor, notas: e.target.value })}
      />

      <button style={styles.bigButton} onClick={guardarProveedor}>
        {formProveedor.id ? 'Guardar cambios' : 'Agregar proveedor'}
      </button>

      <button style={styles.grayButton} onClick={limpiarProveedor}>
        Limpiar proveedor
      </button>

      <h3>Lista de proveedores</h3>

      {proveedores.map((p) => (
        <div key={p.id} style={styles.card}>
          <h3>{p.nombre}</h3>
          <p><b>Teléfono:</b> {p.telefono}</p>
          <p><b>Productos:</b> {p.productos}</p>
          <p><b>Tiempo de entrega:</b> {p.tiempo_entrega}</p>
          <p><b>Notas:</b> {p.notas}</p>

          <button style={styles.redButton} onClick={() => editarProveedor(p)}>
            Editar proveedor
          </button>

          <button
            style={styles.blackButton}
            onClick={() =>
              abrirWhatsAppProveedor(
                p.telefono,
                `Hola ${p.nombre}, quiero consultar disponibilidad y precios para resurtir productos de Fast Look.`
              )
            }
          >
            Enviar WhatsApp
          </button>
        </div>
      ))}
    </>
  )
}
