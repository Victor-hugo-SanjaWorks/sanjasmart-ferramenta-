/**
 * Checklist de comportamento esperado por app (eval minima) — F3.5.
 * Reusa verificarComportamentoPatch com casos padrao ou customizados.
 * Nao aplica patch; so mede se o prompt responde como esperado.
 */
import {
  verificarComportamentoPatch,
  type CasoTesteComportamento,
  type RelatorioVerificacao,
} from './treinamento-verificar-comportamento.js';
import { CHECKLIST_PADRAO, type CasoChecklist } from './treinamento-checklist-padrao.js';

export type ResultadoChecklist = RelatorioVerificacao & {
  casosChecklist: Array<CasoChecklist & { passou: boolean }>;
  taxaPassou: number;
};

function avaliarCaso(c: CasoChecklist, r: RelatorioVerificacao['casos'][0]): boolean {
  if (c.id === 'tom_curto') {
    const palavras = r.respostaDepois.split(/\s+/).filter(Boolean).length;
    return palavras <= 80 && r.respostaDepois.length > 5;
  }
  if (c.id === 'fora_escopo') {
    const lower = r.respostaDepois.toLowerCase();
    return /nao posso|nao consigo|fora|nao tenho|desculpe|infelizmente/.test(lower);
  }
  if (c.esperadoContem) {
    return r.respostaDepois.toLowerCase().includes(c.esperadoContem.toLowerCase());
  }
  return r.respostaDepois.trim().length > 3;
}

/** Roda checklist contra um prompt (antes=depois se so testar prompt atual). */
export async function rodarChecklistEval(opts: {
  promptSistema: string;
  promptComparacao?: string;
  casos?: CasoChecklist[];
  pedido?: string;
}): Promise<ResultadoChecklist> {
  const casos = (opts.casos?.length ? opts.casos : CHECKLIST_PADRAO).slice(0, 5);
  const promptDepois = opts.promptComparacao ?? opts.promptSistema;
  const rel = await verificarComportamentoPatch({
    promptAntes: opts.promptSistema,
    promptDepois,
    pedido: opts.pedido || 'checklist eval',
    casos: casos as CasoTesteComportamento[],
  });

  const casosChecklist = casos.map((c, i) => ({
    ...c,
    passou: avaliarCaso(c, rel.casos[i] || rel.casos[0]),
  }));
  const passou = casosChecklist.filter((c) => c.passou).length;

  return {
    ...rel,
    casosChecklist,
    taxaPassou: casos.length ? passou / casos.length : 0,
    resumo: `Testei ${casos.length} situacoes: ${passou} ficaram boas. ${rel.resumo}`,
  };
}
