import { INK_IDS, type InkId } from '../engine/stroke';
import { getLanguage, isLang, setLanguage } from '../i18n';
import type { SnapSettings } from '../perspective/snap-settings';
import type { BrushSettings } from '../tools/brush-settings';
import { ERASER_KINDS, type EraserKind, type EraserSettings } from '../tools/eraser';
import { THEME_PREFERENCES, type ThemeController, type ThemePreference } from '../ui/theme';

const KEY = 'perspektif.prefs.v1';

/** Çizimden bağımsız kullanıcı tercihleri (localStorage). */
interface Prefs {
  brush?: { width?: number; opacity?: number; ink?: string; smoothing?: number; pressure?: boolean };
  snap?: { enabled?: boolean; radius?: number };
  eraser?: { kind?: string; radius?: number };
  guidesVisible?: boolean;
  language?: string;
  onboardingDismissed?: boolean;
  theme?: string;
}

export interface PrefsTargets {
  brush: BrushSettings;
  snap: SnapSettings;
  eraser: EraserSettings;
  theme: ThemeController;
  getGuidesVisible(): boolean;
  setGuidesVisible(visible: boolean): void;
  getOnboardingDismissed(): boolean;
  setOnboardingDismissed(dismissed: boolean): void;
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Kayıtlı tercihleri uygular; okunamazsa varsayılanlar kalır. */
export function loadPrefs(t: PrefsTargets): void {
  let prefs: Prefs;
  try {
    prefs = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Prefs;
  } catch {
    return;
  }
  const b = prefs.brush ?? {};
  if (num(b.width)) t.brush.setWidth(b.width);
  if (num(b.opacity)) t.brush.setOpacity(b.opacity);
  if (num(b.smoothing)) t.brush.setSmoothing(b.smoothing);
  if (typeof b.pressure === 'boolean') t.brush.setPressure(b.pressure);
  if (INK_IDS.includes(b.ink as InkId)) t.brush.setInk(b.ink as InkId);
  const s = prefs.snap ?? {};
  if (typeof s.enabled === 'boolean') t.snap.setEnabled(s.enabled);
  if (num(s.radius)) t.snap.setRadius(s.radius);
  const er = prefs.eraser ?? {};
  if (ERASER_KINDS.includes(er.kind as EraserKind)) t.eraser.setKind(er.kind as EraserKind);
  if (num(er.radius)) t.eraser.setRadius(er.radius);
  if (typeof prefs.guidesVisible === 'boolean') t.setGuidesVisible(prefs.guidesVisible);
  if (isLang(prefs.language)) setLanguage(prefs.language);
  if (prefs.onboardingDismissed === true) t.setOnboardingDismissed(true);
  if (THEME_PREFERENCES.includes(prefs.theme as ThemePreference)) {
    t.theme.set(prefs.theme as ThemePreference);
  }
}

export function savePrefs(t: PrefsTargets): void {
  const prefs: Prefs = {
    brush: {
      width: t.brush.width,
      opacity: t.brush.opacity,
      ink: t.brush.ink,
      smoothing: t.brush.smoothing,
      pressure: t.brush.pressure,
    },
    snap: { enabled: t.snap.enabled, radius: t.snap.radius },
    eraser: { kind: t.eraser.kind, radius: t.eraser.radius },
    guidesVisible: t.getGuidesVisible(),
    language: getLanguage(),
    onboardingDismissed: t.getOnboardingDismissed(),
    theme: t.theme.preference,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Depolama kapalı/dolu: tercihler bu oturumla sınırlı kalır
  }
}
