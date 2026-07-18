import { AppController } from './AppController.js';
import { preloadGameAssets } from '../render/pixi/AssetLoader.js';
import { LocalSettingsStorage } from '../services/LocalSettingsStorage.js';
import { UiShell } from '../ui/UiShell.js';
import { detectLocale } from '../ui/i18n/index.js';

export async function createApp({ root, configs, loreByLocale }) {
  const storage = new LocalSettingsStorage();
  const settings = storage.loadSettings();
  const locale = detectLocale(settings.language);
  const ui = new UiShell(root, {
    locale,
    configs,
    lore: loreByLocale[locale],
  });
  await preloadGameAssets((progress) => ui.setLoading(progress));
  const controller = new AppController({ configs, ui, storage, settings, locale });
  controller.init();
  return controller;
}
