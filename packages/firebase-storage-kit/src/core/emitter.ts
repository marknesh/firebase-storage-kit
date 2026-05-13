type Listener<TPayload> = (payload: TPayload) => void;

export class Emitter<TEvents extends Record<string, unknown>> {
  private listeners = new Map<keyof TEvents, Set<Listener<any>>>();

  on<K extends keyof TEvents>(event: K, listener: Listener<TEvents[K]>) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    this.listeners.get(event)?.add(listener);

    return () => {
      this.listeners.get(event)?.delete(listener);
    };
  }

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
