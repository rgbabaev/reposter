import { Button } from "./web-awesome";
import type { ComponentChildren, HTMLAttributes } from "preact";
import type { ConnectorStatus, NotificationJob, Page } from "@monitor/shared";
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
  const onClick: HTMLAttributes<HTMLElement>["onClick"] = (event) => {
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
  };
  return props.class?.split(" ").includes("button") ? (
    <Button href={href} {...props} onClick={onClick}>
      {children}
    </Button>
  ) : (
    <a href={href} {...props} onClick={onClick}>
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
    <wa-callout variant="danger" class="notice error" role="alert">
      <p>{message}</p>
      {onRetry && (
        <Button type="button" onClick={onRetry}>
          Try again
        </Button>
      )}
    </wa-callout>
  ) : null;
}
export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <p class="state" role="status">
      <wa-spinner aria-hidden="true" />
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
    <wa-badge
      variant={
        state === "connected"
          ? "success"
          : state === "disconnected"
            ? "danger"
            : "neutral"
      }
      class="badge"
    >
      <span slot="start" class="dot" aria-hidden="true" />
      {label}
    </wa-badge>
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
      <Button
        type="button"
        disabled={data.page <= 1}
        onClick={() => onPage(data.page - 1)}
      >
        Previous
      </Button>
      <span>
        Page {data.page} of {pages}
      </span>
      <Button
        type="button"
        disabled={data.page >= pages}
        onClick={() => onPage(data.page + 1)}
      >
        Next
      </Button>
    </nav>
  );
}
export function Delivery({
  job,
  onRetry,
  busy = false,
}: {
  job?: NotificationJob;
  onRetry?: () => void;
  busy?: boolean;
}) {
  if (!job) return <p class="muted">Delivery status: Unavailable</p>;
  const channel = job.channel === "telegram" ? "Telegram" : "Email";
  return (
    <div class="delivery">
      <wa-badge
        variant={
          job.status === "sent"
            ? "success"
            : job.status === "failed"
              ? "danger"
              : "neutral"
        }
        class="badge"
      >
        {job.status === "sent"
          ? job.channel === "telegram"
            ? "Telegram accepted"
            : "SMTP accepted"
          : job.status === "failed"
            ? `${channel} failed`
            : `${channel} pending`}
      </wa-badge>
      <p class="muted">
        {job.attempts} {job.attempts === 1 ? "attempt" : "attempts"}
        {job.status === "sent"
          ? ` · ${utc(job.sentAt)}`
          : job.status === "pending"
            ? ` · Next attempt ${utc(job.nextAttemptAt)}`
            : ""}
      </p>
      {job.channel === "telegram" && !!job.partsTotal && (
        <p class="muted">
          {job.partsSent || 0} / {job.partsTotal} report parts accepted
        </p>
      )}
      {job.lastError && (
        <p class="error-text">{job.lastError.replaceAll("_", " ")}</p>
      )}
      {job.status !== "sent" && onRetry && (
        <Button type="button" disabled={busy} onClick={onRetry}>
          Retry {job.channel === "telegram" ? "Telegram" : "email"}
        </Button>
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
