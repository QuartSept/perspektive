import { describe, expect, it } from 'vitest';
import { TutorialFlow } from './flow';
import { TUTORIAL_STEPS } from './steps';
import tr from '../../i18n/tr.json';
import en from '../../i18n/en.json';

describe('TutorialFlow', () => {
  it('olay yalnızca şu anki adımı ve bir kez tamamlar', () => {
    const flow = new TutorialFlow(TUTORIAL_STEPS);
    expect(flow.step.id).toBe('welcome');
    expect(flow.notify('pointMoved')).toBe(false); // hoş geldin adımı olay beklemez
    flow.next();
    expect(flow.waiting).toBe(true);
    expect(flow.notify('strokeAdded')).toBe(false);
    expect(flow.notify('pointMoved')).toBe(true);
    expect(flow.notify('pointMoved')).toBe(false);
    expect(flow.waiting).toBe(false);
  });

  it('ileri / geri; sınırlarda false; adım değişince tamamlanma sıfırlanır', () => {
    const flow = new TutorialFlow(TUTORIAL_STEPS);
    expect(flow.back()).toBe(false);
    flow.next();
    flow.notify('pointMoved');
    flow.next();
    expect(flow.completed).toBe(false);
    flow.back();
    expect(flow.step.id).toBe('points');
    expect(flow.completed).toBe(false);
    while (flow.next());
    expect(flow.isLast).toBe(true);
    expect(flow.step.id).toBe('done');
  });

  it('dokunmatikte imleç yaklaştırma beklenmez', () => {
    const flow = new TutorialFlow(TUTORIAL_STEPS, true);
    flow.index = TUTORIAL_STEPS.findIndex((s) => s.id === 'rays');
    expect(flow.waiting).toBe(false);
    expect(flow.notify('nearPoint')).toBe(false);
  });

  it('her adımın başlık ve metinleri iki dilde var (dokunmatik metni dahil)', () => {
    for (const step of TUTORIAL_STEPS) {
      for (const suffix of ['title', 'text', 'textTouch']) {
        const key = `tutorial.${step.id}.${suffix}`;
        expect(Object.keys(tr), key).toContain(key);
        expect(Object.keys(en), key).toContain(key);
      }
    }
  });
});
