function hashString(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mix(value) {
  let result = value >>> 0;
  result ^= result >>> 16;
  result = Math.imul(result, 0x7feb352d);
  result ^= result >>> 15;
  result = Math.imul(result, 0x846ca68b);
  result ^= result >>> 16;
  return result >>> 0;
}

export function createNameSeed() {
  const crypto = globalThis.crypto;
  if (crypto?.getRandomValues) return crypto.getRandomValues(new Uint32Array(1))[0];
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

export function deriveLegacyNameSeed(state) {
  return hashString(`${state?.humanFaction ?? 'cryos'}:${state?.aiFaction ?? 'ignis'}:${state?.round ?? 1}`);
}

export function generateEntityName(configs, {
  kind,
  faction,
  type = '',
  id,
  seed,
  sequence = 0,
  usedNames = new Set(),
}) {
  const groups = kind === 'planet' ? configs.names.planetNames : configs.names.shipNames;
  const pool = groups[faction] ?? groups.grey ?? groups.cryos;
  const combinations = pool.prefixes.length * pool.suffixes.length;
  const baseHash = mix((seed >>> 0) ^ hashString(`${kind}:${faction}:${type}:${id}:${sequence}`));
  for (let offset = 0; offset < combinations; offset += 1) {
    const value = mix(baseHash + offset);
    const prefix = pool.prefixes[value % pool.prefixes.length];
    const suffix = pool.suffixes[Math.floor(value / pool.prefixes.length) % pool.suffixes.length];
    const candidate = `${prefix} ${suffix}`;
    if (!usedNames.has(candidate)) return candidate;
  }
  return `${pool.prefixes[baseHash % pool.prefixes.length]}-${id}`;
}
