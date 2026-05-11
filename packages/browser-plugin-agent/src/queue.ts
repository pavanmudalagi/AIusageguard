import type { BrowserEventPayload, QueueConfig, QueuedEvent, StorageAdapter } from "./types";
import { validateSafeEvent } from "./validators";

const QUEUE_KEY = "aiug.eventQueue";

export class OfflineEventQueue {
  constructor(
    private readonly storage: StorageAdapter,
    private readonly config: QueueConfig
  ) {}

  async enqueue(payload: BrowserEventPayload): Promise<void> {
    const safePayload = validateSafeEvent(payload);
    const queue = await this.read();
    queue.push({
      id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
      payload: safePayload,
      attempts: 0,
      nextAttemptAt: Date.now(),
      createdAt: Date.now()
    });
    const trimmed = queue.slice(-this.config.maxEvents);
    await this.write(trimmed);
  }

  async flush(deliver: (payload: BrowserEventPayload) => Promise<void>): Promise<{ delivered: number; remaining: number }> {
    const now = Date.now();
    const queue = await this.read();
    const remaining: QueuedEvent[] = [];
    let delivered = 0;

    for (const item of queue) {
      if (item.nextAttemptAt > now) {
        remaining.push(item);
        continue;
      }
      try {
        await deliver(item.payload);
        delivered += 1;
      } catch {
        const attempts = item.attempts + 1;
        if (attempts < this.config.maxRetryAttempts) {
          remaining.push({
            ...item,
            attempts,
            nextAttemptAt: now + this.config.retryIntervalSeconds * 1000 * 2 ** Math.min(attempts - 1, 8)
          });
        }
      }
    }

    await this.write(remaining.slice(-this.config.maxEvents));
    return { delivered, remaining: remaining.length };
  }

  async size(): Promise<number> {
    return (await this.read()).length;
  }

  async read(): Promise<QueuedEvent[]> {
    return (await this.storage.getItem<QueuedEvent[]>(QUEUE_KEY)) ?? [];
  }

  private async write(queue: QueuedEvent[]): Promise<void> {
    await this.storage.setItem(QUEUE_KEY, queue);
  }
}
