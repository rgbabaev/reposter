import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import type { ConnectorStatus } from "@monitor/shared";
import { api, useAction, useRemote } from "./api";
import { ErrorNotice, Icon, Link, Loading, navigate } from "./components";
import {
  ActivityPage,
  ConnectorsPage,
  Dashboard,
  MatchDetail,
  MatchesPage,
  MorePage,
  RuleEditorPage,
  RulesPage,
  SettingsPage,
  SourcesPage,
} from "./pages";
import "./style.css";
import {
  PostsPage,
  PostEditorPage,
  PublicationsPage,
} from "./publication-pages";
import { ScheduleEditorPage, SchedulesPage } from "./schedule-pages";

function Login({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("");
  const action = useAction();
  return (
    <div class="login-shell">
      <header class="brand">
        <span class="brand-mark" aria-hidden="true">
          M
        </span>
        <span>Personal Monitor</span>
      </header>
      <main class="login-card">
        <h1>Welcome back</h1>
        <p>Sign in to your monitoring workspace.</p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void action.run(async () => {
              await api("/login", { method: "POST", body: { password } });
              setPassword("");
              onLogin();
            });
          }}
        >
          <ErrorNotice message={action.error} />
          <label class="field">
            Access password
            <input
              type="password"
              value={password}
              onInput={(event) => setPassword(event.currentTarget.value)}
              required
              maxLength={1024}
              autoComplete="current-password"
              autoFocus
            />
          </label>
          <button type="submit" class="primary" disabled={action.busy}>
            {action.busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p class="footnote">
          Your session lasts seven days. You can sign out in Settings.
        </p>
      </main>
    </div>
  );
}
function Workspace({ onLogout }: { onLogout: () => void }) {
  const [path, setPath] = useState(location.pathname);
  const connector = useRemote<ConnectorStatus>("/connector", true);
  useEffect(() => {
    const update = () => setPath(location.pathname);
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  useEffect(() => {
    const title =
      path === "/"
        ? "Dashboard"
        : path.startsWith("/matches/")
          ? "Match details"
          : path === "/matches"
            ? "Matched Messages"
            : path.startsWith("/rules/")
              ? "Rule"
              : path.startsWith("/posts/")
                ? "Post"
                : path === "/schedules/new"
                  ? "New schedule"
                  : path.slice(1).replace(/^./, (c) => c.toUpperCase());
    document.title = title + " · Personal Monitor";
    window.scrollTo(0, 0);
    const timer = setTimeout(
      () => document.querySelector<HTMLElement>("main h1")?.focus(),
      0,
    );
    return () => clearTimeout(timer);
  }, [path]);
  let page;
  const ruleEdit = path.match(/^\/rules\/([^/]+)\/edit$/);
  const matchDetail = path.match(/^\/matches\/([^/]+)$/);
  const postEdit = path.match(/^\/posts\/([^/]+)\/edit$/);
  if (path === "/") page = <Dashboard />;
  else if (path === "/sources") page = <SourcesPage />;
  else if (path === "/rules") page = <RulesPage />;
  else if (path === "/rules/new") page = <RuleEditorPage />;
  else if (ruleEdit) page = <RuleEditorPage id={ruleEdit[1]} />;
  else if (path === "/matches") page = <MatchesPage />;
  else if (matchDetail) page = <MatchDetail id={matchDetail[1]!} />;
  else if (path === "/more") page = <MorePage />;
  else if (path === "/connectors")
    page = <ConnectorsPage status={connector.data} />;
  else if (path === "/activity") page = <ActivityPage />;
  else if (path === "/settings") page = <SettingsPage onLogout={onLogout} />;
  else if (path === "/posts") page = <PostsPage />;
  else if (path === "/posts/new") page = <PostEditorPage />;
  else if (postEdit) page = <PostEditorPage id={postEdit[1]} />;
  else if (path === "/publications") page = <PublicationsPage />;
  else if (path === "/schedules") page = <SchedulesPage />;
  else if (path === "/schedules/new") page = <ScheduleEditorPage />;
  else
    page = (
      <>
        <h1 tabIndex={-1}>Page not found</h1>
        <Link href="/">Return to Dashboard</Link>
      </>
    );
  const active =
    path === "/"
      ? "Dashboard"
      : path.startsWith("/sources")
        ? "Sources"
        : path.startsWith("/rules")
          ? "Rules"
          : path.startsWith("/matches")
            ? "Matches"
            : "More";
  return (
    <>
      <a class="skip-link" href="#main">
        Skip to content
      </a>
      <header class="topbar">
        <Link class="brand" href="/">
          <span class="brand-mark" aria-hidden="true">
            M
          </span>
          <span>Personal Monitor</span>
        </Link>
        <span class="timezone">UTC</span>
      </header>
      <main id="main" class="workspace" key={path} tabIndex={-1}>
        {connector.error ? (
          <div class="notice warning" role="status">
            <p>Cannot reach the server. Your latest data may be out of date.</p>
            <button type="button" onClick={connector.refresh}>
              Reconnect
            </button>
          </div>
        ) : (
          connector.data?.state !== "connected" &&
          connector.data && (
            <div class="notice warning" role="status">
              <p>
                Telegram is {connector.data.state}.{" "}
                <Link href="/connectors">View connection</Link>
              </p>
            </div>
          )
        )}
        {page}
      </main>
      <nav class="bottom-nav" aria-label="Main navigation">
        {[
          ["Dashboard", "/"],
          ["Sources", "/sources"],
          ["Rules", "/rules"],
          ["Matches", "/matches"],
          ["More", "/more"],
        ].map(([name, href]) => (
          <Link
            key={name}
            href={href!}
            aria-current={active === name ? "page" : undefined}
            class={active === name ? "active" : ""}
          >
            <Icon name={name!} />
            <span>{name}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
function App() {
  const [session, setSession] = useState<boolean>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    api<{ authenticated: boolean }>("/session")
      .then((value) => {
        if (!cancelled) {
          setSession(value.authenticated);
          setError("");
        }
      })
      .catch((reason) => {
        if (!cancelled)
          setError(
            reason instanceof Error ? reason.message : "Cannot connect.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);
  useEffect(() => {
    const expired = () => setSession(false);
    window.addEventListener("session-expired", expired);
    return () => window.removeEventListener("session-expired", expired);
  }, []);
  if (error)
    return (
      <main class="login-card">
        <h1>Personal Monitor</h1>
        <ErrorNotice
          message={error}
          onRetry={() => setAttempt((value) => value + 1)}
        />
      </main>
    );
  if (session === undefined)
    return (
      <main class="login-card">
        <h1>Personal Monitor</h1>
        <Loading label="Opening your workspace…" />
      </main>
    );
  return session ? (
    <Workspace
      onLogout={() => {
        setSession(false);
        navigate("/");
      }}
    />
  ) : (
    <Login onLogin={() => setSession(true)} />
  );
}
render(<App />, document.getElementById("app")!);
