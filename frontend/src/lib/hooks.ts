"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "./api/client";

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const d = await fnRef.current();
      setData(d);
      return d;
    } catch (e) {
      setError(e as Error);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading, reload: run, setData };
}

/** Wraps a mutation with pending + field-error state. */
export function useMutation<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const fieldErrors = error instanceof ApiError ? error.fields ?? {} : {};
  const run = useCallback(
    async (...args: A): Promise<R | undefined> => {
      setPending(true);
      setError(null);
      try {
        return await fn(...args);
      } catch (e) {
        setError(e as Error);
        return undefined;
      } finally {
        setPending(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fn],
  );
  return { run, pending, error, fieldErrors, reset: () => setError(null) };
}

export function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
