import type { FormProducto } from '@/types'

const numeroOpcional = (valor: string | number) => String(valor).trim() === '' ? null : Number(valor)

export const construirPayloadProductoAdmin = ({ form, codigo, tipo, editando, preferenciaImagenDisponible }: {
  form: FormProducto
  codigo: string
  tipo: string
  editando: boolean
  preferenciaImagenDisponible: boolean
}) => ({
  codigo,
  nombre: form.nombre.trim(),
  tipo,
  precio: Number(form.precio),
  costo: editando ? numeroOpcional(form.costo) : Number(form.costo || 0),
  stock: editando ? numeroOpcional(form.stock) : Number(form.stock || 0),
  stock_minimo: editando ? numeroOpcional(form.stock_minimo) : Number(form.stock_minimo || 5),
  ubicacion: form.ubicacion,
  proveedor: form.proveedor,
  imagen_url: form.imagen_url,
  imagen_thumbnail_url: editando ? (form.imagen_thumbnail_url ?? '') : (form.imagen_thumbnail_url || null),
  usar_imagen_principal: preferenciaImagenDisponible ? Boolean(form.usar_imagen_principal) : undefined,
})
