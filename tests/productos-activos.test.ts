import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node ejecuta TypeScript nativo y requiere la extensión explícita.
import { esRespuestaArchivadoExitosa, obtenerProductosActivos } from '../utils/productos.ts'

test('las vistas activas excluyen archivados sin borrar la colección histórica', () => {
  const productos = [{ id: 'activo', archivado: false }, { id: 'nulo', archivado: null }, { id: 'archivado', archivado: true }]
  assert.deepEqual(obtenerProductosActivos(productos).map((producto) => producto.id), ['activo', 'nulo'])
  assert.equal(productos.length, 3)
  assert.equal(productos[2].id, 'archivado')
})

test('PRODUCTO_ARCHIVADO y PRODUCTO_YA_ARCHIVADO son éxitos', () => {
  assert.equal(esRespuestaArchivadoExitosa({ ok: true, codigo: 'PRODUCTO_ARCHIVADO' }), true)
  assert.equal(esRespuestaArchivadoExitosa({ ok: true, codigo: 'PRODUCTO_YA_ARCHIVADO' }), true)
  assert.equal(esRespuestaArchivadoExitosa({ ok: false, codigo: 'PRODUCTO_INEXISTENTE' }), false)
})
