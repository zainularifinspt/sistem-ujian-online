export type PendingAnswer = { questionId: string; answer: string };
export type Draft = { revision: number; answers: Record<string, string> };

/** One batch in flight; an acknowledgement only clears the values it actually saved. */
export class AnswerSync {
  private pending = new Map<string, string>();
  private active: Promise<void> | null = null;
  private stopped = false;
  constructor(public revision: number,
    private send: (answers: PendingAnswer[], revision: number) => Promise<number>,
    private changed: (draft: Draft) => void) {}

  update(questionId: string, answer: string) {
    this.pending.set(questionId, answer);
    this.persist();
  }
  restore(draft: Draft) {
    if (draft.revision !== this.revision) return false;
    for (const [id, value] of Object.entries(draft.answers)) this.pending.set(id, value);
    this.persist();
    return true;
  }
  get isStopped() { return this.stopped; }
  get size() { return this.pending.size; }
  snapshot() { return [...this.pending].map(([questionId, answer]) => ({ questionId, answer })); }
  private persist() { this.changed({ revision: this.revision, answers: Object.fromEntries(this.pending) }); }
  stop() { this.stopped = true; }
  async flush(): Promise<void> {
    if (this.active) { await this.active; return this.flush(); }
    if (!this.pending.size || this.stopped) return;
    const values = this.snapshot().slice(0, 200);
    const work = async () => {
      this.revision = await this.send(values, this.revision);
      for (const { questionId, answer } of values) {
        if (this.pending.get(questionId) === answer) this.pending.delete(questionId);
      }
      this.persist();
    };
    this.active = work();
    try { await this.active; } finally { this.active = null; }
    if (this.pending.size && !this.stopped) await this.flush();
  }
}
