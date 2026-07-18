import { createApp } from './engine/app/createApp.js';
import { loadGameConfigs } from './gamecore/services/config/loadGameConfigs.js';
import loreEn from '../doc/lore/01_LORE_CANON_EN.md?raw';
import loreRu from '../doc/lore/02_LORE_CANON_RU.md?raw';
import './engine/styles/variables.css';
import './engine/styles/reset.css';
import './engine/styles/layout.css';
import './engine/styles/components.css';
import './engine/styles/responsive.css';

async function bootstrap() {
  const root = document.getElementById('app');
  try {
    const configs = loadGameConfigs();
    await createApp({
      root,
      configs,
      loreByLocale: { en: loreEn, ru: loreRu },
    });
  } catch (error) {
    root.innerHTML = '';
    const panel = document.createElement('main');
    panel.className = 'fatal-error';
    const title = document.createElement('h1');
    title.textContent = 'Space Commander: startup failed';
    const message = document.createElement('pre');
    message.textContent = error?.stack ?? error?.message ?? String(error);
    panel.append(title, message);
    root.append(panel);
    console.error(error);
  }
}

bootstrap();
