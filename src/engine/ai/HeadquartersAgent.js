import { HEADQUARTERS_PROMPT } from './prompts/prompts.js';
import { validateHeadquartersPlan } from './validation/validators.js';

export class HeadquartersAgent {
  constructor(client, settings, role = 'headquarters') {
    this.client = client;
    this.settings = settings;
    this.role = role;
  }

  async decide(payload, units, planets, credits) {
    const response = await this.client.chat({
      role: this.role,
      model: this.settings.headquartersDecisionModel,
      system: HEADQUARTERS_PROMPT,
      payload,
      think: this.settings.headquartersThink,
      temperature: this.settings.headquartersTemperature,
      numPredict: this.settings.headquartersNumPredict,
      contextSize: this.settings.headquartersContextSize,
    });
    return validateHeadquartersPlan(response.data, units, planets, credits);
  }
}
