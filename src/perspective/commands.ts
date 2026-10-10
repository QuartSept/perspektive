import type { Command, History } from '../engine/history';
import { snapshotsEqual, type PerspectiveScene, type SceneSnapshot } from './scene';

/** Kurgu değişikliği: önceki ve sonraki anlık görüntü arasında geçiş. */
export class SceneChangeCommand implements Command {
  constructor(
    private readonly scene: PerspectiveScene,
    private readonly before: SceneSnapshot,
    private readonly after: SceneSnapshot,
  ) {}

  apply(): void {
    this.scene.restore(this.after);
  }

  revert(): void {
    this.scene.restore(this.before);
  }
}

/**
 * `mutate` ile yapılan kurgu değişikliğini (değiştiyse) geçmişe kaydeder.
 * Sürükleme gibi çok adımlı değişiklikler için `beginSceneEdit` kullanılır.
 */
export function editScene(history: History, scene: PerspectiveScene, mutate: () => void): void {
  const commit = beginSceneEdit(history, scene);
  mutate();
  commit();
}

export function beginSceneEdit(history: History, scene: PerspectiveScene): () => void {
  const before = scene.snapshot();
  return () => {
    const after = scene.snapshot();
    if (!snapshotsEqual(before, after)) {
      history.record(new SceneChangeCommand(scene, before, after));
    }
  };
}
