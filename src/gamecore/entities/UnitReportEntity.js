/**
 * Creates a report stored with the match while preserving model-provided fields.
 * @param {object & {unitId?:number,callsign?:string}} data
 */
export function createUnitReportEntity(data = {}) {
  return {
    ...data,
    unitId: data.unitId,
    callsign: String(data.callsign ?? ''),
  };
}
