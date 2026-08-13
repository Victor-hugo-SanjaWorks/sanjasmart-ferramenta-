/**
 * Proposta de overlay de aprendizado WhatsApp via tool do agente.
 * Separado de patch cirurgico — nao edita prompt_sistema diretamente.
 * Relacionado: politica-edicao.ts, treinamento-admin-direto.ts.
 */
import { decidirTipoEdicao } from './politica-edicao.js';
import { criarPropostaTreinamentoDireto } from '../servicos/treinamento-admin-direto.js';

type CtxAprendizado = {
  telefone: string;
  nomeAutor?: string;
  canal?: 'whatsapp' | 'dashboard';
};

export async function executarToolAprendizado(
  nome: string,
  args: Record<string, unknown>,
  ctx: CtxAprendizado,
  telefone: string,
): Promise<unknown | null> {
  if (nome !== 'propor_aprendizado') return null;

  const texto = String(args.texto || '').trim();
  if (texto.length < 10) {
    throw new Error('texto deve ter pelo menos 10 caracteres para propor aprendizado');
  }
  const tipo = decidirTipoEdicao(texto);
  if (tipo.tipo === 'patch_config') {
    return {
      recusado: true,
      motivo: 'Isso parece ajuste no texto principal, nao uma regra extra.',
      recomendacao: tipo.recomendacao,
    };
  }
  const proposta = await criarPropostaTreinamentoDireto({
    texto,
    telefoneAutor: telefone,
    nomeAutor: ctx.nomeAutor,
    autorAcao: telefone,
  });
  return {
    id: proposta.id,
    status: proposta.status,
    resumo: proposta.resumo_sugerido,
    instrucao: proposta.instrucao_sugerida,
    mensagem:
      'Preparei uma regra extra (ainda nao ativa). Se voce confirmar, eu ativo.',
  };
}
