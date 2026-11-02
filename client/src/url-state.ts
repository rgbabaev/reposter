import { useCallback, useEffect, useState } from "preact/hooks";

type ParameterValues = Record<string, string | string[] | undefined>;

export function useListParameters() {
  const [search, setSearch] = useState(() => location.search);
  useEffect(() => {
    const update = () => setSearch(location.search);
    window.addEventListener("popstate", update);
    update();
    return () => window.removeEventListener("popstate", update);
  }, []);

  const replaceParameters = useCallback((values: ParameterValues) => {
    const url = new URL(location.href);
    for (const [name, value] of Object.entries(values)) {
      url.searchParams.delete(name);
      for (const item of Array.isArray(value) ? value : [value]) {
        if (item) url.searchParams.append(name, item);
      }
    }
    if (url.href === location.href) return;
    history.replaceState(history.state, "", url);
    setSearch(url.search);
    window.dispatchEvent(
      new PopStateEvent("popstate", { state: history.state }),
    );
  }, []);

  const parameters = new URLSearchParams(search);
  const requestedPage = Number(parameters.get("page"));
  const page =
    Number.isInteger(requestedPage) &&
    requestedPage > 0 &&
    requestedPage <= 1_000_000
      ? requestedPage
      : 1;
  const setPage = (page: number) =>
    replaceParameters({ page: page > 1 ? String(page) : undefined });

  return { parameters, page, setPage, replaceParameters };
}
