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
