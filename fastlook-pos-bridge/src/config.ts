import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { BridgeConfig } from './types.js'

const entero = (valor: unknown, minimo: number, maximo: number, nombre: string) => {
  if (!Number.isInteger(valor) || Number(valor) < minimo || Number(valor) > maximo) throw new Error(`CONFIG_${nombre.toUpperCase()}_INVALIDA`)
  return Number(valor)
}

export function validarConfig(valor: unknown): BridgeConfig {
  if (!valor || typeof valor !== 'object') throw new Error('CONFIG_INVALIDA')
  const config = valor as Record<string, unknown>
  const printer = config.printer as Record<string, unknown>
  const drawer = config.drawer as Record<string, unknown>
  if (typeof config.token !== 'string' || config.token.length < 24) throw new Error('CONFIG_TOKEN_INVALIDO')
  if (!Array.isArray(config.allowedOrigins) || !config.allowedOrigins.length || config.allowedOrigins.some((origen) => typeof origen !== 'string' || !/^https?:\/\/[^/]+$/.test(origen))) throw new Error('CONFIG_ORIGINS_INVALIDOS')
  if (!printer || typeof printer.name !== 'string' || !printer.name.trim()) throw new Error('CONFIG_PRINTER_INVALIDA')
  if (printer.widthMm !== 58 || !['windows-1252', 'ascii'].includes(String(printer.encoding)) || printer.profile !== 'escpos-generic') throw new Error('CONFIG_PRINTER_PROFILE_INVALIDO')
  if (!drawer || typeof drawer.enabled !== 'boolean' || ![0, 1].includes(Number(drawer.pin))) throw new Error('CONFIG_DRAWER_INVALIDA')
  return {
    port: entero(config.port, 1024, 65535, 'port'),
    token: config.token,
    allowedOrigins: [...config.allowedOrigins] as string[],
    printer: { name: printer.name.trim(), widthMm: 58, charactersPerLine: entero(printer.charactersPerLine, 24, 48, 'charactersPerLine'), encoding: printer.encoding as BridgeConfig['printer']['encoding'], profile: 'escpos-generic' },
    drawer: { enabled: drawer.enabled, pin: Number(drawer.pin) as 0 | 1, pulseOnMs: entero(drawer.pulseOnMs, 20, 500, 'pulseOnMs'), pulseOffMs: entero(drawer.pulseOffMs, 20, 500, 'pulseOffMs') },
  }
}

export function cargarConfig() {
  const ruta = resolve(process.env.FASTLOOK_POS_CONFIG || 'config.json')
  return validarConfig(JSON.parse(readFileSync(ruta, 'utf8')))
}
