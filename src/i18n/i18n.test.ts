import { describe, expect, it } from 'vitest';
import html from '../../index.html?raw';
import en from './en.json';
import tr from './tr.json';

describe('çeviri dosyaları', () => {
  it('TR ve EN aynı anahtarlara sahip', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(tr).sort());
  });

  it('boş çeviri yok', () => {
    for (const dict of [tr, en]) {
      for (const [key, value] of Object.entries(dict)) {
        expect(value.trim(), key).not.toBe('');
      }
    }
  });

  it('yer tutucular iki dilde aynı', () => {
    const holes = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const key of Object.keys(tr) as (keyof typeof tr)[]) {
      expect(holes(en[key]), key).toEqual(holes(tr[key]));
    }
  });

  it('index.html’deki her data-i18n anahtarı çeviri dosyasında var', () => {
    const keys = [...html.matchAll(/data-i18n(?:-[a-z-]+)?="([^"]+)"/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(50);
    for (const key of keys) expect(Object.keys(tr), key).toContain(key);
  });
});
