/**
 * Converte os registros do CRM no formato que o Growth Command Center consome.
 * Funções puras (sem banco). Nada aqui inventa dado: o que não existe fica vazio.
 */

export interface ColunaCrm {
  id: string;
  titulo: string;
}

export interface ContatoCrm {
  id: string;
  nome: string;
  origem: string;
  valor_oportunidade: string;
  coluna_id: string;
  criado_em: Date | string;
  atualizado_em: Date | string;
}

export interface MovimentoCrm {
  contato_id: string;
  detalhe: string;
  em: Date | string;
}

export interface TarefaCrm {
  contato_id: string;
  titulo: string;
  vencimento: string;
}

export interface CampoCrm {
  contato_id: string;
  chave: string;
  valor: string;
}

export interface LeadDashboard {
  id: string;
  name: string;
  value: number;
  /** Índice em `stages`; `stages.length` significa standby. */
  stage: number;
  channel: string;
  product: string;
  action: string;
  actionDate: number | null;
  created: number;
  history: { s: number; at: number }[];
  lost: boolean;
  lostAt: number | null;
  origem: string;
}

export interface DadosDashboard {
  /** Etapas do funil, em ordem. A última é a de fechamento. */
  stages: string[];
  standby: string | null;
  target: number;
  leads: LeadDashboard[];
}

const RE_STANDBY = /stand\s*-?\s*by|pausad/i;
const RE_PERDIDO = /perdid|descartad|cancelad/i;
const RE_MOVIMENTO = /^Para a coluna "(.*)"$/;

/** Aceita "R$ 1.250,50", "1.250", "1250.5" e "1250". */
export function lerValor(bruto: string): number {
  let s = String(bruto || '').replace(/[^\d.,]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/** Vencimento de tarefa: "AAAA-MM-DD" ou "DD/MM/AAAA". */
export function lerData(bruto: string): number | null {
  const s = String(bruto || '').trim();
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  const iso = br ? `${br[3]}-${br[2]}-${br[1]}` : s.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (!iso) return null;
  const t = new Date(`${iso}T12:00:00`).getTime();
  return Number.isFinite(t) ? t : null;
}

const chaveCampo = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');

const CAMPOS_PRODUTO = ['produto'];
const CAMPOS_LOCAL = ['cidadeuf', 'cidadeestado', 'cidade', 'localizacao', 'origemgeografica'];

export function montarDados(entrada: {
  colunas: ColunaCrm[];
  contatos: ContatoCrm[];
  movimentos: MovimentoCrm[];
  tarefas: TarefaCrm[];
  campos: CampoCrm[];
  meta: number;
}): DadosDashboard {
  const tipo = (titulo: string) =>
    RE_PERDIDO.test(titulo) ? 'perdido' : RE_STANDBY.test(titulo) ? 'standby' : 'funil';
  const funil = entrada.colunas.filter((c) => tipo(c.titulo) === 'funil');
  const standby = entrada.colunas.find((c) => tipo(c.titulo) === 'standby') ?? null;

  // posição de cada coluna: índice no funil, funil.length (standby) ou -1 (perdido)
  const posicaoPorId = new Map<string, number>();
  const posicaoPorTitulo = new Map<string, number>();
  for (const c of entrada.colunas) {
    const t = tipo(c.titulo);
    const pos = t === 'funil' ? funil.indexOf(c) : t === 'standby' ? funil.length : -1;
    posicaoPorId.set(c.id, pos);
    posicaoPorTitulo.set(c.titulo, pos);
  }

  const agrupar = <T extends { contato_id: string }>(lista: T[]) => {
    const m = new Map<string, T[]>();
    for (const item of lista) {
      const atual = m.get(item.contato_id);
      if (atual) atual.push(item);
      else m.set(item.contato_id, [item]);
    }
    return m;
  };
  const movimentos = agrupar(entrada.movimentos);
  const tarefas = agrupar(entrada.tarefas);
  const campos = agrupar(entrada.campos);

  const leads: LeadDashboard[] = [];
  for (const c of entrada.contatos) {
    const atual = posicaoPorId.get(c.coluna_id);
    if (atual === undefined) continue; // outro funil

    const criado = new Date(c.criado_em).getTime();
    const passos: { s: number; at: number }[] = [];
    const ordenados = (movimentos.get(c.id) ?? [])
      .map((m) => ({
        s: posicaoPorTitulo.get(m.detalhe.match(RE_MOVIMENTO)?.[1] ?? ''),
        at: Math.max(criado, new Date(m.em).getTime()),
      }))
      .filter((m): m is { s: number; at: number } => m.s !== undefined)
      .sort((a, b) => a.at - b.at);

    // Com movimentos registrados, o contato entrou pela 1ª etapa; sem eles, nasceu onde está.
    passos.push({ s: ordenados.length ? 0 : atual, at: criado }, ...ordenados);
    if (passos[passos.length - 1].s !== atual) {
      passos.push({ s: atual, at: Math.max(criado, new Date(c.atualizado_em).getTime()) });
    }

    const perdido = atual === -1;
    const history = passos.filter((p) => p.s !== -1);
    if (!history.length) history.push({ s: 0, at: criado });
    const lostAt = perdido ? passos[passos.length - 1].at : null;

    const campo = (nomes: string[]) => {
      const lista = campos.get(c.id) ?? [];
      for (const nome of nomes) {
        const achado = lista.find((x) => chaveCampo(x.chave) === nome && x.valor.trim());
        if (achado) return achado.valor.trim();
      }
      return '';
    };

    const proxima = (tarefas.get(c.id) ?? [])
      .map((t) => ({ titulo: t.titulo, data: lerData(t.vencimento) }))
      .sort((a, b) => (a.data ?? Infinity) - (b.data ?? Infinity))[0];

    const origem = String(c.origem || '').trim();
    leads.push({
      id: c.id,
      name: c.nome,
      value: lerValor(c.valor_oportunidade),
      stage: perdido ? history[history.length - 1].s : atual,
      channel: /^chatwoot$/i.test(origem) ? 'Atendimento' : origem || 'Não informado',
      product: campo(CAMPOS_PRODUTO),
      action: proxima?.titulo ?? '',
      actionDate: proxima?.data ?? null,
      created: criado,
      history,
      lost: perdido,
      lostAt,
      origem: campo(CAMPOS_LOCAL),
    });
  }

  return {
    stages: funil.map((c) => c.titulo),
    standby: standby?.titulo ?? null,
    target: entrada.meta,
    leads,
  };
}
