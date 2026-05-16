type Listener<TPayload> = (payload: TPayload) => void;

export class Emitter<TEvents extends Record<string, unknown>> {
  private listeners = new Map<keyof TEvents, Set<Listener<any>>>();

  /**
   * @param event The event to listen for.
   * @param listener The function to call when the event is emitted.
   * @returns A function to unsubscribe from the event.
   */
  on<K extends keyof TEvents>(event: K, listener: Listener<TEvents[K]>) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    this.listeners.get(event)?.add(listener);

    return () => {
      this.listeners.get(event)?.delete(listener);
    };
  }

  /**
   * @param event The event to emit.
   * @param payload The payload to emit.
   */
  protected emit<K extends keyof TEvents>(event: K, payload: TEvents[K]) {
    const listeners = this.listeners.get(event);

    if (!listeners) {
      return;
    }

    for (const listener of listeners) {
      listener(payload);
    }
  }
}
