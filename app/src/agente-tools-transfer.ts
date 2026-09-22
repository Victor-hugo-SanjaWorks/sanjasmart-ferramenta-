/**
 * Regras OpenAI-tools de transferência + texto injetado no system prompt.
 * Inclui regras editáveis por fila (quando transferir).
 */
import { NOMES_DEPARTAMENTOS } from './chatwoot-assignments.js';
import { listarFilasComMembros } from './fila-config.js';

export const TOOLS_TRANSFERENCIA = [
  {
    type: 'function' as const,
    function: {
      name: 'transferir_departamento',
      description: `Transfere a conversa para um DEPARTAMENTO e pausa a IA.
Departamentos: ${NOMES_DEPARTAMENTOS.join(', ')}.
Respeite as regras "quando transferir" de cada fila (injetadas no system).`,
      parameters: {
        type: 'object',
        properties: {
          motivo: { type: 'string', description: 'Motivo resumido.' },
          departamento: {
            type: 'string',
            description: `Um de: ${NOMES_DEPARTAMENTOS.join(', ')}.`,
          },
        },
        required: ['motivo', 'departamento'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'transferir_humano',
      description: 'Alias de transferir_departamento.',
      parameters: {
        type: 'object',
        properties: {
          motivo: { type: 'string' },
          departamento: { type: 'string' },
        },
        required: ['motivo', 'departamento'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'transferir_atendente',
      description:
        'Transfere para ATENDENTE específico e pausa a IA. Não diga o nome ao cliente.',
      parameters: {
        type: 'object',
        properties: {
          motivo: { type: 'string' },
          nome_ou_email: { type: 'string' },
          departamento: { type: 'string', description: 'Opcional: alinhar time.' },
        },
        required: ['motivo', 'nome_ou_email'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'pedir_ajuda_humana',
      description:
        'Notifica o time humano no WhatsApp. Use quando o cliente pediu humano, você não sabe responder, ou a resposta seria perigosa/fora do roteiro. Sempre chame também transferir_departamento na mesma rodada.',
      parameters: {
        type: 'object',
        properties: {
          motivo: { type: 'string', description: 'Por que precisa de um humano agora.' },
        },
        required: ['motivo'],
      },
    },
  },
];

export async function textoRegrasTransferencia(): Promise<string> {
  let blocosFila = '';
  try {
    const { filas } = await listarFilasComMembros();
    const comRegra = (filas || []).filter((f) => String(f.quando_transferir || '').trim());
    if (comRegra.length) {
      blocosFila =
        '\nREGRAS POR FILA (quando transferir):\n' +
        comRegra
          .map(
            (f) =>
              `- Fila "${f.name}": faça transferir_departamento departamento="${f.name}" quando: ${String(f.quando_transferir).trim()}`,
          )
          .join('\n');
    }
  } catch {
    /* filas indisponíveis — segue regra base */
  }

  return `REGRA DE TRANSFERÊNCIA (Sanja Smart):
- Venda / orçamento / visita / simulação / preço → transferir_departamento departamento="comercial".
- Pediu humano, você não sabe, ou o tema é perigoso/fora do prompt → pedir_ajuda_humana E transferir_departamento.
- Pessoa específica → transferir_atendente (não cite o nome ao cliente).
- Departamentos: ${NOMES_DEPARTAMENTOS.join(', ')}.
- Após a tool: frase curta; NÃO cite nomes; NÃO continue vendendo sozinha.
- NÃO calcule nada. NÃO invente valor, prazo extra ou o que cabe no terreno.
- Prefira fechar em no máximo 6 turnos, seguindo o roteiro do prompt.
${blocosFila}`;
}
