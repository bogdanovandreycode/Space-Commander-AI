/**
 * Creates a persistent artistic report generated after a validated decision.
 * @param {object} data
 */
export function createAiReportEntity(data = {}) {
  return {
    id: data.id ?? null,
    role: data.role ?? 'unit',
    faction: data.faction ?? null,
    round: data.round ?? 1,
    unitId: data.unitId ?? null,
    status: data.status ?? 'PARTIAL',
    title: String(data.title ?? ''),
    narrative: String(data.narrative ?? data.report ?? ''),
    rationale: String(data.rationale ?? ''),
  };
}
