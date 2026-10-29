import type { Page } from "@monitor/shared";
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { ErrorNotice } from "./components";

export function usePageClamp(
  data: Page<unknown> | undefined,
  onPage: (page: number) => void,
) {
  useEffect(() => {
    if (data) {
      const last = Math.max(1, Math.ceil(data.total / data.pageSize));
      if (data.page > last) onPage(last);
    }
  }, [data?.page, data?.total, data?.pageSize]);
}

type Item = { id: string };
export interface BulkAction<T> {
  label: string;
  run: (item: T) => Promise<unknown>;
  eligible?: (item: T) => boolean;
  confirm?: string;
}

export function useBulkSelection<T extends Item>(
  items: T[] | undefined,
  scope: string | number,
  refresh: () => void,
  actions: BulkAction<T>[],
) {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const running = useRef(false);
  useEffect(() => {
    setSelected([]);
    setSelecting(false);
    setResult("");
    setError("");
  }, [scope]);
  useEffect(() => {
    if (items && !running.current)
      setSelected((ids) =>
        ids.filter((id) => items.some((item) => item.id === id)),
      );
  }, [items]);
  const chosen = (items || []).filter((item) => selected.includes(item.id));
  const execute = async (action: BulkAction<T>) => {
    if (running.current) return;
    const targets = chosen.filter(
      (item) => !action.eligible || action.eligible(item),
    );
    if (!targets.length) return;
    if (
      action.confirm &&
      !confirm(
        `${action.label} ${targets.length} selected items? ${action.confirm}`,
      )
    )
      return;
    running.current = true;
    setBusy(true);
    setError("");
    setResult("");
    const completed: string[] = [];
    const failures: string[] = [];
    try {
      for (const item of targets) {
        try {
          await action.run(item);
          completed.push(item.id);
        } catch (reason) {
          failures.push(
            reason instanceof Error ? reason.message : "Request failed.",
          );
        }
      }
      setResult(
        `${action.label}: ${completed.length} completed${failures.length ? `, ${failures.length} failed` : ""}.`,
      );
      setError([...new Set(failures)].join(" "));
      refresh();
    } finally {
      setSelected([]);
      setSelecting(false);
      running.current = false;
      setBusy(false);
    }
  };
  const checkbox = (item: T, label = "item") =>
    selecting && (
      <label class="check bulk-item-check">
        <input
          type="checkbox"
          aria-label={`Select ${label}`}
          checked={selected.includes(item.id)}
          disabled={busy}
          onChange={(event) =>
            setSelected((ids) =>
              event.currentTarget.checked
                ? [...ids, item.id]
                : ids.filter((id) => id !== item.id),
            )
          }
        />
      </label>
    );
  return {
    toolbar: (
      <div class="bulk-selection">
        <div class="actions">
          <button
            type="button"
            disabled={busy || (!selecting && !items?.length)}
            aria-pressed={selecting}
            onClick={() => {
              setSelecting(!selecting);
              setSelected([]);
              setResult("");
              setError("");
            }}
          >
            {selecting ? "Cancel selection" : "Select"}
          </button>
          {selecting && (
            <div
              class="actions bulk-action-panel"
              role="group"
              aria-label="Selected item actions"
            >
              <button
                type="button"
                disabled={busy || !items?.length}
                onClick={() =>
                  setSelected((items || []).map((item) => item.id))
                }
              >
                Select page
              </button>
              <button
                type="button"
                disabled={busy || !selected.length}
                onClick={() => setSelected([])}
              >
                Clear selection
              </button>
              <span role="status">{selected.length} selected on this page</span>
              {actions.map((action) => {
                const count = chosen.filter(
                  (item) => !action.eligible || action.eligible(item),
                ).length;
                return (
                  <button
                    key={action.label}
                    type="button"
                    disabled={busy || !count}
                    onClick={() => void execute(action)}
                  >
                    {action.label} ({count})
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {busy && <p role="status">Applying selected action…</p>}
        {result && <p role="status">{result}</p>}
        <ErrorNotice message={error} />
      </div>
    ),
    checkbox,
    row: (item: T, children: ComponentChildren, label?: string) => (
      <div key={item.id} class="bulk-item">
        {checkbox(item, label)}
        {children}
      </div>
    ),
  };
}
