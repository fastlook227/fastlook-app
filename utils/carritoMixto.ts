import type { CarritoLinea, LineaPersonalizada, Producto } from '../types/index.ts'

export type NuevaLineaPersonalizada = Omit<LineaPersonalizada, 'tipoLinea' | 'cantidad'>

export const esLineaInventario = (linea: CarritoLinea): linea is Extract<CarritoLinea, { tipoLinea: 'inventario' }> => linea.tipoLinea === 'inventario'
export const esLineaPersonalizada = (linea: CarritoLinea): linea is LineaPersonalizada => linea.tipoLinea === 'personalizado'
export const crearLineaInventario = (producto: Producto, cantidad = 1): CarritoLinea => ({ tipoLinea: 'inventario', producto, cantidad })
export const obtenerCantidadLinea = (linea: CarritoLinea) => linea.cantidad
export const obtenerPrecioLinea = (linea: CarritoLinea) => esLineaInventario(linea) ? Number(linea.producto.precio) : linea.precioUnitarioMostrado
export const obtenerTotalLinea = (linea: CarritoLinea) => obtenerPrecioLinea(linea) * obtenerCantidadLinea(linea)
export const obtenerNombreLinea = (linea: CarritoLinea) => esLineaInventario(linea) ? linea.producto.nombre : linea.nombre
export const claveLinea = (linea: CarritoLinea) => esLineaInventario(linea) ? linea.producto.id : linea.idLocal
export const obtenerLineasInventario = (carrito: readonly CarritoLinea[]) => carrito.filter(esLineaInventario)
export const validarCheckoutInventario = (carrito: readonly CarritoLinea[]) => carrito.some(esLineaPersonalizada) ? { ok: false as const, mensaje: 'Los productos personalizados todavía no están habilitados para cobro.' } : { ok: true as const, lineas: obtenerLineasInventario(carrito) }
export const resumirCarritoMixto = (carrito: readonly CarritoLinea[]) => ({ unidades: carrito.reduce((s,l)=>s+l.cantidad,0), unidadesInventario: obtenerLineasInventario(carrito).reduce((s,l)=>s+l.cantidad,0), total: carrito.reduce((s,l)=>s+obtenerTotalLinea(l),0) })

const canonicalizar = (valor: unknown): unknown => Array.isArray(valor) ? valor.map(canonicalizar) : valor && typeof valor === 'object' ? Object.fromEntries(Object.entries(valor).sort(([a],[b])=>a.localeCompare(b)).map(([clave,contenido])=>[clave,canonicalizar(contenido)])) : valor
export const configuracionesEquivalentes = (a: Record<string,unknown>, b: Record<string,unknown>) => JSON.stringify(canonicalizar(a)) === JSON.stringify(canonicalizar(b))
export const agregarLineaPersonalizada = (carrito: readonly CarritoLinea[], nueva: NuevaLineaPersonalizada): CarritoLinea[] => { const existente=carrito.find((linea):linea is LineaPersonalizada=>esLineaPersonalizada(linea)&&linea.tipoPersonalizado===nueva.tipoPersonalizado&&configuracionesEquivalentes(linea.configuracion,nueva.configuracion)); return existente?carrito.map(linea=>linea===existente?{...linea,cantidad:linea.cantidad+1}:linea):[...carrito,{tipoLinea:'personalizado',cantidad:1,...nueva}] }
export const construirPayloadVenta = (carrito: readonly CarritoLinea[]) => ({ lineasNormales: carrito.filter(esLineaInventario).map(linea=>({producto_id:linea.producto.id,cantidad:linea.cantidad})), lineasPersonalizadas: carrito.filter(esLineaPersonalizada).map(linea=>({tipo_personalizado:linea.tipoPersonalizado,cantidad:linea.cantidad,configuracion:linea.configuracion})) })
export const seleccionarRpcVenta = (carrito: readonly CarritoLinea[]) => carrito.some(esLineaPersonalizada)?'procesar_venta_mixta' as const:'procesar_venta' as const
export const crearCadenaPersonalizada=(longitud:string,tipo:string,precio:number,idLocal:string):NuevaLineaPersonalizada=>({idLocal,tipoPersonalizado:'CADENA',nombre:`Cadena ${tipo} ${longitud}`,resumen:`${tipo} · ${longitud}`,configuracion:{longitud,tipo},precioUnitarioMostrado:precio})
export const crearEstrellaPersonalizada=(dientes:number,color:string,precio:number,idLocal:string):NuevaLineaPersonalizada=>({idLocal,tipoPersonalizado:'ESTRELLA',nombre:`Estrella ${color} ${dientes}D`,resumen:`${color} · ${dientes} dientes`,configuracion:{dientes,color},precioUnitarioMostrado:precio})
export const crearPinonPersonalizado=(dientes:number,precio:number,idLocal:string):NuevaLineaPersonalizada=>({idLocal,tipoPersonalizado:'PINON',nombre:`Piñón Negro ${dientes}D`,resumen:`Negro · ${dientes} dientes`,configuracion:{dientes,color:'Negro'},precioUnitarioMostrado:precio})
export const crearKitPersonalizado=(cadena:Record<string,unknown>,estrella:Record<string,unknown>,pinon:Record<string,unknown>,resumen:string,precio:number,idLocal:string):NuevaLineaPersonalizada=>({idLocal,tipoPersonalizado:'KIT_SPROCKET',nombre:'Kit de sprocket',resumen,configuracion:{cadena,estrella,pinon},precioUnitarioMostrado:precio})
export const crearServicioPersonalizado=(nivel:string,precioFinal:number,idLocal:string):NuevaLineaPersonalizada=>({idLocal,tipoPersonalizado:'SERVICIO_MOTO',nombre:`Servicio de moto - ${nivel}`,resumen:nivel,configuracion:{nivel,precio_final:precioFinal},precioUnitarioMostrado:precioFinal})
