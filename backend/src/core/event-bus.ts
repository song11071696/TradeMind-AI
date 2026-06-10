// ============================================================
// TradeMind AI - Event Bus (Pub/Sub Pattern)
// ============================================================
import type { TradeMindEvent, EventType } from '../types';

type EventHandler = (event: TradeMindEvent) => void | Promise<void>;

export class EventBus {
  private handlers: Map<EventType, EventHandler[]> = new Map();
  private eventLog: TradeMindEvent[] = [];
  private maxLogSize: number;

  constructor(maxLogSize: number = 1000) {
    this.maxLogSize = maxLogSize;
  }

  subscribe(type: EventType, handler: EventHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    this.handlers.get(type)!.push(handler);

    // Return unsubscribe function
    return () => {
      const handlers = this.handlers.get(type);
      if (handlers) {
        const idx = handlers.indexOf(handler);
        if (idx !== -1) handlers.splice(idx, 1);
      }
    };
  }

  async emit(event: TradeMindEvent): Promise<void> {
    this.eventLog.push(event);
    if (this.eventLog.length > this.maxLogSize) {
      this.eventLog.shift();
    }

    const handlers = this.handlers.get(event.type) || [];
    const promises = handlers.map(async (handler) => {
      try {
        await handler(event);
      } catch (err) {
        console.error(`[EventBus] Error in handler for ${event.type}:`, err);
      }
    });

    await Promise.allSettled(promises);
  }

  getEventLog(type?: EventType, limit: number = 100): TradeMindEvent[] {
    let events = type
      ? this.eventLog.filter((e) => e.type === type)
      : this.eventLog;
    return events.slice(-limit);
  }

  clearLog(): void {
    this.eventLog = [];
  }
}

// Singleton instance
export const eventBus = new EventBus();
