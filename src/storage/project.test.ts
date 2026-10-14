import { describe, expect, it } from 'vitest';
import { DrawingDocument } from '../engine/document';
import { PaperGrid } from '../engine/grid';
import { History } from '../engine/history';
import { Paper } from '../engine/paper';
import { CornerLineSettings } from '../perspective/corner-lines';
import { PerspectiveScene } from '../perspective/scene';
import { LoadDrawingCommand, parseProject, serializeProject } from './project';

function sources() {
  const paper = new Paper('a4', { width: 1000, height: 700 });
  const scene = new PerspectiveScene();
  scene.reset(paper.rect);
  const doc = new DrawingDocument();
  const grid = new PaperGrid();
  const corners = new CornerLineSettings();
  return { paper, scene, doc, grid, corners };
}

describe('proje dosyası', () => {
  it('kaydet → aç gidiş-dönüşü çizimi, kurguyu ve kâğıdı korur', () => {
    const a = sources();
    a.paper.setOrientation('landscape');
    a.scene.setRayCount(40);
    a.scene.setHorizonLocked(false);
    a.doc.replaceAll([
      { id: 's1', points: [1, 2, 3, 4], style: { width: 3, opacity: 0.5, ink: 'blue' } },
    ]);
    a.doc.replaceAll([...a.doc.strokes], [
      {
        id: 'h1',
        kind: 'triangle',
        vertices: [0, 0, 10, 0, 5, 8],
        style: { width: 2, opacity: 1, ink: 'red' },
        cornerLines: false,
      },
    ]);
    a.grid.setVisible(true);
    a.grid.setSnap(true);
    a.grid.setSpacing(5);
    a.corners.setTarget('one');
    a.corners.setPoint(a.scene.points[1].id);
    const text = serializeProject(a);
    expect(JSON.parse(text).app).toBe('perspektif');

    const parsed = parseProject(text)!;
    expect(parsed.paper.orientation).toBe('landscape');
    expect(parsed.scene.rayCount).toBe(40);
    expect(parsed.scene.horizonLocked).toBe(false);
    expect(parsed.strokes).toEqual(a.doc.strokes);
    expect(parsed.shapes).toEqual(a.doc.shapes);
    expect(parsed.grid).toEqual({ visible: true, snap: true, spacingMm: 5, centerMark: false });
    expect(parsed.cornerLines).toEqual({ target: 'one', pointId: a.scene.points[1].id });
  });

  it('JSON olmayan, başka uygulamaya ait ya da bozuk dosyayı reddeder', () => {
    expect(parseProject('not json')).toBeNull();
    expect(parseProject('42')).toBeNull();
    expect(parseProject(JSON.stringify({ app: 'other', version: 1 }))).toBeNull();
    expect(parseProject(JSON.stringify({ app: 'perspektif', version: 2 }))).toBeNull();
  });

  it('açma tek adımda geri alınır', () => {
    const target = sources();
    target.doc.replaceAll([
      { id: 'old', points: [0, 0], style: { width: 1, opacity: 1, ink: 'black' } },
    ]);
    const other = sources();
    other.paper.setOrientation('landscape');
    other.doc.replaceAll([
      { id: 'new', points: [5, 5, 6, 6], style: { width: 2, opacity: 1, ink: 'red' } },
    ]);
    other.grid.setVisible(true);
    const loaded = parseProject(serializeProject(other))!;

    const history = new History();
    let changed = 0;
    history.execute(new LoadDrawingCommand(target, loaded, () => changed++));
    expect(target.doc.strokes.map((s) => s.id)).toEqual(['new']);
    expect(target.paper.orientation).toBe('landscape');
    expect(target.grid.visible).toBe(true);

    history.undo();
    expect(target.doc.strokes.map((s) => s.id)).toEqual(['old']);
    expect(target.paper.orientation).toBe('portrait');
    expect(target.grid.visible).toBe(false);
    expect(changed).toBe(2);
  });
});
