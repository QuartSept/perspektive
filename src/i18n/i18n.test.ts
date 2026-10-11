import { describe, expect, it } from 'vitest';
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
});
