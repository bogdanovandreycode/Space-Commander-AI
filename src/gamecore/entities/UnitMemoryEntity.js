/**
 * Creates the serializable memory attached to a ship.
 * @param {Partial<{callsign:string,reports:Array<object>,kills:number,missionsCompleted:number}>} [data]
 */
export function createUnitMemoryEntity(data = {}) {
  return {
    callsign: String(data.callsign ?? ''),
    reports: Array.isArray(data.reports) ? [...data.reports] : [],
    kills: Number.isInteger(data.kills) ? data.kills : 0,
    missionsCompleted: Number.isInteger(data.missionsCompleted) ? data.missionsCompleted : 0,
  };
}
