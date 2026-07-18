/**
 * Creates a report stored with the match while preserving model-provided fields.
 * @param {object & {unitId?:number,callsign?:string}} data
 */
export function createUnitReportEntity(data = {}) {
  return {
    ...data,
    unitId: data.unitId,
    callsign: String(data.callsign ?? ''),
    role: data.role ?? 'unit',
    title: String(data.title ?? ''),
    narrative: String(data.narrative ?? data.report ?? ''),
    rationale: String(data.rationale ?? ''),
  };
}
