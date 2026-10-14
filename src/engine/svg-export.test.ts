import { describe, expect, it } from 'vitest';
import { PX_PER_MM } from './paper';
import type { Stroke } from './stroke';
import { buildSvg, splitAlpha, strokePathData, type SvgTheme } from './svg-export';
import { PerspectiveScene } from '../perspective/scene';

const theme: SvgTheme = {
  inks: {
    black: '#111111',
    'gray-dark': '#555555',
    gray: '#888888',
    'gray-light': '#bbbbbb',
    red: '#bb4433',
    blue: '#2255aa',
    green: '#337744',
    ochre: '#cc9922',
  },
  printPaper: '#ffffff',
  vanishingPoints: ['#3a6fb0', '#3f8a63'],
  horizon: 'rgba(194, 85, 61, 0.5)',
  markerFill: '#fdfcf8',
  printGuideOpacity: 0.35,
  grid: 'rgba(43, 42, 39, 0.18)',
};

const paper = { width: 210 * PX_PER_MM, height: 297 * PX_PER_MM };
const strokes: Stroke[] = [
  { id: 'a', points: [10, 10, 50, 30, 90, 10], style: { width: 2, opacity: 1, ink: 'black' } },
  { id: 'b', points: [100, 100], style: { width: 6, opacity: 0.5, ink: 'red' } },
];

function scene(): PerspectiveScene {
  const s = new PerspectiveScene();
  s.reset({ x: 0, y: 0, ...paper });
  return s;
}

const count = (svg: string, re: RegExp) => (svg.match(re) ?? []).length;

describe('buildSvg', () => {
  it('gerçek boyut mm cinsinden, viewBox dünya biriminde', () => {
    const svg = buildSvg({ paper, strokes, scene: scene(), theme }, false);
    expect(svg).toContain('width="210mm" height="297mm"');
    expect(svg).toMatch(/viewBox="0 0 793\.7 1122\.52"/);
    expect(svg).toContain('clip-path="url(#page)"');
  });

  it('her stroke bir öğe: çok noktalı path, tek nokta daire; opaklık korunur', () => {
    const svg = buildSvg({ paper, strokes, scene: scene(), theme }, false);
    const drawing = svg.slice(svg.indexOf('<g id="drawing">'));
    expect(count(drawing, /<path /g)).toBe(1);
    expect(count(drawing, /<circle /g)).toBe(1);
    expect(drawing).toContain('stroke="#111111" stroke-width="2"');
    expect(drawing).toContain('r="3" fill="#bb4433" opacity="0.5"');
  });

  it('kılavuzlu çıktı: nokta başına ışın path, ufuk, işaretçiler; kılavuzsuzda yok', () => {
    const s = scene();
    const withGuides = buildSvg({ paper, strokes, scene: s, theme }, true);
    expect(withGuides).toContain('<g id="guides">');
    // Işın path'i: rayCount kadar M..L parçası
    const rayPath = withGuides.match(/<path d="([^"]+)" fill="none" stroke="#3a6fb0"/)![1];
    expect(count(rayPath, /M/g)).toBe(s.rayCount);
    expect(withGuides).toContain('stroke="rgb(194, 85, 61)" stroke-width="1.25" opacity="0.5"');
    expect(count(withGuides, /r="5.5"/g)).toBe(2);

    const plain = buildSvg({ paper, strokes, scene: s, theme }, false);
    expect(plain).not.toContain('id="guides"');
  });

  it('görünür ızgara kılavuzlu çıktıda iç çizgiler olarak yazılır', () => {
    const spacing = 10 * PX_PER_MM;
    const withGrid = buildSvg({ paper, strokes, scene: scene(), theme, gridSpacing: spacing }, true);
    const d = withGrid.match(/<path id="grid" d="([^"]+)"/)![1];
    // A4 (210×297 mm), 10 mm: 20 dikey + 29 yatay iç çizgi
    expect(count(d, /V/g)).toBe(20);
    expect(count(d, /H/g)).toBe(29);
    expect(withGrid).toContain('stroke="rgb(43, 42, 39)" stroke-width="0.75" opacity="0.18"');

    const noGuides = buildSvg({ paper, strokes, scene: scene(), theme, gridSpacing: spacing }, false);
    expect(noGuides).not.toContain('id="grid"');
    expect(buildSvg({ paper, strokes, scene: scene(), theme }, true)).not.toContain('id="grid"');
  });
});

