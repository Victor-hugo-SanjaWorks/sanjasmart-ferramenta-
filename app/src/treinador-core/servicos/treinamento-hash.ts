/**
 * Hash estavel do texto de um alvo (lock otimista).
 * Puro — sem I/O — para comparar snapshot da proposta com o estado no apply.
 */
import { createHash } from 'node:crypto';

export function hashTextoAlvo(texto: string): string {
  return createHash('sha1').update(String(texto ?? '')).digest('hex');
}
