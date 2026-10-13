/** Geri alınabilir değişiklik. */
export interface Command {
  apply(): void;
  revert(): void;
}

const MAX_HISTORY = 300;

/** Birden fazla komutu tek geri al adımında toplar (geri alırken ters sırada). */
export class CompositeCommand implements Command {
  constructor(private readonly commands: readonly Command[]) {}

  apply(): void {
    for (const c of this.commands) c.apply();
  }

  revert(): void {
    for (let i = this.commands.length - 1; i >= 0; i--) this.commands[i].revert();
  }
}

/** Tek komut varsa kendisi, birden fazlaysa birleşik komut; hiç yoksa null. */
export function combineCommands(commands: readonly Command[]): Command | null {
  if (commands.length === 0) return null;
  return commands.length === 1 ? commands[0] : new CompositeCommand(commands);
}

/** Komut tabanlı geri al / ileri al yığını. */
export class History {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private listeners = new Set<() => void>();

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Komutu uygular ve kaydeder. */
  execute(command: Command): void {
    command.apply();
    this.record(command);
  }

  /** Zaten uygulanmış bir değişikliği kaydeder (ör. sürükleme sonunda). */
  record(command: Command): void {
    this.undoStack.push(command);
    if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
    this.redoStack = [];
    this.emit();
  }

  undo(): void {
    const command = this.undoStack.pop();
    if (!command) return;
    command.revert();
    this.redoStack.push(command);
    this.emit();
  }

  redo(): void {
    const command = this.redoStack.pop();
    if (!command) return;
    command.apply();
    this.undoStack.push(command);
    this.emit();
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.emit();
  }
}
