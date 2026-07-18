// shipSprites.ts

export enum ShipType {
    Scout = "scout",
    Fighter = "fighter",
    Corvette = "corvette",
    Frigate = "frigate",
    Dreadnought = "dreadnought",
}

export enum ShipSide {
    Player = "player",
    Enemy = "enemy",
}

export interface ShipSpriteConfig {
    type: ShipType;
    side: ShipSide;
    texture: string;
}

export const SHIP_SPRITES: ShipSpriteConfig[] = [
    {
        type: ShipType.Scout,
        side: ShipSide.Player,
        texture: "ScoutPlayer.webp",
    },
    {
        type: ShipType.Scout,
        side: ShipSide.Enemy,
        texture: "ScoutEnemy.webp",
    },

    {
        type: ShipType.Fighter,
        side: ShipSide.Player,
        texture: "FighterPlayer.webp",
    },
    {
        type: ShipType.Fighter,
        side: ShipSide.Enemy,
        texture: "FighterEnemy.webp",
    },

    {
        type: ShipType.Corvette,
        side: ShipSide.Player,
        texture: "CorvettePlayer.webp",
    },
    {
        type: ShipType.Corvette,
        side: ShipSide.Enemy,
        texture: "CorvetteEnemy.webp",
    },

    {
        type: ShipType.Frigate,
        side: ShipSide.Player,
        texture: "FrigatePlayer.webp",
    },
    {
        type: ShipType.Frigate,
        side: ShipSide.Enemy,
        texture: "FrigateEnemy.webp",
    },

    {
        type: ShipType.Dreadnought,
        side: ShipSide.Player,
        texture: "DreadnoughtPlayer.webp",
    },
    {
        type: ShipType.Dreadnought,
        side: ShipSide.Enemy,
        texture: "DreadnoughtEnemy.webp",
    },
];

// helper map
export const SHIP_TEXTURE_MAP = Object.fromEntries(
    SHIP_SPRITES.map((item) => [
        `${item.type}_${item.side}`,
        item.texture,
    ])
);

// usage:
// SHIP_TEXTURE_MAP["fighter_player"]
// => "FighterPlayer.webp"