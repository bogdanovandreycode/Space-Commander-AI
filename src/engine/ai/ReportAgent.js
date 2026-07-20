import { REPORT_PROMPTS } from './prompts/prompts.js';
import { REPORT_RESPONSE_SCHEMA } from './responseSchemas.js';
import { validateReport } from './validation/validators.js';

export class ReportAgent {
  constructor(client, settings, role) {
    this.client = client;
    this.settings = settings;
    this.role = role;
  }

  async create(payload) {
    const response = await this.client.chat({
      role: `${this.role}-report`,
      model: this.settings[`${this.role}ReportModel`],
      system: REPORT_PROMPTS[this.role],
      payload: { reportRole: this.role, ...payload },
      responseSchema: REPORT_RESPONSE_SCHEMA,
      think: Boolean(this.settings.reasoningEnabled),
      temperature: this.settings.reportTemperature,
      numPredict: this.settings.reportNumPredict,
      contextSize: this.settings.reportContextSize,
    });
    return validateReport(response.data, this.role);
  }
}
