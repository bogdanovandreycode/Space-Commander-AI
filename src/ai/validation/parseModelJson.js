export function parseModelJson(content) {
  const trimmed = String(content ?? '').trim();
  if (!trimmed) throw new Error('EMPTY_MODEL_RESPONSE');
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    if (fenced) return JSON.parse(fenced.trim());
    const first = trimmed.indexOf('{');
    const last = trimmed.lastIndexOf('}');
    if (first !== -1 && last > first) return JSON.parse(trimmed.slice(first, last + 1));
    throw new Error('INVALID_MODEL_JSON');
  }
}
