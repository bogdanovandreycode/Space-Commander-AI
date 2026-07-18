import { Assets } from 'pixi.js';
import { ALL_SPRITE_URLS } from './SpriteManifest.js';

export async function preloadGameAssets(onProgress = () => {}) {
  let completed = 0;
  for (const url of ALL_SPRITE_URLS) {
    await Assets.load(url);
    completed += 1;
    onProgress(completed / ALL_SPRITE_URLS.length);
  }
}
