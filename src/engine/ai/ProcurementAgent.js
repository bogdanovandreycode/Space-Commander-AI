import { PROCUREMENT_PROMPT } from './prompts/prompts.js';
import { PROCUREMENT_RESPONSE_SCHEMA } from './responseSchemas.js';
import { validateProcurementDecision } from './validation/validators.js';

export class ProcurementAgent {
  constructor(client, settings) {
    this.client = client;
    this.settings = settings;
  }

  async decide(payload, legalPurchases, credits, directive) {
    const response = await this.client.chat({
      role: 'procurement',
      model: this.settings.procurementDecisionModel,
      system: PROCUREMENT_PROMPT,
      payload,
      responseSchema: PROCUREMENT_RESPONSE_SCHEMA,
      think: false,
      temperature: this.settings.procurementTemperature,
      numPredict: this.settings.procurementNumPredict,
      contextSize: this.settings.procurementContextSize,
    });
    return validateProcurementDecision(response.data, legalPurchases, credits, directive);
  }
}
