/**
 * Overlays de aprendizado WhatsApp: regras comportamentais sem editar prompt.
 * CRUD de aprendizados ativos, pendencias e bloco injetado no system prompt.
 * Relacionado: treinamento-admin-direto.ts, historico-configuracao.ts.
 */
import { normalizarTelefone } from '../../util/telefone.js';
import { registrarHistoricoConfiguracao } from '../host/historico-configuracao.js';
import {
  inicializarTreinamentoWhatsapp,
  paraBoolean,
  poolWhatsappTreinador,
} from './treinamento-whatsapp-db.js';

export interface AprendizadoWhatsapp {
  id: number;
  telefone_autor: string;
  nome_autor: string | null;
  instrucao: string;
  resumo: string | null;
  origem_texto: string;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}

export interface PropostaAprendizadoWhatsapp {
  id: number;
  telefone_autor: string;
  nome_autor: string | null;
  instrucao_sugerida: string;
  resumo_sugerido: string | null;
  origem_texto: string;
  status: 'pendente' | 'aprovado' | 'cancelado';
  confirmado_em: string | null;
  confirmado_por: string | null;
  criado_em: string;
  atualizado_em: string;
}

export async function listarAprendizadosWhatsapp(): Promise<AprendizadoWhatsapp[]> {
  await inicializarTreinamentoWhatsapp();
  const res = await poolWhatsappTreinador.query<AprendizadoWhatsapp>(
    'SELECT * FROM whatsapp_aprendizados ORDER BY ativo DESC, criado_em DESC LIMIT 80',
  );
  return res.rows.map((row) => ({ ...row, ativo: paraBoolean(row.ativo) }));
}

export async function listarPendenciasAprendizadoWhatsapp(): Promise<PropostaAprendizadoWhatsapp[]> {
  await inicializarTreinamentoWhatsapp();
  const res = await poolWhatsappTreinador.query<PropostaAprendizadoWhatsapp>(
    'SELECT * FROM whatsapp_aprendizados_pendentes ORDER BY criado_em DESC LIMIT 80',
  );
  return res.rows as PropostaAprendizadoWhatsapp[];
}

export async function excluirAprendizadoWhatsapp(id: number): Promise<void> {
  await inicializarTreinamentoWhatsapp();
  const antes = await obterBlocoTreinamentoWhatsapp();
  await poolWhatsappTreinador.query('DELETE FROM whatsapp_aprendizados WHERE id = $1', [id]);
  const depois = await obterBlocoTreinamentoWhatsapp();
  await registrarHistoricoConfiguracao({
    chave: 'whatsapp_aprendizados',
    origem: 'api_admin',
    antes,
    depois,
  });
}

async function obterPropostaPendentePorId(id: number): Promise<PropostaAprendizadoWhatsapp | null> {
  await inicializarTreinamentoWhatsapp();
  const res = await poolWhatsappTreinador.query<PropostaAprendizadoWhatsapp>(
    'SELECT * FROM whatsapp_aprendizados_pendentes WHERE id = $1 LIMIT 1',
    [id],
  );
  return res.rows[0] ?? null;
}

async function aplicarPropostaAprendizado(
  proposta: PropostaAprendizadoWhatsapp,
  confirmadoPor: string,
): Promise<AprendizadoWhatsapp> {
  const antes = await obterBlocoTreinamentoWhatsapp();
  const insert = await poolWhatsappTreinador.query<AprendizadoWhatsapp>(
    `INSERT INTO whatsapp_aprendizados (
      telefone_autor, nome_autor, instrucao, resumo, origem_texto, ativo, atualizado_em
    ) VALUES ($1, $2, $3, $4, $5, TRUE, NOW())
    RETURNING *`,
    [
      proposta.telefone_autor,
      proposta.nome_autor,
      proposta.instrucao_sugerida,
      proposta.resumo_sugerido,
      proposta.origem_texto,
    ],
  );
  await poolWhatsappTreinador.query(
    `UPDATE whatsapp_aprendizados_pendentes
     SET status = 'aprovado', confirmado_em = NOW(), confirmado_por = $2, atualizado_em = NOW()
     WHERE id = $1`,
    [proposta.id, confirmadoPor],
  );
  const depois = await obterBlocoTreinamentoWhatsapp();
  await registrarHistoricoConfiguracao({
    chave: 'whatsapp_aprendizados',
    origem: `whatsapp_treinador_confirmado:${confirmadoPor}`,
    antes,
    depois,
  });
  return { ...insert.rows[0], ativo: paraBoolean(insert.rows[0].ativo) };
}

export async function aprovarPendenciaAprendizadoWhatsapp(
  id: number,
  confirmadoPor: string,
): Promise<AprendizadoWhatsapp> {
  const proposta = await obterPropostaPendentePorId(id);
  if (!proposta) throw new Error('Proposta pendente nao encontrada');
  if (proposta.status !== 'pendente') throw new Error('A proposta ja foi encerrada');
  return aplicarPropostaAprendizado(proposta, confirmadoPor);
}

export async function cancelarPendenciaAprendizadoWhatsapp(
  id: number,
  confirmadoPor: string,
): Promise<void> {
  const proposta = await obterPropostaPendentePorId(id);
  if (!proposta) throw new Error('Proposta pendente nao encontrada');
  if (proposta.status !== 'pendente') throw new Error('A proposta ja foi encerrada');
  await poolWhatsappTreinador.query(
    `UPDATE whatsapp_aprendizados_pendentes
     SET status = 'cancelado', confirmado_em = NOW(), confirmado_por = $2, atualizado_em = NOW()
     WHERE id = $1`,
    [id, confirmadoPor],
  );
}

export async function obterBlocoTreinamentoWhatsapp(): Promise<string> {
  await inicializarTreinamentoWhatsapp();
  const res = await poolWhatsappTreinador.query<AprendizadoWhatsapp>(
    `SELECT * FROM whatsapp_aprendizados
     WHERE ativo = TRUE
     ORDER BY criado_em ASC, id ASC
     LIMIT 60`,
  );
  const linhas = res.rows
    .map((row, idx) => `- Regra ${idx + 1}: ${row.instrucao}`)
    .join('\n');
  return linhas
    ? `=== TREINAMENTO VIA WHATSAPP AUTORIZADO ===\nAs regras abaixo foram ensinadas por telefones autorizados e alteram o comportamento da IA com efeito imediato:\n${linhas}`
    : '';
}
