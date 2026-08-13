/**
 * Schema JSON do pipeline geracao + critico adversarial.
 * Inclui duvida/interromper/confianca — se duvidar, a IA para.
 * Persistido em ia_auditoria_mensagem para prestacao de contas.
 */
export interface ChecagensCamada {
  respeitou_funil: boolean;
  usou_historico: boolean;
  preco_so_da_tool: boolean;
  foto_ok_para_mockup: boolean;
  tamanho_material_ok: boolean;
  alinhado_ouro_atendente: boolean;
}

export interface SaidaCamada {
  mensagem: string;
  justificativa: string;
  checagens: ChecagensCamada;
  aprovar: boolean;
  /** True = modelo nao tem certeza → interrupcao obrigatoria. */
  duvida: boolean;
  /** True = pedir humano / pausar IA agora. */
  interromper: boolean;
  /** 0..1 — abaixo de 0.7 dispara interrupcao. */
  confianca: number;
  problemas: string[];
  camada?: number;
  foco?: string;
}

export const CHECAGENS_PADRAO: ChecagensCamada = {
  respeitou_funil: true,
  usou_historico: true,
  preco_so_da_tool: true,
  foto_ok_para_mockup: true,
  tamanho_material_ok: true,
  alinhado_ouro_atendente: true,
};

export const CONFIANCA_MINIMA = 0.7;

export function parsearSaidaCamada(texto: string): SaidaCamada | null {
  if (!texto) return null;
  let raw = texto.trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) raw = fence[1].trim();
  const inicio = raw.indexOf('{');
  const fim = raw.lastIndexOf('}');
  if (inicio < 0 || fim <= inicio) return null;
  try {
    const obj = JSON.parse(raw.slice(inicio, fim + 1));
    const mensagem = String(obj.mensagem ?? '').trim();
    if (!mensagem) return null;
    const c = obj.checagens || {};
    let confianca = Number(obj.confianca);
    if (!Number.isFinite(confianca)) confianca = obj.aprovar === false ? 0.4 : 0.85;
    confianca = Math.max(0, Math.min(1, confianca));
    return {
      mensagem,
      justificativa: String(obj.justificativa ?? '').trim(),
      checagens: {
        respeitou_funil: c.respeitou_funil !== false,
        usou_historico: c.usou_historico !== false,
        preco_so_da_tool: c.preco_so_da_tool !== false,
        foto_ok_para_mockup: c.foto_ok_para_mockup !== false,
        tamanho_material_ok: c.tamanho_material_ok !== false,
        alinhado_ouro_atendente: c.alinhado_ouro_atendente !== false,
      },
      aprovar: obj.aprovar !== false,
      duvida: obj.duvida === true,
      interromper: obj.interromper === true,
      confianca,
      problemas: Array.isArray(obj.problemas)
        ? obj.problemas.map((p: unknown) => String(p))
        : [],
    };
  } catch {
    return null;
  }
}
