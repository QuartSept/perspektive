import { describe, expect, it } from 'vitest';
import { addStrokeCommand, ReplaceStrokesCommand } from './commands';
import { DrawingDocument } from './document';
import { History } from './history';
import type { Stroke } from './stroke';

const stroke = (id: string): Stroke => ({
  id,
  points: [0, 0, 10, 10],
  style: { width: 2, opacity: 1, ink: 'black' },
});

const ids = (doc: DrawingDocument) => doc.strokes.map((s) => s.id);

describe('History + ReplaceStrokesCommand', () => {
  it('ekle / geri al / ileri al', () => {
    const doc = new DrawingDocument();
    const history = new History();
    history.execute(addStrokeCommand(doc, stroke('a')));
    history.execute(addStrokeCommand(doc, stroke('b')));
    expect(ids(doc)).toEqual(['a', 'b']);

    history.undo();
    expect(ids(doc)).toEqual(['a']);
    expect(history.canRedo).toBe(true);
    history.redo();
    expect(ids(doc)).toEqual(['a', 'b']);
  });

  it('yeni komut ileri al yığınını temizler', () => {
    const doc = new DrawingDocument();
    const history = new History();
    history.execute(addStrokeCommand(doc, stroke('a')));
    history.undo();
    history.execute(addStrokeCommand(doc, stroke('b')));
    expect(history.canRedo).toBe(false);
    expect(ids(doc)).toEqual(['b']);
  });

  it('silme geri alınınca stroke’lar eski sıralarına döner', () => {
    const doc = new DrawingDocument();
    doc.replaceAll(['a', 'b', 'c', 'd'].map(stroke));
    const history = new History();
    history.execute(new ReplaceStrokesCommand(doc, ['b', 'd'], []));
    expect(ids(doc)).toEqual(['a', 'c']);
    history.undo();
    expect(ids(doc)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('bir stroke’u parçalarla değiştirme (v2 piksel silgisi senaryosu)', () => {
    const doc = new DrawingDocument();
    doc.replaceAll(['a', 'b', 'c'].map(stroke));
    const history = new History();
    history.execute(
      new ReplaceStrokesCommand(doc, ['b'], [
        { index: 1, stroke: stroke('b1') },
        { index: 2, stroke: stroke('b2') },
      ]),
    );
    expect(ids(doc)).toEqual(['a', 'b1', 'b2', 'c']);
    history.undo();
    expect(ids(doc)).toEqual(['a', 'b', 'c']);
    history.redo();
    expect(ids(doc)).toEqual(['a', 'b1', 'b2', 'c']);
  });
});
