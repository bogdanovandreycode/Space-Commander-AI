export function parseModelJson(content) {
  const trimmed = String(content ?? '').trim();
  if (!trimmed) throw new Error('EMPTY_MODEL_RESPONSE');
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    if (fenced) {
      try {
        return JSON.parse(fenced.trim());
      } catch {
        throw new Error('INVALID_MODEL_JSON');
      }
    }
    const first = trimmed.indexOf('{');
    const last = trimmed.lastIndexOf('}');
    if (first !== -1 && last > first) {
      try {
        return JSON.parse(trimmed.slice(first, last + 1));
      } catch {
        throw new Error('INVALID_MODEL_JSON');
      }
    }
    throw new Error('INVALID_MODEL_JSON');
  }
}
