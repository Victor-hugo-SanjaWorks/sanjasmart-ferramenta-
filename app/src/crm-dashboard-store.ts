/**
 * Leitura dos dados do funil principal para o Growth Command Center.
 */
import { pool } from './pg-pool.js';
import { obterPipelinePrincipal } from './crm-pipelines.js';
import {
  montarDados,
  type CampoCrm,
  type ColunaCrm,
  type ContatoCrm,
  type DadosDashboard,
  type MovimentoCrm,
  type TarefaCrm,
} from './crm-dashboard-modelo.js';

const CHAVE_META = 'dashboard_meta';

export async function obterDadosComerciais(): Promise<DadosDashboard> {
  const pipeline = await obterPipelinePrincipal(pool);
  const { rows: colunas } = await pool.query<ColunaCrm>(
    `SELECT id, titulo FROM crm_colunas WHERE pipeline_id = $1 ORDER BY ordem ASC`,
    [pipeline?.id ?? ''],
  );
  const ids = colunas.map((c) => c.id);
  const { rows: contatos } = await pool.query<ContatoCrm>(
    `SELECT id, nome, origem, valor_oportunidade, coluna_id, criado_em, atualizado_em
       FROM crm_contatos WHERE coluna_id = ANY($1)`,
    [ids],
  );
  const contatoIds = contatos.map((c) => c.id);
  const [movimentos, tarefas, campos, meta] = await Promise.all([
    pool.query<MovimentoCrm>(
      `SELECT contato_id, detalhe, em FROM crm_contato_timeline
        WHERE tipo = 'kanban' AND contato_id = ANY($1)`,
      [contatoIds],
    ),
    pool.query<TarefaCrm>(
      `SELECT contato_id, titulo, vencimento FROM crm_contato_tarefas
        WHERE status != 'concluida' AND contato_id = ANY($1)`,
      [contatoIds],
    ),
    pool.query<CampoCrm>(
      `SELECT contato_id, chave, valor FROM crm_contato_campos WHERE contato_id = ANY($1)`,
      [contatoIds],
    ),
    pool.query<{ valor: { valor?: number } }>(
      `SELECT valor FROM crm_config WHERE chave = $1`,
      [CHAVE_META],
    ),
  ]);

  return montarDados({
    colunas,
    contatos,
    movimentos: movimentos.rows,
    tarefas: tarefas.rows,
    campos: campos.rows,
    meta: Number(meta.rows[0]?.valor?.valor) || 0,
  });
}

export async function salvarMetaComercial(valor: number): Promise<void> {
  await pool.query(
    `INSERT INTO crm_config (chave, valor, atualizado_em) VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = NOW()`,
    [CHAVE_META, JSON.stringify({ valor })],
  );
}
