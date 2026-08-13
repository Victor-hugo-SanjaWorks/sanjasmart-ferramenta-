/**
 * Cache TTL do catalogo de chaves editaveis (F5.5).
 * Evita I/O repetido em sugerir_chave / buscar_contexto dentro de 60s.
 */
import { listarCatalogoChavesTreinamento } from './treinamento-sugerir-chave-catalogo.js';
import type { ItemCatalogoChave } from './treinamento-sugerir-chave.js';

export type { ItemCatalogoChave };

const TTL_MS = Number(process.env.TREINADOR_CATALOGO_TTL_MS || 60_000);

let cache: { itens: ItemCatalogoChave[]; expira: number } | null = null;

export async function obterCatalogoComCache(
  forcar = false,
): Promise<ItemCatalogoChave[]> {
  const agora = Date.now();
  if (!forcar && cache && cache.expira > agora) {
    return cache.itens;
  }
  const itens = await listarCatalogoChavesTreinamento();
  cache = { itens, expira: agora + TTL_MS };
  return itens;
}

export function invalidarCacheCatalogo(): void {
  cache = null;
}
