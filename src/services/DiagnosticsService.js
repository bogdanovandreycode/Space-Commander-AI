export class DiagnosticsService {
  #entries = [];

  constructor(enabled = false) {
    this.enabled = enabled;
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) this.#entries = [];
  }

  record(entry) {
    if (!this.enabled) return;
    this.#entries.push({ timestamp: new Date().toISOString(), ...structuredClone(entry) });
    this.#entries = this.#entries.slice(-100);
  }

  getEntries() {
    return structuredClone(this.#entries);
  }
}
