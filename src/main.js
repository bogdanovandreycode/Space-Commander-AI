import { createApp } from './app/createApp.js';
import { loadGameConfigs } from './config/loadGameConfigs.js';
import loreEn from '../doc/lore/01_LORE_CANON_EN.md?raw';
import loreRu from '../doc/lore/02_LORE_CANON_RU.md?raw';
import './styles/variables.css';
import './styles/reset.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/responsive.css';

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
