import { HEADQUARTERS_PROMPT } from './prompts/prompts.js';
import { validateHeadquartersPlan } from './validation/validators.js';

export class HeadquartersAgent {
  constructor(client, settings, role = 'headquarters') {
    this.client = client;
    this.settings = settings;
    this.role = role;
  }

  async decide(payload, units, planets, credits) {
    const think = Boolean(this.settings.headquartersThink);
    const response = await this.client.chat({
      role: this.role,
      model: this.settings.headquartersDecisionModel,
      system: HEADQUARTERS_PROMPT,
      payload,
      think,
      temperature: this.settings.headquartersTemperature,
      numPredict: think
        ? this.settings.headquartersNumPredict
        : Math.min(this.settings.headquartersNumPredict, 900),
      contextSize: think
        ? this.settings.headquartersContextSize
        : Math.min(this.settings.headquartersContextSize, 8192),
    });
    return validateHeadquartersPlan(response.data, units, planets, credits);
  }
}
