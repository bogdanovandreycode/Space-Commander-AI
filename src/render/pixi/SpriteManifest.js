import scoutCryos from '../../assets/ships/ScoutPlayer.webp';
import scoutIgnis from '../../assets/ships/ScoutEnemy.webp';
import fighterCryos from '../../assets/ships/FighterPlayer.webp';
import fighterIgnis from '../../assets/ships/FighterEnemy.webp';
import corvetteCryos from '../../assets/ships/CorvettePlayer.webp';
import corvetteIgnis from '../../assets/ships/CorvetteEnemy.webp';
import frigateCryos from '../../assets/ships/FrigatePlayer.webp';
import frigateIgnis from '../../assets/ships/FrigateEnemy.webp';
import dreadnoughtCryos from '../../assets/ships/DreadnoughtPlayer.webp';
import dreadnoughtIgnis from '../../assets/ships/DreadnoughtEnemy.webp';
import forestPlanet from '../../assets/planets/forest_planet.webp';
import icePlanet from '../../assets/planets/ice_planet.webp';
import lavaPlanet from '../../assets/planets/lava_planet.webp';

export const SPRITE_MANIFEST = Object.freeze({
  ships: {
    cryos: {
      scout: scoutCryos,
      fighter: fighterCryos,
      corvette: corvetteCryos,
      frigate: frigateCryos,
      dreadnought: dreadnoughtCryos,
    },
    ignis: {
      scout: scoutIgnis,
      fighter: fighterIgnis,
      corvette: corvetteIgnis,
      frigate: frigateIgnis,
      dreadnought: dreadnoughtIgnis,
    },
  },
  planets: {
    neutral_forest: forestPlanet,
    cryos_colony: icePlanet,
    ignis_colony: lavaPlanet,
    cryos_homeworld: icePlanet,
    ignis_homeworld: lavaPlanet,
  },
});

export const ALL_SPRITE_URLS = Object.freeze([
  ...new Set([
    ...Object.values(SPRITE_MANIFEST.ships.cryos),
    ...Object.values(SPRITE_MANIFEST.ships.ignis),
    ...Object.values(SPRITE_MANIFEST.planets),
  ]),
]);

export function getShipSpriteUrl(faction, type) {
  return SPRITE_MANIFEST.ships[faction]?.[type] ?? null;
}
