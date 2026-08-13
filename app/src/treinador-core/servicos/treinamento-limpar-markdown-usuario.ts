/**
 * Limpa markdown de chat (** ### etc.) antes de gravar no alvo (F4.10 / C#34).
 * Motivo: admin cola texto formatado do WhatsApp e o prompt fica poluido.
 * Puro e testavel — sem I/O.
 */
export function limparMarkdownUsuario(texto: string): string {
  let t = String(texto || '');
  // blocos de codigo: preserva conteudo interno, remove fences
  t = t.replace(/```[\w]*\n?([\s\S]*?)```/g, '$1');
  t = t.replace(/^#{1,6}\s+/gm, '');
  t = t.replace(/\*\*([^*]+)\*\*/g, '$1');
  t = t.replace(/__([^_]+)__/g, '$1');
  t = t.replace(/(?<!\w)\*([^*\n]+)\*(?!\w)/g, '$1');
  t = t.replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, '$1');
  t = t.replace(/~~([^~]+)~~/g, '$1');
  t = t.replace(/`([^`]+)`/g, '$1');
  t = t.replace(/^>\s?/gm, '');
  t = t.replace(/^[-*]\s+/gm, '');
  t = t.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  t = t.replace(/[ \t]+\n/g, '\n');
  t = t.replace(/\n{3,}/g, '\n\n');
  return t.trim();
}
