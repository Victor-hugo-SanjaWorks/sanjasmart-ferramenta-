/**
 * Diff por linha (F4.6) para preview do painel e WhatsApp.
 * Motivo: admin precisa ver exatamente o que muda, nao so dois blocos cheios.
 * Algoritmo LCS classico; se texto enorme, cai no fallback linear.
 */
export type TipoLinhaDiff = 'igual' | 'removido' | 'adicionado' | 'pulo';

export type LinhaDiff = {
  tipo: TipoLinhaDiff;
  texto: string;
};

const LIMITE_CELULAS_LCS = 1_500_000;

function splitLinhas(texto: string): string[] {
  return String(texto ?? '').split('\n');
}

/** Diff completo linha a linha (LCS ou fallback). */
export function diffLinhas(antes: string, depois: string): LinhaDiff[] {
  const a = splitLinhas(antes);
  const b = splitLinhas(depois);
  if (a.length * b.length > LIMITE_CELULAS_LCS) {
    return diffLinear(a, b);
  }
  return diffLcs(a, b);
}

function diffLcs(a: string[], b: string[]): LinhaDiff[] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: LinhaDiff[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ tipo: 'igual', texto: a[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ tipo: 'removido', texto: a[i] });
      i += 1;
    } else {
      out.push({ tipo: 'adicionado', texto: b[j] });
      j += 1;
    }
  }
  while (i < n) {
    out.push({ tipo: 'removido', texto: a[i++] });
  }
  while (j < m) {
    out.push({ tipo: 'adicionado', texto: b[j++] });
  }
  return out;
}

/** Fallback O(n): alinhamento guloso por igualdade exata. */
function diffLinear(a: string[], b: string[]): LinhaDiff[] {
  const out: LinhaDiff[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      out.push({ tipo: 'igual', texto: a[i] });
      i += 1;
      j += 1;
      continue;
    }
    if (j < b.length && (i >= a.length || !a.slice(i).includes(b[j]))) {
      out.push({ tipo: 'adicionado', texto: b[j++] });
      continue;
    }
    if (i < a.length) {
      out.push({ tipo: 'removido', texto: a[i++] });
      continue;
    }
    out.push({ tipo: 'adicionado', texto: b[j++] });
  }
  return out;
}

/**
 * Mantem so hunks com mudanca + N linhas de contexto.
 * Compacta trechos iguais longos com tipo "pulo".
 */
export function diffHunks(
  antes: string,
  depois: string,
  contexto = 2,
): LinhaDiff[] {
  const full = diffLinhas(antes, depois);
  const mudou = full
    .map((l, idx) => (l.tipo === 'removido' || l.tipo === 'adicionado' ? idx : -1))
    .filter((i) => i >= 0);
  if (!mudou.length) {
    return [{ tipo: 'pulo', texto: '(sem mudanca de linha)' }];
  }

  const keep = new Set<number>();
  for (const idx of mudou) {
    for (let k = idx - contexto; k <= idx + contexto; k++) {
      if (k >= 0 && k < full.length) keep.add(k);
    }
  }

  const out: LinhaDiff[] = [];
  let i = 0;
  while (i < full.length) {
    if (keep.has(i)) {
      out.push(full[i]);
      i += 1;
      continue;
    }
    let j = i;
    while (j < full.length && !keep.has(j)) j += 1;
    out.push({ tipo: 'pulo', texto: `… ${j - i} linha(s) iguais omitidas …` });
    i = j;
  }
  return out;
}

/** Texto WhatsApp / log: prefixos - + e espaco. */
export function formatarDiffTexto(
  linhas: LinhaDiff[],
  maxLinhas = 48,
): string {
  const fatia = linhas.slice(0, maxLinhas);
  const body = fatia
    .map((l) => {
      if (l.tipo === 'removido') return `- ${l.texto}`;
      if (l.tipo === 'adicionado') return `+ ${l.texto}`;
      if (l.tipo === 'pulo') return l.texto;
      return `  ${l.texto}`;
    })
    .join('\n');
  if (linhas.length > maxLinhas) {
    return body + `\n… (+${linhas.length - maxLinhas} linhas)`;
  }
  return body;
}
