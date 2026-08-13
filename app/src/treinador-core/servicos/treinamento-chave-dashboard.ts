/**
 * Gera chave estavel por autor do painel (AI Magic).
 * Isola patches pendentes entre admins sem colidir com telefones WhatsApp.
 * Prefixo 9900 + hash — usada no revert filtrado por autor.
 */
export function chaveDashboard(autor: string): string {
  const base = String(autor || 'painel');
  let hash = 0;
  for (let i = 0; i < base.length; i++) {
    hash = (hash * 31 + base.charCodeAt(i)) >>> 0;
  }
  return `9900${String(hash).padStart(10, '0')}`;
}
