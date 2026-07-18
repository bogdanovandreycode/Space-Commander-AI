/**
 * Creates a transaction result while preserving action-specific details.
 * @param {import('./types.js').ActionResult & Record<string, unknown>} data
 */
export function createActionResultEntity(data) {
  const {
    executed = false,
    actionType = 'UNKNOWN',
    reasonCode = 'UNKNOWN',
    ...details
  } = data ?? {};
  return {
    executed: Boolean(executed),
    actionType,
    ...details,
    reasonCode,
  };
}
