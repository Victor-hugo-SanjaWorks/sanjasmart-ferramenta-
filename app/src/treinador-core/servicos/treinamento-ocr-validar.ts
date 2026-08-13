/**
 * Dry-parse do schema OCR antes de gravar/propor (F4.3).
 * Falha cedo com mensagem clara em vez de "JSON malformado" no apply.
 */
export type ResultadoOcrDry = { ok: true; docs: unknown[] } | { ok: false; erro: string };

export function validarSchemaOcrDry(texto: string): ResultadoOcrDry {
  const raw = String(texto || '').trim();
  if (!raw) return { ok: false, erro: 'Schema OCR vazio.' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, erro: 'Schema OCR nao e JSON valido. Corrija a estrutura antes de propor.' };
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, erro: 'Schema OCR deve ser um array de documentos.' };
  }
  for (let i = 0; i < parsed.length; i++) {
    const doc = parsed[i] as Record<string, unknown>;
    if (!doc || typeof doc !== 'object') {
      return { ok: false, erro: `Item ${i} do schema OCR nao e objeto.` };
    }
    if (!String(doc.id || '').trim()) {
      return { ok: false, erro: `Item ${i} do schema OCR sem id.` };
    }
  }
  return { ok: true, docs: parsed };
}
