/**
 * Nucleo puro de cirurgia de texto do treinador.
 * Conta ocorrencias, sugere trechos proximos e aplica replace/append/prepend
 * sem depender de banco — assim o agente falha com mensagem util, nao seco.
 */
import { textoPropostoJaExiste } from './treinamento-alvo-dedupe-append.js';

export type OperacaoTextoPatch = 'replace' | 'append' | 'prepend' | 'delete';

export interface PatchTextoLeve {
  operacao: OperacaoTextoPatch;
  trechoAtual?: string | null;
  textoProposto?: string | null;
}

export function contarOcorrencias(texto: string, trecho: string): number {
  if (!trecho) return 0;
  let n = 0;
  let from = 0;
  while (true) {
    const i = texto.indexOf(trecho, from);
    if (i < 0) break;
    n += 1;
    from = i + Math.max(trecho.length, 1);
  }
  return n;
}

/** Normaliza espacos p/ comparar trechos "quase iguais" do LLM. */
export function normalizarEspacos(s: string): string {
  return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Devolve ate N janelas do texto atual com maior sobreposicao de palavras
 * com o trecho pedido — usado quando o replace nao acha match exato.
 */
export function acharTrechosSimilares(
  texto: string,
  trecho: string,
  limite = 3,
): string[] {
  const atual = String(texto || '');
  const alvo = normalizarEspacos(trecho);
  if (!atual.trim() || !alvo) return [];

  const palavrasAlvo = new Set(alvo.split(' ').filter((p) => p.length > 2));
  if (!palavrasAlvo.size) return [];

  const janela = Math.max(trecho.length, 40);
  const passo = Math.max(20, Math.floor(janela / 2));
  const candidatos: Array<{ score: number; trecho: string }> = [];

  for (let i = 0; i < atual.length; i += passo) {
    const fatia = atual.slice(i, i + janela).trim();
    if (fatia.length < 12) continue;
    const norm = normalizarEspacos(fatia);
    const palavras = norm.split(' ').filter((p) => p.length > 2);
    let hits = 0;
    for (const p of palavras) {
      if (palavrasAlvo.has(p)) hits += 1;
    }
    const score = hits / palavrasAlvo.size;
    if (score >= 0.35) candidatos.push({ score, trecho: fatia.slice(0, 220) });
  }

  candidatos.sort((a, b) => b.score - a.score);
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const c of candidatos) {
    const key = normalizarEspacos(c.trecho).slice(0, 80);
    if (vistos.has(key)) continue;
    vistos.add(key);
    out.push(c.trecho);
    if (out.length >= limite) break;
  }
  return out;
}

function regexFlexivel(trecho: string): RegExp | null {
  const regexSource = trecho
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s+');
  if (!regexSource) return null;
  return new RegExp(regexSource);
}

/**
 * Aplica replace/append/prepend. Se o trecho se repete (>1), exige desambiguacao.
 * Se nao acha, inclui sugestoes de trechos proximos na mensagem de erro.
 */
export function aplicarTextoPatch(
  textoAtual: string,
  patch: PatchTextoLeve,
): string {
  const atual = String(textoAtual ?? '');
  const proposto = String(patch.textoProposto ?? '');
  // Nao trimar o trecho de match: espacos nas bordas importam na remocao.
  const trecho = String(patch.trechoAtual ?? '');
  const trechoOk = trecho.trim().length > 0;
  const eDelete =
    patch.operacao === 'delete' ||
    (patch.operacao === 'replace' && !proposto.trim() && trechoOk);

  if (eDelete) {
    if (!trechoOk) throw new Error('Para remover, informe o trecho a apagar');
    if (!atual.includes(trecho)) {
      const sugestoes = acharTrechosSimilares(atual, trecho.trim(), 3);
      const dica = sugestoes.length
        ? ` Trechos proximos: ${sugestoes.map((s) => JSON.stringify(s.slice(0, 100))).join(' | ')}`
        : '';
      throw new Error(`trechoAtual nao foi encontrado no alvo real.${dica}`);
    }
    const n = contarOcorrencias(atual, trecho);
    if (n > 1) {
      throw new Error(
        `O trecho a trocar aparece ${n} vezes no alvo — refine o trecho para ficar unico antes de aplicar`,
      );
    }
    return atual.replace(trecho, '');
  }

  const propTrim = proposto.trim();
  if (!propTrim) throw new Error('texto novo (textoProposto) e obrigatorio para aplicar o patch');

  if (patch.operacao === 'replace') {
    if (!atual.trim()) return propTrim;

    if (trechoOk && atual.includes(trecho)) {
      const n = contarOcorrencias(atual, trecho);
      if (n > 1) {
        throw new Error(
          `O trecho a trocar aparece ${n} vezes no alvo — refine o trecho para ficar unico antes de aplicar`,
        );
      }
      return atual.replace(trecho, propTrim);
    }

    if (trechoOk) {
      const flex = regexFlexivel(trecho.trim());
      if (flex) {
        const matches = atual.match(new RegExp(flex.source, 'g')) || [];
        if (matches.length > 1) {
          throw new Error(
            `O trecho a trocar (espacos flexiveis) aparece ${matches.length} vezes — refine o trecho`,
          );
        }
        if (matches.length === 1) return atual.replace(flex, propTrim);
      }
      const sugestoes = acharTrechosSimilares(atual, trecho.trim(), 3);
      const dica = sugestoes.length
        ? ` Trechos proximos: ${sugestoes.map((s) => JSON.stringify(s.slice(0, 100))).join(' | ')}`
        : '';
      throw new Error(`trechoAtual nao foi encontrado no alvo real.${dica}`);
    }

    return propTrim;
  }

  if (patch.operacao === 'prepend') {
    if (textoPropostoJaExiste(atual, propTrim)) {
      throw new Error(
        'Esse texto ja existe no alvo (dedupe). Use replace no trecho certo ou reformule — nao repita a regra.',
      );
    }
    return atual.trim() ? `${propTrim}\n\n${atual}` : propTrim;
  }

  if (textoPropostoJaExiste(atual, propTrim)) {
    throw new Error(
      'Esse texto ja existe no alvo (dedupe). Use replace no trecho certo ou reformule — nao repita a regra.',
    );
  }
  return atual.trim() ? `${atual}\n\n${propTrim}` : propTrim;
}
