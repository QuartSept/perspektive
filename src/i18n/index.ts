import tr from './tr.json';
import en from './en.json';

export type Lang = 'tr' | 'en';
export type MessageKey = keyof typeof tr;

const dictionaries: Record<Lang, Record<MessageKey, string>> = { tr, en };

let current: Lang = detectLanguage();

function detectLanguage(): Lang {
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const l of langs) {
    const base = l.toLowerCase().split('-')[0];
    if (base === 'tr' || base === 'en') return base;
  }
  return 'en';
}

export function getLanguage(): Lang {
  return current;
}

export function setLanguage(lang: Lang): void {
  current = lang;
  document.documentElement.lang = lang;
  applyTranslations();
}

/** Anahtarın çevirisi; `{name}` yer tutucuları params ile doldurulur. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  let text = dictionaries[current][key] ?? dictionaries.en[key] ?? key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }
  return text;
}

/**
 * DOM'daki data-i18n* özniteliklerini çevirir:
 *  data-i18n            textContent
 *  data-i18n-title      title + aria-label
 *  data-i18n-aria-label aria-label
 */
export function applyTranslations(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n as MessageKey);
  });
  root.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((el) => {
    const text = t(el.dataset.i18nTitle as MessageKey);
    el.title = text;
    el.setAttribute('aria-label', text);
  });
  root.querySelectorAll<HTMLElement>('[data-i18n-aria-label]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel as MessageKey));
  });
}

document.documentElement.lang = current;
