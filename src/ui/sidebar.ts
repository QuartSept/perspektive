/** Fare kenar çubuğundan çıkınca kapanmadan önceki bekleme (paneller arası boşluğu geçebilsin). */
const CLOSE_DELAY_MS = 350;
/** Araç değişince panelin kendiliğinden açık kaldığı süre. */
const PEEK_MS = 1800;

/**
 * Sol kenar çubuğu (paneller). Sabitlenmemişken daraltılmış durur, solda
 * yalnızca ince bir şerit görünür:
 *  - fare / kalem şeridin üstüne gelince açılır, kenar çubuğundan çıkınca kapanır
 *  - dokunmada şeride dokunmak açar / kapatır; tuvale dokunmak kapatır
 *  - klavyede şerit düğmesi açar; odak kenar çubuğundan çıkınca kapanır; Esc kapatır
 * Sabitlenince eski davranış: her zaman açık, tuvali iter.
 */
export class SidebarDock {
  private open = false;
  private closeTimer = 0;
  /** Kenar çubuğu içinde basılı bir tuş var (kaydırıcı sürükleme): kapanmasın. */
  private pressing = false;
  /** Kendiliğinden (araç değişimiyle) açıldı; kullanıcı henüz dokunmadı. */
  private peeking = false;
  private listeners = new Set<() => void>();

  constructor(
    private readonly app: HTMLElement,
    private readonly rail: HTMLButtonElement,
    private readonly sidebar: HTMLElement,
    private readonly pinButton: HTMLButtonElement,
    stage: HTMLElement,
    public pinned = false,
  ) {
    const hoverable = (e: PointerEvent) => e.pointerType === 'mouse' || e.pointerType === 'pen';
    for (const el of [rail, sidebar]) {
      el.addEventListener('pointerenter', (e) => {
        if (!hoverable(e)) return;
        this.peeking = false;
        window.clearTimeout(this.closeTimer);
        if (el === rail) this.setOpen(true);
      });
      el.addEventListener('pointerleave', (e) => {
        if (hoverable(e)) this.scheduleClose();
      });
    }
    // Fare / kalemle tıklama yalnızca açar (çıkınca zaten kapanır); dokunma ve
    // klavye (Enter / Space) açar / kapatır
    let railPointer = '';
    rail.addEventListener('pointerdown', (e) => {
      railPointer = e.pointerType;
    });
    rail.addEventListener('click', () => {
      const hover = railPointer === 'mouse' || railPointer === 'pen';
      railPointer = '';
      if (!this.pinned) this.setOpen(hover ? true : !this.open);
    });

    sidebar.addEventListener('pointerdown', () => {
      this.pressing = true;
      this.peeking = false;
    });
    window.addEventListener('pointerup', () => {
      if (!this.pressing) return;
      this.pressing = false;
      // Sürükleme kenar çubuğunun dışında bittiyse şimdi kapan
      if (!sidebar.matches(':hover')) this.scheduleClose();
    });

    // Tuvale dokunmak açık (sabitlenmemiş) kenar çubuğunu kapatır; dokunuş çizmez
    stage.addEventListener(
      'pointerdown',
      (e) => {
        if (!this.open || this.pinned || hoverable(e)) return;
        // Kendiliğinden açılmışsa kapanır ama dokunuş çizmeye devam eder
        const peeked = this.peeking;
        this.setOpen(false);
        if (peeked) return;
        e.preventDefault();
        e.stopImmediatePropagation();
      },
      { capture: true },
    );

    sidebar.addEventListener('focusout', (e) => {
      const next = e.relatedTarget as Node | null;
      if (next && (sidebar.contains(next) || next === rail)) return;
      if (!sidebar.matches(':hover')) this.setOpen(false);
    });
    sidebar.addEventListener('focusin', () => this.setOpen(true));

    pinButton.addEventListener('click', () => this.setPinned(!this.pinned));
    this.sync();
  }

  get isOpen(): boolean {
    return this.pinned || this.open;
  }

  onChange(fn: () => void): void {
    this.listeners.add(fn);
  }

  setPinned(pinned: boolean): void {
    if (pinned === this.pinned) return;
    this.pinned = pinned;
    // Sabitleme kaldırılınca imleç hâlâ üstündeyse açık kalır, değilse kapanır
    this.open = !pinned && this.sidebar.matches(':hover');
    this.sync();
    for (const fn of this.listeners) fn();
  }

  /**
   * Paneli kısa süre gösterir (araç ya da tür değişimi) ve `target`'ı görünür
   * kılar. Zaten açıksa (üstüne gelinmiş / dokunulmuş) yalnızca kaydırır;
   * süre dolmadan üstüne gelinirse açık kalır.
   */
  peek(target?: HTMLElement): void {
    const wasOpen = this.isOpen;
    if (!wasOpen) {
      this.setOpen(true);
      this.peeking = true;
    }
    if (target) {
      // Panel başa alınmış olur: kenar çubuğu en üste kaydırılır
      this.sidebar.scrollTop = 0;
      target.scrollIntoView({ block: 'nearest' });
    }
    if (wasOpen) return;
    this.closeTimer = window.setTimeout(() => {
      if (this.pressing || this.sidebar.matches(':hover') || this.rail.matches(':hover')) return;
      this.setOpen(false);
    }, PEEK_MS);
  }

  /** Sabitlenmemişse kapatır (Esc). Kapandıysa true. */
  close(): boolean {
    if (this.pinned || !this.open) return false;
    this.setOpen(false);
    return true;
  }

  private scheduleClose(): void {
    window.clearTimeout(this.closeTimer);
    if (this.pinned || this.pressing) return;
    this.closeTimer = window.setTimeout(() => {
      if (this.pressing || this.sidebar.matches(':hover') || this.rail.matches(':hover')) return;
      this.setOpen(false);
    }, CLOSE_DELAY_MS);
  }

  private setOpen(open: boolean): void {
    window.clearTimeout(this.closeTimer);
    if (open === this.open) return;
    this.open = open;
    if (!open) this.peeking = false;
    // Kapanırken odak içerideyse bırakılır: tuval kısayolları yeniden çalışsın
    if (!open && this.sidebar.contains(document.activeElement)) {
      (document.activeElement as HTMLElement).blur();
    }
    this.sync();
  }

  private sync(): void {
    const open = this.isOpen;
    this.app.dataset.sidebar = this.pinned ? 'pinned' : open ? 'open' : 'collapsed';
    this.rail.setAttribute('aria-expanded', String(open));
    this.rail.hidden = this.pinned;
    this.pinButton.setAttribute('aria-pressed', String(this.pinned));
    // Kapalıyken paneller sekme sırasından ve ekran okuyucudan çıkar
    this.sidebar.inert = !open;
  }
}
