import { en } from './en.js';
import { ru } from './ru.js';

export const dictionaries = { en, ru };

export function detectLocale(stored) {
  if (stored === 'ru' || stored === 'en') return stored;
  return navigator.language?.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}
