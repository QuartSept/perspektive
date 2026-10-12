export type ThemePreference = 'system' | 'light' | 'dark';
export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];

/**
 * Tema tercihi: sistem (prefers-color-scheme), açık ya da koyu. Etkin tema
 * <html data-theme="light|dark"> olarak yazılır; CSS değişkenleri buna göre
 * değişir. Sistem teması değişince (tercih "sistem" ise) kendiliğinden uyar.
 */
export class ThemeController {
  preference: ThemePreference = 'system';
  private readonly media = window.matchMedia('(prefers-color-scheme: dark)');
  private listeners = new Set<() => void>();

  constructor() {
    this.media.addEventListener('change', () => {
      if (this.preference === 'system') this.apply();
    });
    this.apply();
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  get effective(): 'light' | 'dark' {
    if (this.preference === 'system') return this.media.matches ? 'dark' : 'light';
    return this.preference;
  }

  set(preference: ThemePreference): void {
    if (preference === this.preference) return;
    this.preference = preference;
    this.apply();
  }

  /** Sistem → açık → koyu → sistem. */
  cycle(): void {
    const i = THEME_PREFERENCES.indexOf(this.preference);
    this.set(THEME_PREFERENCES[(i + 1) % THEME_PREFERENCES.length]);
  }

  private apply(): void {
    const theme = this.effective;
    if (document.documentElement.dataset.theme !== theme) {
      document.documentElement.dataset.theme = theme;
    }
    for (const fn of this.listeners) fn();
  }
}
