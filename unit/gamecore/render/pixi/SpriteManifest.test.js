import { describe, expect, it } from 'vitest';
import { getShipSpriteUrl } from '../../../../src/gamecore/render/pixi/SpriteManifest.js';

describe('SpriteManifest', () => {
  it('maps textures by faction instead of human/enemy role', () => {
    expect(getShipSpriteUrl('cryos', 'fighter')).toContain('FighterPlayer');
    expect(getShipSpriteUrl('ignis', 'fighter')).toContain('FighterEnemy');
    expect(getShipSpriteUrl('cryos', 'fighter')).not.toBe(getShipSpriteUrl('ignis', 'fighter'));
  });
});
