import type { BaseCliConfig } from "./config";
import type { IHarnessAdapter } from "./harness.adapter";

/**
 * Registry starts empty; bootstrap registers default adapters.
 */
export class HarnessRegistry {
  private readonly adapters = new Map<string, IHarnessAdapter<BaseCliConfig>>();

  register(adapter: IHarnessAdapter<BaseCliConfig>): void {
    this.adapters.set(adapter.id, adapter);
  }

  get(id: string): IHarnessAdapter<BaseCliConfig> | undefined {
    return this.adapters.get(id);
  }

  has(id: string): boolean {
    return this.adapters.has(id);
  }

  list(): IHarnessAdapter<BaseCliConfig>[] {
    return Array.from(this.adapters.values());
  }
}
