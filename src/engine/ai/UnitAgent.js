import { UNIT_PROMPT } from './prompts/prompts.js';
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
      think: false,
      temperature: this.settings.unitTemperature,
      numPredict: this.settings.unitNumPredict,
      contextSize: this.settings.unitContextSize,
    });
    return validateUnitDecision(response.data, legalActions);
  }
}
