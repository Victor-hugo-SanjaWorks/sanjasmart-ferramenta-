/**
 * Carrega catalogo vivo de chaves editaveis (fluxo + orquestracao).
 * Alimenta sugerirChavesPorPedido sem misturar I/O no modulo puro.
 */
import { obterConfigMensagensFluxo } from '../host/config-mensagens-fluxo.js';
import { obterConfigOrquestracaoTexto } from '../host/config-orquestracao-texto.js';
import type { ItemCatalogoChave } from './treinamento-sugerir-chave.js';

function textoValor(valor: unknown): string {
  if (Array.isArray(valor)) {
    return valor.map((i) => String(i).trim()).filter(Boolean).join('\n');
  }
  return String(valor ?? '').trim();
}

export async function listarCatalogoChavesTreinamento(): Promise<ItemCatalogoChave[]> {
  const [mensagens, orquestracao] = await Promise.all([
    obterConfigMensagensFluxo(),
    obterConfigOrquestracaoTexto(),
  ]);
  const itens: ItemCatalogoChave[] = [];
  for (const [chave, valor] of Object.entries(mensagens || {})) {
    itens.push({ alvo: 'mensagens_fluxo', chave, texto: textoValor(valor) });
  }
  for (const chave of ['camadaHumana', 'instrucaoFormatacao'] as const) {
    itens.push({
      alvo: 'orquestracao_texto',
      chave,
      texto: textoValor((orquestracao as Record<string, unknown>)?.[chave]),
    });
  }
  return itens;
}
