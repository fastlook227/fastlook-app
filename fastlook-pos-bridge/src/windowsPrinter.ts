import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const ejecutar = promisify(execFile)
const script = fileURLToPath(new URL('./windows-spool.ps1', import.meta.url))

export async function estadoImpresora(nombre: string) {
  if (process.platform !== 'win32') return { disponible: false, nombre, puerto: null, driver: null, motivo: 'WINDOWS_REQUERIDO' }
  try {
    const { stdout } = await ejecutar('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Action', 'status', '-PrinterName', nombre], { timeout: 4000, windowsHide: true })
    return JSON.parse(stdout.trim()) as { disponible: boolean; nombre: string; puerto: string | null; driver: string | null; motivo: string | null }
  } catch { return { disponible: false, nombre, puerto: null, driver: null, motivo: 'IMPRESORA_NO_DISPONIBLE' } }
}

export async function imprimirRaw(nombre: string, datos: Buffer) {
  if (process.platform !== 'win32') throw new Error('WINDOWS_REQUERIDO')
  const carpeta = await mkdtemp(join(tmpdir(), 'fastlook-pos-'))
  const archivo = join(carpeta, 'ticket.bin')
  try {
    await writeFile(archivo, datos, { flag: 'wx' })
    await ejecutar('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Action', 'print', '-PrinterName', nombre, '-DataFile', archivo], { timeout: 10000, windowsHide: true })
  } finally { await rm(carpeta, { recursive: true, force: true }) }
}
