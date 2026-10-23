import type { ComponentChildren } from "preact";
import type { ConnectorStatus, EmailJob, Page } from "@monitor/shared";
import { utc } from "./api";
export function navigate(path: string) {
  history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
export function Link({
  href,
  children,
  ...props
}: {
  href: string;
  children: ComponentChildren;
  class?: string;
  "aria-current"?: "page";
}) {
  return (
    <a
      href={href}
      {...props}
      onClick={(event) => {
        if (
          !event.ctrlKey &&
          !event.metaKey &&
          !event.shiftKey &&
          !event.altKey &&
          event.button === 0
        ) {
          event.preventDefault();
          navigate(href);
        }
      }}
    >
      {children}
    </a>
  );
}
export function ErrorNotice({
  message,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return message ? (
    <div class="notice error" role="alert">
      <p>{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  ) : null;
}
export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <p class="state" role="status">
      {label}
    </p>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ComponentChildren;
}) {
  return (
    <div class="empty">
      <h2>{title}</h2>
      {children && <p>{children}</p>}
    </div>
  );
}
export function Status({ state }: { state?: ConnectorStatus["state"] }) {
  const label = state
    ? state.charAt(0).toUpperCase() + state.slice(1)
    : "Checking";
  return (
    <span
      class={
        "badge " +
        (state === "connected"
          ? "good"
          : state === "disconnected"
            ? "bad"
            : "neutral")
      }
    >
      <span class="dot" aria-hidden="true" />
      {label}
    </span>
  );
}
export function Pager({
  data,
  onPage,
}: {
  data: Page<unknown>;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  return (
    <nav class="pager" aria-label="Pagination">
      <button
        type="button"
        disabled={data.page <= 1}
        onClick={() => onPage(data.page - 1)}
      >
        Previous
      </button>
      <span>
        Page {data.page} of {pages}
      </span>
      <button
        type="button"
        disabled={data.page >= pages}
        onClick={() => onPage(data.page + 1)}
      >
        Next
      </button>
    </nav>
  );
}
export function Delivery({
  job,
  onRetry,
  busy = false,
}: {
  job?: EmailJob;
  onRetry?: () => void;
  busy?: boolean;
}) {
  if (!job) return <p class="muted">Email status: Unavailable</p>;
  return (
    <div class="delivery">
      <span
        class={
          "badge " +
          (job.status === "sent"
            ? "good"
            : job.status === "failed"
              ? "bad"
              : "neutral")
        }
      >
        {job.status === "sent"
          ? "SMTP accepted"
          : job.status === "failed"
            ? "Email failed"
            : "Email pending"}
      </span>
      <p class="muted">
        {job.attempts} {job.attempts === 1 ? "attempt" : "attempts"}
        {job.status === "sent"
          ? ` · ${utc(job.sentAt)}`
          : job.status === "pending"
            ? ` · Next attempt ${utc(job.nextAttemptAt)}`
            : ""}
      </p>
      {job.lastError && (
        <p class="error-text">{job.lastError.replaceAll("_", " ")}</p>
      )}
      {job.status !== "sent" && onRetry && (
        <button type="button" disabled={busy} onClick={onRetry}>
          Retry email
        </button>
      )}
    </div>
  );
}
export function PageHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ComponentChildren;
}) {
  return (
    <header class="page-heading">
      <div>
        <h1 tabIndex={-1}>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </header>
  );
}
export function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    Dashboard: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
    Sources: "M3 7h18v14H3z M7 3h10v4 M8 12h8 M8 16h5",
    Rules: "M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6",
    Matches: "M4 3h16v15H8l-4 3z M8 7h8 M8 11h8",
    More: "M5 12h.01 M12 12h.01 M19 12h.01",
  };
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] || paths.More} />
    </svg>
  );
}
