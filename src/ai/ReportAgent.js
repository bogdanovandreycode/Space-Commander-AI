import { REPORT_PROMPT } from './prompts/prompts.js';
import { validateReport } from './validation/validators.js';

export class ReportAgent {
  constructor(client, settings) {
    this.client = client;
    this.settings = settings;
  }

  async create(payload) {
    const response = await this.client.chat({
      role: 'report',
      model: this.settings.reportModel,
      system: REPORT_PROMPT,
      payload,
      think: false,
      temperature: this.settings.reportTemperature,
      numPredict: this.settings.reportNumPredict,
      contextSize: this.settings.reportContextSize,
    });
    return validateReport(response.data);
  }
}
