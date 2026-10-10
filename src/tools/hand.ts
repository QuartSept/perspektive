import type { Point } from '../engine/geometry';
import type { Viewport } from '../engine/viewport';
import type { Tool, ToolPointerEvent } from './tool';

/** Sol tuşla sürükleyerek görünümü kaydırır. */
export class HandTool implements Tool {
  readonly id = 'hand';
  private last: Point | null = null;

  constructor(
    private readonly viewport: Viewport,
    private readonly onCursorChange: () => void,
  ) {}

  get cursor(): string {
    return this.last ? 'grabbing' : 'grab';
  }

  onPointerDown(e: ToolPointerEvent): void {
    this.last = e.screen;
    this.onCursorChange();
  }

  onPointerMove(e: ToolPointerEvent): void {
    if (!this.last) return;
    this.viewport.panBy(e.screen.x - this.last.x, e.screen.y - this.last.y);
    this.last = e.screen;
  }

  onPointerUp(): void {
    this.onPointerCancel();
  }

  onPointerCancel(): void {
    this.last = null;
    this.onCursorChange();
  }
}
