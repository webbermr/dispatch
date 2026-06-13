import { EventEmitter } from 'node:events'
import type { ServerEvent } from '../types.js'

/**
 * In-process event bus. The run manager publishes lifecycle events here; the
 * WebSocket server fans them out to subscribed browser clients (spec §4).
 */
class EventBus extends EventEmitter {
  publish(ev: ServerEvent): void {
    this.emit('event', ev)
  }

  onEvent(listener: (ev: ServerEvent) => void): () => void {
    this.on('event', listener)
    return () => this.off('event', listener)
  }
}

export const bus = new EventBus()
// Many WS clients may subscribe; lift the default 10-listener cap.
bus.setMaxListeners(0)
