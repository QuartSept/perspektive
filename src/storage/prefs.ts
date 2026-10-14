import { INK_IDS, type InkId } from '../engine/stroke';
import { getLanguage, isLang, setLanguage } from '../i18n';
import type { SnapSettings } from '../perspective/snap-settings';
import type { BrushSettings } from '../tools/brush-settings';
import { SHAPE_KINDS, type ShapeKind } from '../engine/shapes';
import { ERASER_KINDS, type EraserKind, type EraserSettings } from '../tools/eraser';
import type { ShapeSettings } from '../tools/shape-tools';
import { THEME_PREFERENCES, type ThemeController, type ThemePreference } from '../ui/theme';

const KEY = 'perspektif.prefs.v1';

/** Çizimden bağımsız kullanıcı tercihleri (localStorage). */
interface Prefs {
  brush?: {
    width?: number;
    opacity?: number;
    ink?: string;
    smoothing?: number;
    pressure?: boolean;
    straightLines?: boolean;
    axisSnap?: boolean;
  };
  snap?: { enabled?: boolean; radius?: number };
  eraser?: { kind?: string; radius?: number };
  shape?: { kind?: string };
  guidesVisible?: boolean;
  language?: string;
  onboardingDismissed?: boolean;
  theme?: string;
  sidebarPinned?: boolean;
  markerScale?: number;
}

export interface PrefsTargets {
  brush: BrushSettings;
  snap: SnapSettings;
  eraser: EraserSettings;
  shape: ShapeSettings;
  theme: ThemeController;
  getGuidesVisible(): boolean;
  setGuidesVisible(visible: boolean): void;
  getOnboardingDismissed(): boolean;
  setOnboardingDismissed(dismissed: boolean): void;
  getSidebarPinned(): boolean;
  setSidebarPinned(pinned: boolean): void;
  getMarkerScale(): number;
  setMarkerScale(scale: number): void;
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
  if (typeof b.straightLines === 'boolean') t.brush.setStraightLines(b.straightLines);
  if (typeof b.axisSnap === 'boolean') t.brush.setAxisSnap(b.axisSnap);
  if (INK_IDS.includes(b.ink as InkId)) t.brush.setInk(b.ink as InkId);
  const s = prefs.snap ?? {};
  if (typeof s.enabled === 'boolean') t.snap.setEnabled(s.enabled);
  if (num(s.radius)) t.snap.setRadius(s.radius);
  const er = prefs.eraser ?? {};
  if (ERASER_KINDS.includes(er.kind as EraserKind)) t.eraser.setKind(er.kind as EraserKind);
  if (num(er.radius)) t.eraser.setRadius(er.radius);
  const sh = prefs.shape ?? {};
  if (SHAPE_KINDS.includes(sh.kind as ShapeKind)) t.shape.setKind(sh.kind as ShapeKind);
  if (typeof prefs.guidesVisible === 'boolean') t.setGuidesVisible(prefs.guidesVisible);
  if (isLang(prefs.language)) setLanguage(prefs.language);
  if (prefs.onboardingDismissed === true) t.setOnboardingDismissed(true);
  if (typeof prefs.sidebarPinned === 'boolean') t.setSidebarPinned(prefs.sidebarPinned);
  if (num(prefs.markerScale)) t.setMarkerScale(prefs.markerScale);
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
      straightLines: t.brush.straightLines,
      axisSnap: t.brush.axisSnap,
    },
    snap: { enabled: t.snap.enabled, radius: t.snap.radius },
    eraser: { kind: t.eraser.kind, radius: t.eraser.radius },
    shape: { kind: t.shape.kind },
    guidesVisible: t.getGuidesVisible(),
    language: getLanguage(),
    onboardingDismissed: t.getOnboardingDismissed(),
    theme: t.theme.preference,
    sidebarPinned: t.getSidebarPinned(),
    markerScale: t.getMarkerScale(),
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Depolama kapalı/dolu: tercihler bu oturumla sınırlı kalır
  }
}
