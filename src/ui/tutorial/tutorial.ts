import { t, type MessageKey } from '../../i18n';
import { TutorialFlow } from './flow';
import { TUTORIAL_STEPS, type TutorialEvent } from './steps';

/** Tamamlanan adımın onayı bu kadar görünür, sonra sıradaki adıma geçilir. */
const ADVANCE_MS = 1100;
/** Vurgu halkasının hedefin çevresindeki payı, CSS piksel. */
const RING_PAD = 4;

export interface TutorialHandlers {
  /**
   * Tur bitti (son adımda ya da "Turu bitir" ile). `clearPractice`: son adımda
   * "Alıştırmayı temizle" seçildi.
   */
  onFinish(clearPractice: boolean): void;
  onToggleLanguage(): void;
}

/**
 * Etkileşimli ilk açılış turu: altta adım kartı, hedef düğmenin çevresinde
 * vurgu halkası. Adım, istenen iş yapılınca (`notify`) kısa bir onayla
 * kendiliğinden geçer; her adımda Geri, Atla ve Turu bitir var.
 */
export class Tutorial {
  private flow: TutorialFlow | null = null;
  private readonly card: HTMLElement;
  private readonly ring: HTMLElement;
  private advanceTimer = 0;
  private ringTimer = 0;
  /** Tur kullanıcının çiziminin yedeği alınarak boş sayfada yürüyor. */
  sandbox = false;

  constructor(
    parent: HTMLElement,
    private readonly handlers: TutorialHandlers,
    private readonly touch: boolean,
  ) {
    this.ring = document.createElement('div');
    this.ring.className = 'tutorial-ring';
    this.ring.hidden = true;
    this.card = document.createElement('section');
    this.card.className = 'tutorial-card';
    this.card.setAttribute('role', 'dialog');
    this.card.setAttribute('aria-modal', 'false');
    this.card.setAttribute('aria-labelledby', 'tutorial-title');
    this.card.hidden = true;
    this.card.addEventListener('click', (e) => this.onClick(e));
    this.card.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        this.finish(false);
      }
    });
    parent.append(this.ring, this.card);
    window.addEventListener('resize', () => this.placeRing());
  }

  get active(): boolean {
    return this.flow !== null;
  }

  start(): void {
    this.flow = new TutorialFlow(TUTORIAL_STEPS, this.touch);
    this.card.hidden = false;
    this.render();
    // Araç çubuğu düzeni değişebilir (menü, kenar çubuğu): halka hedefi izler
    this.ringTimer = window.setInterval(() => this.placeRing(), 400);
    this.card.querySelector<HTMLElement>('button[data-act="next"]')?.focus();
  }

  /** Turu kapatır (bildirim göndermeden). */
  stop(): void {
    window.clearTimeout(this.advanceTimer);
    window.clearInterval(this.ringTimer);
    this.flow = null;
    this.card.hidden = true;
    this.ring.hidden = true;
  }

  /** Uygulama olayı: şu anki adımı tamamlıyorsa onay gösterilir ve geçilir. */
  notify(event: TutorialEvent): void {
    const flow = this.flow;
    if (!flow || !flow.notify(event)) return;
    this.render();
    window.clearTimeout(this.advanceTimer);
    this.advanceTimer = window.setTimeout(() => {
      if (this.flow === flow && flow.next()) this.render();
    }, ADVANCE_MS);
  }

  refreshLanguage(): void {
    if (this.flow) this.render();
  }

  private finish(clearPractice: boolean): void {
    this.stop();
    this.handlers.onFinish(clearPractice);
  }

  private onClick(e: MouseEvent): void {
    const act = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]')?.dataset.act;
    const flow = this.flow;
    if (!act || !flow) return;
    window.clearTimeout(this.advanceTimer);
    switch (act) {
      case 'next':
        if (!flow.next()) this.finish(false);
        else this.render();
        break;
      case 'back':
        if (flow.back()) this.render();
        break;
      case 'end':
        this.finish(false);
        break;
      case 'clear':
        this.finish(true);
        break;
      case 'lang':
        this.handlers.onToggleLanguage();
        break;
    }
  }

  private render(): void {
    const flow = this.flow!;
    const step = flow.step;
    const key = (suffix: string) => `tutorial.${step.id}.${suffix}` as MessageKey;
    const text = t(this.touch ? key('textTouch') : key('text'));
    const parts: string[] = [
      `<div class="tutorial-card__head"><span class="tutorial-card__progress">${t('tutorial.progress', {
        n: flow.index + 1,
        total: flow.steps.length,
      })}</span>`,
      `<button type="button" class="tutorial-card__close" data-act="end" aria-label="${esc(t('tutorial.end'))}" title="${esc(t('tutorial.end'))}">×</button></div>`,
      `<h2 class="tutorial-card__title" id="tutorial-title">${esc(t(key('title')))}</h2>`,
      `<p class="tutorial-card__text" aria-live="polite">${esc(text)}</p>`,
    ];
    if (flow.completed) parts.push(`<p class="tutorial-card__done" role="status">${esc(t('tutorial.great'))}</p>`);
    else if (flow.waiting) parts.push(`<p class="tutorial-card__hint">${esc(t('tutorial.waiting'))}</p>`);

    const buttons: string[] = [];
    if (step.id === 'welcome') {
      buttons.push(`<button type="button" class="btn btn--small" data-act="lang">${esc(t('tutorial.otherLanguage'))}</button>`);
    }
    if (!flow.isFirst) buttons.push(`<button type="button" class="btn btn--small" data-act="back">${esc(t('tutorial.back'))}</button>`);
    if (flow.isLast) {
      if (!this.sandbox) {
        buttons.push(`<button type="button" class="btn btn--small" data-act="clear">${esc(t('tutorial.clearPractice'))}</button>`);
      }
      buttons.push(
        `<button type="button" class="btn btn--small btn--primary" data-act="next">${esc(
          t(this.sandbox ? 'tutorial.finishRestore' : 'tutorial.finish'),
        )}</button>`,
      );
    } else {
      // Olay beklenirken "İleri" adımı atlar; değilse birincil düğmedir
      const label = flow.waiting ? t('tutorial.skipStep') : t('tutorial.next');
      const primary = flow.waiting ? '' : ' btn--primary';
      buttons.push(`<button type="button" class="btn btn--small${primary}" data-act="next">${esc(label)}</button>`);
    }
    parts.push(`<div class="tutorial-card__actions">${buttons.join('')}</div>`);
    this.card.innerHTML = parts.join('');
    this.placeRing();
  }

  /** Vurgu halkasını hedefin üstüne koyar (görünür ilk eşleşme; yoksa gizli). */
  private placeRing(): void {
    const selector = this.flow?.step.target;
    const target = selector
      ? [...document.querySelectorAll<HTMLElement>(selector)].find((el) => el.getClientRects().length > 0)
      : undefined;
    if (!target) {
      this.ring.hidden = true;
      return;
    }
    const r = target.getBoundingClientRect();
    this.ring.hidden = false;
    Object.assign(this.ring.style, {
      left: `${r.left - RING_PAD}px`,
      top: `${r.top - RING_PAD}px`,
      width: `${r.width + RING_PAD * 2}px`,
      height: `${r.height + RING_PAD * 2}px`,
    });
  }
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
