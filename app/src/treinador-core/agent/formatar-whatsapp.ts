/**
 * Formata a resposta do agente treinador para leitura no WhatsApp.
 * Converte markdown de LLM (** ---, ###) para estilo WhatsApp, limita emoji e tamanho.
 * Usado por treinador-agent.ts na saida final de cada turno.
 */

const MAX_EMOJIS = 1;
const MAX_CHARS = 1600;

/** Casa emojis pictograficos (inclui variantes com modificadores). */
const REGEX_EMOJI = /(\p{Extended_Pictographic}(\uFE0F|\u200D\p{Extended_Pictographic})*)/gu;

function converterNegritoItalico(texto: string): string {
  return texto
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .replace(/__(.+?)__/g, '_$1_');
}

function removerHeadersESeparadores(texto: string): string {
  return texto
    .split('\n')
    .filter((linha) => !/^\s*([-*_]\s*){3,}$/.test(linha))
    .map((linha) => {
      const header = linha.match(/^\s*#{1,6}\s+(.*)$/);
      return header ? `*${header[1].trim()}*` : linha;
    })
    .join('\n');
}

function limitarEmojis(texto: string, maximo: number): string {
  let vistos = 0;
  return texto.replace(REGEX_EMOJI, (emoji) => {
    vistos += 1;
    return vistos <= maximo ? emoji : '';
  });
}

function compactarLinhasVazias(texto: string): string {
  return texto.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n');
}

function cortarComGentileza(texto: string, maximo: number): string {
  if (texto.length <= maximo) return texto;
  const janela = texto.slice(0, maximo);
  // corta no ultimo fim de frase/paragrafo para nao perder a pergunta final no meio
  const ultimoCorte = Math.max(
    janela.lastIndexOf('\n\n'),
    janela.lastIndexOf('. '),
    janela.lastIndexOf('? '),
    janela.lastIndexOf('! '),
  );
  const base = ultimoCorte > maximo * 0.5 ? janela.slice(0, ultimoCorte + 1) : janela;
  return `${base.trimEnd()}\n\n(Resumi para caber no WhatsApp — quer que eu detalhe alguma parte?)`;
}

/**
 * Normaliza texto de LLM para WhatsApp: *negrito*, sem headers/---, emoji controlado,
 * tamanho maximo com corte em fronteira de frase. Entrada vazia retorna vazia.
 */
export function formatarRespostaWhatsapp(texto: string): string {
  const bruto = String(texto || '').trim();
  if (!bruto) return '';
  let saida = converterNegritoItalico(bruto);
  saida = removerHeadersESeparadores(saida);
  saida = limitarEmojis(saida, MAX_EMOJIS);
  saida = compactarLinhasVazias(saida);
  saida = cortarComGentileza(saida.trim(), MAX_CHARS);
  return saida.trim();
}

export const LIMITES_FORMATACAO_WHATSAPP = {
  maxEmojis: MAX_EMOJIS,
  maxChars: MAX_CHARS,
} as const;
