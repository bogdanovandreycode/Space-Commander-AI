import { UNIT_PROMPT } from './prompts/prompts.js';
import { UNIT_RESPONSE_SCHEMA } from './responseSchemas.js';
import { validateUnitDecision } from './validation/validators.js';

export class UnitAgent {
  constructor(client, settings) {
    this.client = client;
    this.settings = settings;
  }

  async decide(payload, legalActions) {
    const response = await this.client.chat({
      role: 'unit',
      model: this.settings.unitDecisionModel,
      system: UNIT_PROMPT,
      payload,
      responseSchema: UNIT_RESPONSE_SCHEMA,
      think: Boolean(this.settings.reasoningEnabled),
      temperature: this.settings.unitTemperature,
      numPredict: this.settings.unitNumPredict,
      contextSize: this.settings.unitContextSize,
    });
    return validateUnitDecision(response.data, legalActions);
  }
}
