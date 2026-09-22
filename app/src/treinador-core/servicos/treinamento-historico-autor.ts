/**
 * Historico de patches por autor + reverter o meu ultimo (F5.6).
 * Lista propostas/aprovacoes do telefone; amarra reverterUltimoPatchAprovado.
 */
import pg from 'pg';
import { config } from '../../config.js';
import { telefoneSeguro } from './treinamento-config-patch-utils.js';
import { garantirTabelaPatchesPendentes } from './treinamento-config-schema.js';
import {
  normalizarPatchPendenteExport,
  type PatchConfiguracaoPendente,
} from './treinamento-config-patches.js';
import { reverterUltimoPatchAprovado } from './treinamento-config-reverter.js';
import { pool } from '../../pg-pool.js';


export type PatchResumoAutor = {
  id: number;
  status: string;
  resumo: string;
  alvo: string;
  criado_em: string;
  atualizado_em: string;
};

export async function listarPatchesDoAutor(
  telefone: string,
  limite = 20,
): Promise<PatchResumoAutor[]> {
  await garantirTabelaPatchesPendentes(pool);
  const tel = telefoneSeguro(telefone);
  const res = await pool.query<PatchConfiguracaoPendente>(
    `SELECT * FROM whatsapp_config_patches_pendentes
     WHERE telefone_autor = $1
     ORDER BY criado_em DESC, id DESC
     LIMIT $2`,
    [tel, Math.min(Math.max(limite, 1), 50)],
  );
  return res.rows.map((row) => {
    const p = normalizarPatchPendenteExport(row);
    return {
      id: p.id,
      status: p.status,
      resumo: p.resumo,
      alvo: p.alvo,
      criado_em: p.criado_em,
      atualizado_em: p.atualizado_em,
    };
  });
}

/** Reverte a ultima mudanca aprovada deste telefone (so o proprio autor). */
export async function reverterMeuUltimo(
  telefone: string,
): Promise<{ ok: boolean; id?: number; resumo?: string; mensagem: string }> {
  const revertido = await reverterUltimoPatchAprovado(telefone, telefone);
  if (!revertido) {
    return {
      ok: false,
      mensagem: 'Nao encontrei nenhuma mudanca recente sua para desfazer.',
    };
  }
  return {
    ok: true,
    id: revertido.id,
    resumo: revertido.resumo,
    mensagem: `Voltei sua ultima mudanca: ${revertido.resumo}`,
  };
}
