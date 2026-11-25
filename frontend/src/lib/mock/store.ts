/**
 * A small external store. Mock modules use it so that components in different parts of the
 * page share the same state through useSyncExternalStore.
 */
export function createStore<T>(init: () => T) {
  let state = init();
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set: (update: (s: T) => T) => {
      state = update(state);
      listeners.forEach((l) => l());
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
