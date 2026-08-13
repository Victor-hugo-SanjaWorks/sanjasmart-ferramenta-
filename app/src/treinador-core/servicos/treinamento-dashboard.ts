/**
 * Ponte do painel (AI Magic) para o MESMO cerebro agentico do WhatsApp.
 * Unifica motor/tabela/critica/multi-alvo/criar-do-zero: o painel deixa de ter
 * um segundo orquestrador e passa a chamar rodarAgenteTreinador (treinador-core).
 * Relacionado: agent/treinador-agent.ts, servicos/treinamento-config-patches.ts.
 */
import { rodarAgenteTreinador } from '../agent/treinador-agent.js';
import { inicializarChatComToolsTreinador } from '../ports/chat-com-tools-host.js';
import {
  aprovarPatchConfiguracao,
  cancelarPatchConfiguracao,
  obterPatchPendentePorId,
  obterUltimoPatchPendentePorTelefone,
  type PatchConfiguracaoPendente,
} from './treinamento-config-patches.js';
import { reverterUltimoPatchAprovado } from './treinamento-config-reverter.js';
import { chaveDashboard } from './treinamento-chave-dashboard.js';
import { checarPodeAplicarPatch } from './treinamento-confirmacao.js';
import { amigavelizarErro } from './treinamento-erros-amigaveis.js';
import { capturarCasoRuimParaTreino } from './treinamento-caso-ruim.js';
import { telefoneSeguro } from './treinamento-config-patch-utils.js';
import type { CasoRuimEntrada } from './treinamento-caso-ruim-texto.js';
import { diffHunks, type LinhaDiff } from './treinamento-diff-linhas.js';

export { chaveDashboard } from './treinamento-chave-dashboard.js';
export type { CasoRuimEntrada } from './treinamento-caso-ruim-texto.js';

function erroAmigavel(bruto: string): Error {
  const e = amigavelizarErro(bruto);
  return new Error(`${e.mensagem} Por que: ${e.porque} Como resolver: ${e.comoResolver}`);
}

export interface PatchDashboard {
  id: number;
  resumo: string;
  alvos: string[];
  operacao: string;
  trecho_alvo: string | null;
  texto_proposto: string;
  preview_antes: string;
  preview_depois: string;
  /** Diff por linha (F4.6) para o DiffView do AI Magic. */
  preview_diff: LinhaDiff[];
  critica_ok: boolean;
  criado_em: string;
}

export interface RespostaDashboard {
  mensagem: string;
  patch: PatchDashboard | null;
}

/** Quanto o patch mexe no prompt — serve para o humano decidir de olho aberto. */
export interface ImpactoPatch {
  chars_antes: number;
  chars_depois: number;
  secoes_antes: number;
  secoes_depois: number;
}

/**
 * Replace total do prompt exige um "sim" do humano de verdade.
 * Antes o painel mandava a confirmacao junto com o clique em Aprovar, entao a
 * trava nunca disparava e um patch podia trocar o prompt inteiro por 3 linhas.
 */
export class ConfirmacaoNecessariaError extends Error {
  readonly impacto: ImpactoPatch;

  constructor(mensagem: string, impacto: ImpactoPatch) {
    super(mensagem);
    this.name = 'ConfirmacaoNecessariaError';
    this.impacto = impacto;
  }
}

