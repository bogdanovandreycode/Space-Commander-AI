import { DIRECTION_VECTORS } from '../config/constants.js';

export function insideMap(x, y, map) {
  return Number.isInteger(x) && Number.isInteger(y)
    && x >= 0 && y >= 0 && x < map.width && y < map.height;
}

export function directionBetween(from, to) {
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);
  return Object.entries(DIRECTION_VECTORS)
    .find(([, vector]) => vector[0] === dx && vector[1] === dy)?.[0] ?? null;
}

export function rayDistance(from, to) {
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  if (dx !== 0 && dy !== 0 && dx !== dy) return null;
  return Math.max(dx, dy);
}

export function chebyshevDistance(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export function manhattanDistance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}
