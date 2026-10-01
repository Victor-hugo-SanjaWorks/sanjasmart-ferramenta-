/**
 * Helpers compartilhados das views: soma de valores e formatação BRL.
 * Evita duplicar lógica entre Linhas, Lista e Funil.
 */
import type { Contato } from '@/shared/types/crm'

export const PAGE_SIZE = 25

export function parseValor(raw?: string | number): number {
  if (raw === undefined || raw === null || raw === '') return 0
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0
  const str = String(raw).trim()
  if (!str) return 0

  const cleaned = str.replace(/[^\d,.-]/g, '')
  if (!cleaned) return 0

  if (cleaned.includes('.') && cleaned.includes(',')) {
    if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
      const n = Number(cleaned.replace(/\./g, '').replace(',', '.'))
      return Number.isFinite(n) ? n : 0
    } else {
      const n = Number(cleaned.replace(/,/g, ''))
      return Number.isFinite(n) ? n : 0
    }
  }

  if (cleaned.includes(',')) {
    const n = Number(cleaned.replace(',', '.'))
    return Number.isFinite(n) ? n : 0
  }

  const n = Number(cleaned)
  return Number.isFinite(n) ? n : 0
}

export function somaValores(contatos: Contato[]): number {
  return contatos.reduce((acc, c) => acc + parseValor(c.valorOportunidade), 0)
}

export function formatBRL(valor: number): string {
  return valor.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

/** Converte cor hex em rgba com alpha (ex.: header das etapas). */
export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h
  const n = Number.parseInt(full, 16)
  if (!Number.isFinite(n)) return `rgba(59, 130, 246, ${alpha})`
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