/** O preview pode vir no markup do editor (~abertura~) ou ja convertido p/ LLM (##). */
function contarSecoes(texto: string): number {
  const t = String(texto || '');
  const marcadores = (t.match(/~abertura da seção:/gi) || []).length;
  if (marcadores) return marcadores;
  return (t.match(/^#{1,3}\s+\S/gm) || []).length;
}

export function impactoNoPrompt(patch: PatchConfiguracaoPendente): ImpactoPatch {
  const prev =
    (patch.previews_json || []).find((p) => p.alvo === 'prompt_sistema') ||
    patch.previews_json?.[0];
  const antes = String(prev?.antes ?? patch.preview_antes ?? '');
  const depois = String(prev?.depois ?? patch.preview_depois ?? '');
  return {
    chars_antes: antes.length,
    chars_depois: depois.length,
    secoes_antes: contarSecoes(antes),
    secoes_depois: contarSecoes(depois),
  };
}

function mapearPatch(p: PatchConfiguracaoPendente | null): PatchDashboard | null {
  if (!p) return null;
  const alvos = Array.from(
    new Set(
      p.operacoes_json?.length
        ? p.operacoes_json.map((o) => `${o.alvo}${o.chave ? `.${o.chave}` : ''}`)
        : [`${p.alvo}${p.chave_alvo ? `.${p.chave_alvo}` : ''}`],
    ),
  );
  const critica = (p as PatchConfiguracaoPendente & { critica?: { aprovadoParaPerguntar?: boolean } }).critica;
  const prev0 = p.previews_json?.[0];
  const preview_diff = prev0
    ? diffHunks(String(prev0.antes || ''), String(prev0.depois || ''), 2)
    : diffHunks(p.preview_antes || '', p.preview_depois || '', 2);
  return {
    id: p.id,
    resumo: p.resumo,
    alvos,
    operacao: p.operacao,
    trecho_alvo: p.trecho_atual,
    texto_proposto: p.texto_proposto,
    preview_antes: p.preview_antes,
    preview_depois: p.preview_depois,
    preview_diff,
    critica_ok: critica?.aprovadoParaPerguntar !== false,
    criado_em: p.criado_em,
  };
}

/**
 * Conversa/edita via agente ReAct a partir do painel. Se o agente criar um patch
 * pendente nesta rodada, ele volta junto para o preview/diff do AI Magic.
 */
export async function conversarTreinadorDashboard(opts: {
  mensagem: string;
  historico?: Array<{ role: 'user' | 'assistant'; content: string }>;
  autor?: string;
  /** true = so analisa, nao chama tools de mutacao (checkbox AI Magic). */
  modoSoSugerir?: boolean;
}): Promise<RespostaDashboard> {
  const mensagem = String(opts.mensagem || '').trim();
  if (!mensagem) throw erroAmigavel('Mensagem obrigatoria.');

  inicializarChatComToolsTreinador();
  const chave = chaveDashboard(opts.autor || 'painel');

  const antes = await obterUltimoPatchPendentePorTelefone(chave);
  const idAntes = antes?.id ?? 0;

  const { resolverFilaNoTurno, finalizarFilaAposResposta } = await import(
    './treinamento-fila-turno.js'
  );
  const fila = await resolverFilaNoTurno(chave, mensagem);
  if (fila.abortar && fila.respostaPronta) {
    return { mensagem: fila.respostaPronta, patch: null };
  }

  const bruta = await rodarAgenteTreinador({
    telefone: chave,
    remoteJid: `${chave}@dashboard`,
    textoUsuario: fila.textoEfetivo,
    pushName: opts.autor,
    canal: 'dashboard',
    modoSoSugerir: opts.modoSoSugerir === true,
    historico: (opts.historico || []).map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content || ''),
    })),
  });
  const corpo = await finalizarFilaAposResposta(chave, fila.pedidoId, bruta);
  const mensagemAgente = fila.prefixo + corpo;

  // So devolve patch se foi criado/atualizado nesta rodada (id maior que o anterior).
  const depois = await obterUltimoPatchPendentePorTelefone(chave);
  const patch = depois && depois.id > idAntes ? depois : null;

  return { mensagem: mensagemAgente, patch: mapearPatch(patch) };
}

export async function aplicarPatchDashboard(
  id: number,
  autor?: string,
  opts?: { confirmacaoDupla?: boolean; textoConfirmacao?: string },
): Promise<void> {
  const chave = chaveDashboard(autor || 'admin');
  const patch = await obterPatchPendentePorId(id);
  if (!patch || patch.status !== 'pendente') {
    throw erroAmigavel('Essa sugestao ja nao esta aguardando confirmacao');
  }
  if (telefoneSeguro(patch.telefone_autor) !== telefoneSeguro(chave)) {
    throw erroAmigavel('Essa sugestao foi preparada por outra pessoa no painel');
  }
  const checagem = checarPodeAplicarPatch({
    patchTelefoneAutor: patch.telefone_autor,
    telefoneQuemAplica: chave,
    operacoes: patch.operacoes_json,
    previews: patch.previews_json,
    confirmacaoDupla: opts?.confirmacaoDupla === true,
    textoUsuario: opts?.textoConfirmacao || '',
  });
  if (!checagem.ok && checagem.exigeDupla) {
    throw new ConfirmacaoNecessariaError(
      checagem.erro || 'Isso troca o texto principal inteiro.',
      impactoNoPrompt(patch),
    );
  }
  if (!checagem.ok) throw erroAmigavel(checagem.erro || 'Nao foi possivel aplicar');
  await aprovarPatchConfiguracao(id, `painel:${autor || 'admin'}`);
}

export async function cancelarPatchDashboard(id: number, autor?: string): Promise<void> {
  await cancelarPatchConfiguracao(id, `painel:${autor || 'admin'}`);
}

export async function reverterUltimoPatchDashboard(
  autor?: string,
): Promise<{ id: number; resumo: string } | null> {
  // Filtra pelo telefone_autor do painel (chaveDashboard) — nunca o ultimo GLOBAL.
  const chave = chaveDashboard(autor || 'admin');
  return reverterUltimoPatchAprovado(`painel:${autor || 'admin'}`, chave);
}

/** F5.6: lista patches do autor do painel. */
export async function historicoAutorDashboard(autor?: string) {
  const { listarPatchesDoAutor } = await import('./treinamento-historico-autor.js');
  return listarPatchesDoAutor(chaveDashboard(autor || 'admin'));
}

/** F5.6: reverte o meu ultimo via historico-autor. */
export async function reverterMeuUltimoDashboard(autor?: string) {
  const { reverterMeuUltimo } = await import('./treinamento-historico-autor.js');
  return reverterMeuUltimo(chaveDashboard(autor || 'admin'));
}

/** 1 clique "IA errou aqui": gera patch pendente a partir do caso real. */
export async function capturarCasoRuimDashboard(
  caso: CasoRuimEntrada,
  autor?: string,
): Promise<RespostaDashboard> {
  const r = await capturarCasoRuimParaTreino({ caso, autor: autor || 'admin' });
  return {
    mensagem:
      `Entendi o problema e preparei uma sugestao de ajuste: ${r.patch.resumo}. ` +
      `Da uma olhada em como fica e, se gostar, eu publico.`,
    patch: mapearPatch(r.patch),
  };
}
