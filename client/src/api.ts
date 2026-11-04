import { useCallback, useEffect, useRef, useState } from "preact/hooks";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const response = await fetch("/api" + path, {
    method: options.method || "GET",
    credentials: "same-origin",
    headers:
      options.body === undefined
        ? undefined
        : { "Content-Type": "application/json" },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });
  const value = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== "/login")
      window.dispatchEvent(new Event("session-expired"));
    throw new ApiError(
      response.status,
      typeof value.error === "string"
        ? value.error
        : "Request failed. Please try again.",
    );
  }
  return value as T;
}
export function useRemote<T>(path: string | null, poll = false) {
  const [state, setState] = useState<{
    path: string | null;
    data?: T;
    error: string;
    loading: boolean;
  }>({ path, error: "", loading: !!path });
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((value) => value + 1), []);
  const request = useRef<AbortController | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    setState((previous) => ({
      path,
      data: previous.path === path ? previous.data : undefined,
      error: "",
      loading:
        !!path && (previous.path !== path || previous.data === undefined),
    }));
    if (!path) return;
    const load = async (initial = false) => {
      if (document.visibilityState !== "visible" && (poll || !initial)) return;
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      try {
        const value = await api<T>(path, { signal: controller.signal });
        if (!cancelled) {
          setState({ path, data: value, error: "", loading: false });
        }
      } catch (reason) {
        if (
          !cancelled &&
          !(reason instanceof DOMException && reason.name === "AbortError")
        )
          setState((previous) => ({
            ...previous,
            error:
              reason instanceof Error
                ? reason.message
                : "Cannot reach the server.",
          }));
      } finally {
        if (!cancelled)
          setState((previous) => ({ ...previous, loading: false }));
      }
    };
    void load(true);
    const visible = () => {
      if (document.visibilityState === "visible") void load();
      else request.current?.abort();
    };
    if (poll) document.addEventListener("visibilitychange", visible);
    const timer = poll
      ? window.setInterval(() => {
          void load();
        }, 15000)
      : undefined;
    return () => {
      cancelled = true;
      request.current?.abort();
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [path, poll, version]);
  const current =
    state.path === path ? state : { data: undefined, error: "", loading: !!path };
  return {
    data: current.data,
    error: current.error,
    loading: current.loading,
    refresh,
  };
}
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The action failed. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run, clear: () => setError("") };
}
export function utc(value: string | undefined): string {
  if (!value) return "Unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unavailable"
    : date
        .toISOString()
        .replace("T", " ")
        .replace(/\.\d{3}Z$/, " UTC");
}
