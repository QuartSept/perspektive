import type { TutorialEvent, TutorialStep } from './steps';

/**
 * Öğretici akışı (DOM'suz): hangi adımdayız, adım tamamlandı mı, ileri / geri.
 * Tamamlanan adım hemen geçilmez; arayüz kısa bir onay gösterip `next` çağırır.
 */
export class TutorialFlow {
  index = 0;
  /** Şu anki adımın koşulu sağlandı. */
  completed = false;

  constructor(
    readonly steps: readonly TutorialStep[],
    /** Dokunmatik cihaz: yalnızca fareyle yapılabilen koşullar beklenmez. */
    private readonly touch = false,
  ) {}

  get step(): TutorialStep {
    return this.steps[this.index];
  }

  get isFirst(): boolean {
    return this.index === 0;
  }

  get isLast(): boolean {
    return this.index === this.steps.length - 1;
  }

  /** Adım bir olay bekliyor mu (beklemiyorsa "İleri" düğmesi öne çıkar). */
  get waiting(): boolean {
    const step = this.step;
    if (!step.until || this.completed) return false;
    return !(step.untilMouseOnly && this.touch);
  }

  /** Olay şu anki adımı tamamlıyorsa true (bir kez). */
  notify(event: TutorialEvent): boolean {
    if (this.completed || this.step.until !== event) return false;
    if (this.step.untilMouseOnly && this.touch) return false;
    this.completed = true;
    return true;
  }

  /** Sonraki adıma geçer; son adımdaysa false. */
  next(): boolean {
    if (this.isLast) return false;
    this.index++;
    this.completed = false;
    return true;
  }

  back(): boolean {
    if (this.isFirst) return false;
    this.index--;
    this.completed = false;
    return true;
  }
}
