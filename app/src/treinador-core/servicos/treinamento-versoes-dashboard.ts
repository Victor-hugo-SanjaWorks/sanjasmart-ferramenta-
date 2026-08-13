/**
 * Ponte do painel para listar/restaurar os ultimos 3 backups de prompt.
 * Seguranca de voltar atras na interface — nao trava o WhatsApp.
 * Relacionado: treinamento-versoes-store.ts, treinamento-versoes-retencao.ts.
 */
import {
  listarVersoes,
  obterVersaoPorId,
  restaurarVersao,
} from './treinamento-versoes-store.js';
import { MAX_VERSOES_BACKUP } from './treinamento-versoes-retencao.js';
import { chaveDashboard } from './treinamento-chave-dashboard.js';

export async function listarBackupsPromptDashboard(opts?: {
  alvo?: string;
  chave?: string | null;
  limite?: number;
}) {
  const alvo = String(opts?.alvo || 'prompt_sistema').trim() || 'prompt_sistema';
  const itens = await listarVersoes({
    alvo,
    chave: opts?.chave ?? null,
    limite: opts?.limite ?? MAX_VERSOES_BACKUP,
  });
  return {
    alvo,
    maxBackup: MAX_VERSOES_BACKUP,
    itens: itens.map((v) => ({
      id: v.id,
      criado_em: v.criado_em,
      origem: v.origem,
      chars: v.chars,
      preview: v.preview,
      criado_por: v.criado_por,
    })),
  };
}

export async function restaurarBackupPromptDashboard(opts: {
  id: number;
  autor?: string;
}) {
  const id = Number(opts.id);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error('Informe qual versao restaurar');
  }
  const existe = await obterVersaoPorId(id);
  if (!existe) throw new Error('Nao achei essa versao salva');
  const autor = chaveDashboard(opts.autor || 'painel');
  const r = await restaurarVersao(id, autor);
  return {
    ok: true,
    restaurada: r.versao.id,
    mensagem: 'Voltei o texto para a versao escolhida e guardei o estado atual por seguranca.',
  };
}
