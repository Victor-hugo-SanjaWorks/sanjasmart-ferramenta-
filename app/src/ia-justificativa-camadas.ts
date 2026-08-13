/**
 * Monta justificativa legível a partir das 5 camadas (estilo GMX).
 * Só sinais operacionais — sem CoT bruto para WhatsApp/UI pública.
 */
import type { SaidaCamada } from './agente-schema.js';

export type JustificativaCamadas = {
  titulo: string;
  resumo: string;
  itens: Array<{
    camada: number;
    foco: string;
    status: 'aprovar' | 'duvida' | 'problemas' | 'ok';
    justificativa: string;
    problemas: string[];
  }>;
  problemas: string[];
  origem?: string;
};

function truncar(s: string, n: number): string {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  return t.slice(0, n - 1) + '…';
}

export function montarJustificativaCamadas(
  camadas: SaidaCamada[],
  opts?: { origem?: string; problemas?: string[] },
): JustificativaCamadas {
  const itens = (camadas || []).map((c) => {
    let status: 'aprovar' | 'duvida' | 'problemas' | 'ok' = 'ok';
    if ((c.problemas || []).length) status = 'problemas';
    else if (c.duvida || c.interromper) status = 'duvida';
    else if (c.aprovar) status = 'aprovar';
    return {
      camada: Number(c.camada) || 0,
      foco: String(c.foco || ''),
      status,
      justificativa: truncar(c.justificativa || '', 280),
      problemas: (c.problemas || []).map((p) => truncar(p, 120)),
    };
  });
  const problemas = opts?.problemas?.length
    ? opts.problemas
    : itens.flatMap((i) => i.problemas);
  const ultima = itens[itens.length - 1];
  const resumo = ultima?.justificativa
    || (opts?.origem === 'treinador'
      ? 'Resposta do modo treinador após revisão em camadas'
      : 'Resposta do atendimento após revisão em camadas');
  return {
    titulo: 'Por que respondeu assim',
    resumo,
    itens,
    problemas,
    origem: opts?.origem,
  };
}
