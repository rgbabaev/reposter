import { confirmAction, ErrorDialog } from "./dialog";
import { showToast } from "./toast";
import { Button } from "./web-awesome";
import type { Page } from "@monitor/shared";
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { Empty, ErrorNotice, Loading, Pager } from "./components";

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

function useBulkSelection<T extends Item>(
  items: T[] | undefined,
  scope: string | number,
  refresh: () => void,
  actions: BulkAction<T>[],
  filters?: ComponentChildren,
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
      !(await confirmAction(
        `${action.label} ${targets.length} selected items? ${action.confirm}`,
      ))
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
      const summary = `${action.label}: ${completed.length} completed${failures.length ? `, ${failures.length} failed` : ""}.`;
      setResult(summary);
      setError([...new Set(failures)].join(" "));
      void showToast(
        summary,
        failures.length ? (completed.length ? "warning" : "danger") : "success",
      );
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
      <wa-checkbox
        class="check bulk-item-check"
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
      >
        <span class="visually-hidden">Select {label}</span>
      </wa-checkbox>
    );
  return {
    toolbar: (
      <div class="bulk-selection">
        <div class={filters ? "actions list-filter-row" : "actions"}>
          <Button
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
          </Button>
          {filters}
          {selecting && (
            <div
              class="actions bulk-action-panel"
              role="group"
              aria-label="Selected item actions"
            >
              <Button
                type="button"
                disabled={busy || !items?.length}
                onClick={() =>
                  setSelected((items || []).map((item) => item.id))
                }
              >
                Select page
              </Button>
              <Button
                type="button"
                disabled={busy || !selected.length}
                onClick={() => setSelected([])}
              >
                Clear selection
              </Button>
              <span role="status">{selected.length} selected on this page</span>
              {actions.map((action) => {
                const count = chosen.filter(
                  (item) => !action.eligible || action.eligible(item),
                ).length;
                return (
                  <Button
                    key={action.label}
                    type="button"
                    disabled={busy || !count}
                    onClick={() => void execute(action)}
                  >
                    {action.label} ({count})
                  </Button>
                );
              })}
            </div>
          )}
        </div>
        {busy && <p role="status">Applying selected action…</p>}
        <ErrorDialog
          message={error}
          summary={result}
          onClose={() => setError("")}
        />
      </div>
    ),
    row: (item: T, children: ComponentChildren, label?: string) => (
      <div key={item.id} class="bulk-item">
        {checkbox(item, label)}
        {children}
      </div>
    ),
  };
}

export interface EntityListProps<T extends Item> {
  data: Page<T> | undefined;
  loading: boolean;
  error?: string;
  refresh: () => void;
  onPage: (page: number) => void;
  scope: string | number;
  actions: BulkAction<T>[];
  itemLabel: (item: T) => string;
  renderItem: (item: T) => ComponentChildren;
  filters?: ComponentChildren;
  emptyTitle: string;
  emptyDescription?: ComponentChildren;
}

export function EntityList<T extends Item>({
  data,
  loading,
  error,
  refresh,
  onPage,
  scope,
  actions,
  itemLabel,
  renderItem,
  filters,
  emptyTitle,
  emptyDescription,
}: EntityListProps<T>) {
  const bulk = useBulkSelection(data?.items, scope, refresh, actions, filters);
  usePageClamp(data, onPage);
  return (
    <>
      {bulk.toolbar}
      <ErrorNotice message={error} onRetry={refresh} />
      {loading ? (
        <Loading />
      ) : (
        data &&
        (data.items.length ? (
          <>
            <div class="stack">
              {data.items.map((item) =>
                bulk.row(item, renderItem(item), itemLabel(item)),
              )}
            </div>
            <Pager data={data} onPage={onPage} />
          </>
        ) : (
          <Empty title={emptyTitle}>{emptyDescription}</Empty>
        ))
      )}
    </>
  );
}
