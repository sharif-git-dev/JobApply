/** Guest information lasts for this page visit only. */
export class GuestState {
  private values = new Map<string, unknown>();
  private revision = 0;
  get<T>(key: string): T | undefined { return this.values.get(key) as T | undefined; }
  set(key: string, value: unknown) { this.values.set(key, value); }
  version() { return this.revision; }
  clear() { this.values.clear(); this.revision++; }
  assertCurrent(version: number) {
    if (version !== this.revision) throw new Error("Your sign-in changed. Please try again.");
  }
}