describe('yardımcılar', () => {
  it('strokePathData drawStroke geometrisini izler', () => {
    expect(strokePathData([0, 0, 10, 10, 20, 0])).toBe('M0 0 Q10 10 15 5 L20 0');
    expect(strokePathData([0, 0, 5, 5])).toBe('M0 0 L5 5');
  });

  it('splitAlpha', () => {
    expect(splitAlpha('rgba(1, 2, 3, 0.4)')).toEqual({ color: 'rgb(1, 2, 3)', alpha: 0.4 });
    expect(splitAlpha('#abcdef')).toEqual({ color: '#abcdef', alpha: 1 });
  });
});

describe('şekiller', () => {
  it('şekiller stroke’ların altında, kapalı olanlar Z ile yazılır', () => {
    const shapes = [
      {
        id: 'r',
        kind: 'rect' as const,
        vertices: [0, 0, 10, 0, 10, 5, 0, 5],
        style: { width: 3, opacity: 0.5, ink: 'black' as const },
        cornerLines: true,
      },
      {
        id: 'g',
        kind: 'segment' as const,
        vertices: [1, 1, 9, 9],
        style: { width: 2, opacity: 1, ink: 'red' as const },
        cornerLines: true,
      },
    ];
    const svg = buildSvg({ paper, strokes, shapes, scene: scene(), theme }, false);
    expect(svg).toContain('<path d="M0 0L10 0L10 5L0 5Z" fill="none" stroke="#111111" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/>');
    expect(svg).toContain('<path d="M1 1L9 9" fill="none"');
    expect(svg.indexOf('M0 0L10 0')).toBeLessThan(svg.indexOf('M10 10 Q'));
  });
});

describe('köşe çizgileri', () => {
  it('kılavuzlu çıktıda nokta rengiyle kesikli path; kılavuzsuzda yok', () => {
    const s = scene();
    const p = s.points[0];
    const lines = [{ corner: { x: 100, y: 100 }, point: p, from: { x: 100, y: 100 }, to: { x: p.x, y: p.y } }];
    const svg = buildSvg({ paper, strokes, scene: s, theme, cornerLines: lines }, true);
    expect(svg).toMatch(/<path class="corner-lines" d="M100 100L[^"]+" fill="none" stroke="#3a6fb0" stroke-width="1" stroke-dasharray="5 4"/);
    expect(buildSvg({ paper, strokes, scene: s, theme, cornerLines: lines }, false)).not.toContain('corner-lines');
  });
});

describe('merkez çizgileri ve işaretçi boyutu', () => {
  it('kılavuzlu çıktıda kesikli merkez çizgileri; işaretçi ekrandaki boyutta', () => {
    const s = scene();
    const svg = buildSvg(
      { paper, strokes, scene: s, theme: { ...theme, centerMark: 'rgba(194, 85, 61, 0.5)' }, centerMark: true, markerScale: 0.7 },
      true,
    );
    expect(svg).toContain('id="center-mark"');
    expect(svg).toContain('stroke-dasharray="6 4"');
    expect(count(svg, /r="3.85"/g)).toBe(2);
    expect(buildSvg({ paper, strokes, scene: s, theme, centerMark: true }, false)).not.toContain('center-mark');
  });
});

describe('katmanlar', () => {
  it('her katman ayrı grup; gizli katman yazılmaz, opaklık gruba uygulanır', () => {
    const layers = [
      { id: 'a', name: 'Eskiz', visible: true, locked: false, opacity: 0.5 },
      { id: 'b', name: '', visible: false, locked: false, opacity: 1 },
      { id: 'c', name: '', visible: true, locked: false, opacity: 1 },
    ];
    const layered = [
      { ...strokes[0], layerId: 'a' },
      { ...strokes[1], id: 'gizli', layerId: 'b' },
      { ...strokes[0], id: 'katmansiz' },
    ];
    const svg = buildSvg({ paper, strokes: layered, scene: scene(), theme, layers }, false);
    expect(svg).toContain('<g id="layer-a" data-name="Eskiz" opacity="0.5">');
    expect(svg).not.toContain('layer-b');
    expect(svg).not.toContain('layer-c'); // boş katman yazılmaz
    // Katmanı olmayan stroke en alttaki (a) katmanda
    expect(count(svg.match(/<g id="layer-a"[^>]*>(.*?)<\/g>/)![1], /<path /g)).toBe(2);
  });
});
