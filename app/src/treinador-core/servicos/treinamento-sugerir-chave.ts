/**
 * Sugere a chave certa de mensagens_fluxo/orquestracao por similaridade.
 * Fecha F2.4: evita editar prompt_sistema quando o pedido e de uma mensagem.
 * Puro (sem I/O) — o catalogo vem de listarCatalogoChavesTreinamento.
 */

export type ItemCatalogoChave = {
  alvo: 'mensagens_fluxo' | 'orquestracao_texto';
  chave: string;
  texto: string;
};

export type SugestaoChave = {
  alvo: ItemCatalogoChave['alvo'];
  chave: string;
  score: number;
  motivo: string;
  preview: string;
};

function normalizar(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(s: string): string[] {
  return normalizar(s)
    .split(' ')
    .filter((t) => t.length >= 3);
}

function scoreItem(pedido: string, item: ItemCatalogoChave): { score: number; motivo: string } {
  const p = normalizar(pedido);
  const chaveN = normalizar(item.chave);
  const textoN = normalizar(item.texto).slice(0, 800);
  const toks = tokens(pedido);
  let score = 0;
  const motivos: string[] = [];

  if (chaveN && (p.includes(chaveN) || chaveN.includes(p.slice(0, 24)))) {
    score += 8;
    motivos.push('nome da chave no pedido');
  }

  // Sinonimos comuns → chaves tipicas
  const mapa: Array<[RegExp, RegExp, number, string]> = [
    [/saudac|boas\s*vind|ola\s+inicial|primeiro\s+contato/, /saudac|boas|welcome|ola|inicio/, 6, 'pedido de saudacao'],
    [/fora\s+de\s+hora|horario|expediente/, /hora|expediente|ausencia|offline/, 5, 'pedido de horario'],
    [/transfer|humano|atendente/, /transfer|humano|fila|atendente/, 5, 'pedido de transferencia'],
    [/despedida|encerrar|tchau/, /despedida|encerr|tchau|fim/, 5, 'pedido de despedida'],
    [/formato|whatsapp|negrito|emoji/, /format|instrucao|camada/, 4, 'pedido de formatacao'],
    [/tom|human|empat/, /camada|human/, 3, 'pedido de tom/camada humana'],
  ];
  for (const [pedRe, chaveRe, pts, label] of mapa) {
    if (pedRe.test(p) && (chaveRe.test(chaveN) || chaveRe.test(textoN))) {
      score += pts;
      motivos.push(label);
    }
  }

  let hits = 0;
  for (const t of toks) {
    if (chaveN.includes(t) || textoN.includes(t)) hits += 1;
  }
  if (hits > 0) {
    score += Math.min(hits, 5);
    motivos.push(`${hits} token(s) em comum`);
  }

  if (item.alvo === 'orquestracao_texto' && /orquestr|format|camada/.test(p)) {
    score += 2;
    motivos.push('alvo orquestracao');
  }
  if (item.alvo === 'mensagens_fluxo' && /mensagem|fluxo|saudac|boas/.test(p)) {
    score += 2;
    motivos.push('alvo mensagens_fluxo');
  }

  return {
    score,
    motivo: motivos.length ? motivos.slice(0, 3).join('; ') : 'baixa similaridade',
  };
}

/** Ranking das melhores chaves para o pedido (max `limite`). */
export function sugerirChavesPorPedido(
  pedido: string,
  catalogo: ItemCatalogoChave[],
  limite = 5,
): SugestaoChave[] {
  const lim = Math.max(1, Math.min(Number(limite) || 5, 12));
  const ranked = (catalogo || [])
    .map((item) => {
      const { score, motivo } = scoreItem(pedido, item);
      return {
        alvo: item.alvo,
        chave: item.chave,
        score,
        motivo,
        preview: String(item.texto || '').slice(0, 160),
      };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  return ranked.slice(0, lim);
}
