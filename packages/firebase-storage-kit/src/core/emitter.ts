type Listener<TPayload> = (payload: TPayload) => void;

export class Emitter<TEvents extends Record<string, unknown>> {
  private listeners: { [K in keyof TEvents]?: Set<Listener<TEvents[K]>> } = {};

  /**
   * @param event The event to listen for.
   * @param listener The function to call when the event is emitted.
   * @returns A function to unsubscribe from the event.
   */
  on<K extends keyof TEvents>(event: K, listener: Listener<TEvents[K]>) {
    if (!this.listeners[event]) {
      this.listeners[event] = new Set();
    }

    this.listeners[event]!.add(listener);

    return () => {
      this.listeners[event]?.delete(listener);
    };
  }

  /**
   * @param event The event to emit.
   * @param payload The payload to emit.
   */
  protected emit<K extends keyof TEvents>(event: K, payload: TEvents[K]) {
    const listeners = this.listeners[event];

    if (!listeners) {
      return;
    }

    for (const listener of listeners) {
      listener(payload);
    }
  }
}
