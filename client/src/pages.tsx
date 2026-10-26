import { ruleHeading } from "@monitor/shared";
import { useEffect, useState } from "preact/hooks";
import type {
  Activity,
  AttachmentType,
  ConnectorStatus,
  Dashboard as DashboardData,
  DiscoveredSource,
  EmailJob,
  Match,
  Page,
  Rule,
  RuleInput,
  SafeSettings,
  Source,
  TextCondition,
} from "@monitor/shared";
import { api, useAction, useRemote, utc } from "./api";
import {
  Delivery,
  Empty,
  ErrorNotice,
  Link,
  Loading,
  navigate,
  PageHeading,
  Pager,
  Status,
} from "./components";

function usePageClamp(
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

export function Dashboard() {
  const remote = useRemote<DashboardData>("/dashboard", true);
  const recent = useRemote<Page<Match>>("/matches?pageSize=5", true);
  const data = remote.data;
  return (
    <>
      <PageHeading
        title="Dashboard"
        description="Your personal monitoring overview."
      />
      <ErrorNotice message={remote.error} onRetry={remote.refresh} />
      {remote.loading && <Loading />}
      {data && (
        <>
          <section class="stats" aria-label="Monitoring totals">
            <Link href="/sources" class="stat">
              <span>Enabled sources</span>
              <strong>
                {data.enabledSources}
                <small> / {data.sources}</small>
              </strong>
            </Link>
            <Link href="/rules" class="stat">
              <span>Rules</span>
              <strong>{data.rules}</strong>
            </Link>
            <Link href="/matches" class="stat">
              <span>Stored matches</span>
              <strong>{data.matches}</strong>
            </Link>
            <Link href="/activity?view=delivery" class="stat">
              <span>Pending emails</span>
              <strong>{data.pendingEmails}</strong>
            </Link>
            <Link href="/activity?view=delivery" class="stat">
              <span>Failed emails</span>
              <strong>{data.failedEmails}</strong>
            </Link>
            <Link href="/activity" class="stat">
              <span>Open incidents</span>
              <strong>{data.incidents}</strong>
            </Link>
          </section>
          {!data.sources && (
            <div class="card callout">
              <h2>Start monitoring</h2>
              <p>Connect Telegram, choose sources, then add text rules.</p>
              <div class="actions">
                <Link class="button primary" href="/connectors">
                  Check connection
                </Link>
                <Link class="button" href="/sources">
                  Choose sources
                </Link>
              </div>
            </div>
          )}
        </>
      )}
      <section aria-labelledby="recent-title">
        <div class="section-heading">
          <h2 id="recent-title">Recent matches</h2>
          <Link href="/matches">View all</Link>
        </div>
        <ErrorNotice message={recent.error} onRetry={recent.refresh} />
        {recent.loading ? (
          <Loading />
        ) : recent.data?.items.length ? (
          <div class="stack">
            {recent.data.items.map((match) => (
              <MatchCard key={match.id} match={match} />
            ))}
          </div>
        ) : (
          recent.data && (
            <Empty title="No matches yet">
              Messages appear here when an enabled rule matches.
            </Empty>
          )
        )}
      </section>
    </>
  );
}

export function SourcesPage() {
  const [page, setPage] = useState(1);
  const [discoveryPage, setDiscoveryPage] = useState(1);
  const [showDiscovery, setShowDiscovery] = useState(false);
  const selected = useRemote<Page<Source>>(`/sources?page=${page}`);
  const discovered = useRemote<Page<DiscoveredSource>>(
    showDiscovery ? `/discovery?page=${discoveryPage}` : null,
  );
  const all = useRemote<Page<Source>>("/sources?pageSize=100");
  const action = useAction();
  usePageClamp(selected.data, setPage);
  usePageClamp(discovered.data, setDiscoveryPage);
  const refreshSelected = () => {
    selected.refresh();
    all.refresh();
  };
  const select = (source: DiscoveredSource) =>
    action.run(async () => {
      await api("/sources", {
        method: "POST",
        body: { externalId: source.externalId, topicId: source.topicId },
      });
      refreshSelected();
    });
  const refresh = () =>
    action.run(async () => {
      await api("/sources/refresh", { method: "POST", body: {} });
      setShowDiscovery(true);
      setDiscoveryPage(1);
      discovered.refresh();
    });
  return (
    <>
      <PageHeading
        title="Sources"
        description="Choose the Telegram chats and topics you want to monitor."
        action={
          <button
            type="button"
            class="primary"
            onClick={() => setShowDiscovery(!showDiscovery)}
          >
            {showDiscovery ? "Close discovery" : "Add sources"}
          </button>
        }
      />
      <ErrorNotice message={action.error} />
      {showDiscovery && (
        <section class="card discovery" aria-labelledby="discovery-title">
          <div class="section-heading">
            <h2 id="discovery-title">Accessible sources</h2>
            <button type="button" disabled={action.busy} onClick={refresh}>
              {action.busy ? "Working…" : "Refresh list"}
            </button>
          </div>
          <p class="muted">
            Refresh to discover groups, channels, private chats, and forum
            topics.
          </p>
          <ErrorNotice
            message={discovered.error}
            onRetry={discovered.refresh}
          />
          {discovered.loading ? (
            <Loading />
          ) : discovered.data?.items.length ? (
            <>
              <ul class="source-picker">
                {discovered.data.items.map((source) => {
                  const added = all.data?.items.some(
                    (s) =>
                      s.externalId === source.externalId &&
                      (s.topicId || "") === (source.topicId || ""),
                  );
                  return (
                    <li key={source.externalId + ":" + (source.topicId || "")}>
                      <div>
                        <strong>{source.name}</strong>
                        <span class="muted">
                          {source.kind === "topic"
                            ? "Forum topic"
                            : source.kind.charAt(0).toUpperCase() +
                              source.kind.slice(1)}
                        </span>
                      </div>
                      <button
                        type="button"
                        disabled={action.busy || added}
                        onClick={() => select(source)}
                        aria-label={
                          added
                            ? `${source.name} selected`
                            : `Monitor ${source.name}`
                        }
                      >
                        {added ? "Selected" : "Monitor"}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <Pager data={discovered.data} onPage={setDiscoveryPage} />
            </>
          ) : (
            discovered.data && (
              <Empty title="No sources listed">
                Use Refresh list after connecting Telegram.
              </Empty>
            )
          )}
        </section>
      )}
      <section aria-labelledby="selected-title">
        <h2 id="selected-title">Monitored sources</h2>
        <ErrorNotice message={selected.error} onRetry={selected.refresh} />
        {selected.loading ? (
          <Loading />
        ) : selected.data?.items.length ? (
          <>
            <div class="stack">
              {selected.data.items.map((source) => (
                <article class="card" key={source.id}>
                  <div class="card-heading">
                    <div>
                      <h3>{source.name}</h3>
                      <p class="muted">
                        {source.kind === "topic"
                          ? "Forum topic"
                          : source.kind.charAt(0).toUpperCase() +
                            source.kind.slice(1)}
                      </p>
                    </div>
                    <span
                      class={"badge " + (source.enabled ? "good" : "neutral")}
                    >
                      {source.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                  {source.error && (
                    <p class="error-text">
                      Source access needs attention. Check Connectors and
                      Activity Log.
                    </p>
                  )}
                  <p class="muted">
                    {source.enabled ? "Enabled since" : "Selection changed"}{" "}
                    {utc(source.selectedAt)}
                  </p>
                  <div class="actions">
                    <button
                      type="button"
                      disabled={action.busy}
                      onClick={() =>
                        action.run(async () => {
                          await api("/sources/" + source.id, {
                            method: "PATCH",
                            body: { enabled: !source.enabled },
                          });
                          refreshSelected();
                        })
                      }
                    >
                      {source.enabled ? "Disable" : "Enable"}
                    </button>
                    <Link
                      class="button"
                      href={
                        "/rules/new?source=" + encodeURIComponent(source.id)
                      }
                    >
                      Add rule
                    </Link>
                    <button
                      type="button"
                      class="danger subtle"
                      disabled={action.busy}
                      onClick={() => {
                        if (
                          confirm(
                            `Remove “${source.name}” and its rule assignments? Stored matches and queued emails will be kept.`,
                          )
                        )
                          void action.run(async () => {
                            await api("/sources/" + source.id, {
                              method: "DELETE",
                            });
                            refreshSelected();
                          });
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </article>
              ))}
            </div>
            <Pager data={selected.data} onPage={setPage} />
          </>
        ) : (
          selected.data && (
            <Empty title="No monitored sources">
              Choose Add sources to select your first chat or forum topic.
            </Empty>
          )
        )}
        <p class="footnote">
          Enabling starts from the current message. Earlier messages and
          disabled periods are excluded. Removing a source keeps its stored
          matches.
        </p>
      </section>
    </>
  );
}

const conditionLabels: Record<TextCondition["kind"], string> = {
  part: "Word part",
  word: "Complete word",
  phrase: "Exact phrase",
  hashtag: "Hashtag",
};
export function RulesPage() {
  const [page, setPage] = useState(1);
  const remote = useRemote<Page<Rule>>(`/rules?page=${page}`);
  const sources = useRemote<Page<Source>>("/sources?pageSize=100");
  const action = useAction();
  usePageClamp(remote.data, setPage);
  return (
    <>
      <PageHeading
        title="Rules"
        description="Rules are shared across their assigned sources. Edits and disabling apply everywhere. All text conditions must match."
        action={
          <Link href="/rules/new" class="button primary">
            Add rule
          </Link>
        }
      />
      <ErrorNotice
        message={action.error || remote.error || sources.error}
        onRetry={
          remote.error || sources.error
            ? () => {
                remote.refresh();
                sources.refresh();
              }
            : undefined
        }
      />
      {remote.loading ? (
        <Loading />
      ) : remote.data?.items.length ? (
        <>
          <div class="stack">
            {remote.data.items.map((rule) => (
              <article class="card" key={rule.id}>
                <div class="card-heading">
                  <div>
                    <h2>{ruleHeading(rule)}</h2>
                    <p class="muted">
                      {rule.sourceIds.length
                        ? rule.sourceIds
                            .map(
                              (id) =>
                                sources.data?.items.find((s) => s.id === id)
                                  ?.name || "Loading source…",
                            )
                            .join(", ")
                        : "Unassigned"}
                    </p>
                  </div>
                  <span class={"badge " + (rule.enabled ? "good" : "neutral")}>
                    {rule.enabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
                <ul class="conditions">
                  {rule.conditions.map((condition, index) => (
                    <li key={index}>
                      <span>{conditionLabels[condition.kind]}</span>{" "}
                      <strong>{condition.value}</strong>
                    </li>
                  ))}
                </ul>
                <p class="muted">
                  {rule.attachmentTypes.length
                    ? "Also requires one of: " + rule.attachmentTypes.join(", ")
                    : "Text alone can match. Images are optional."}
                </p>
                <div class="actions">
                  <Link href={"/rules/" + rule.id + "/edit"} class="button">
                    Edit
                  </Link>
                  <button
                    type="button"
                    disabled={action.busy}
                    onClick={() =>
                      action.run(async () => {
                        await api("/rules/" + rule.id, {
                          method: "PUT",
                          body: { ...rule, enabled: !rule.enabled },
                        });
                        remote.refresh();
                      })
                    }
                  >
                    {rule.enabled ? "Disable" : "Enable"}
                  </button>
                  <button
                    type="button"
                    class="danger subtle"
                    disabled={action.busy}
                    onClick={() => {
                      if (
                        confirm(
                          `Delete “${ruleHeading(rule)}”? Existing matches will be kept.`,
                        )
                      )
                        void action.run(async () => {
                          await api("/rules/" + rule.id, { method: "DELETE" });
                          remote.refresh();
                        });
                    }}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
          <Pager data={remote.data} onPage={setPage} />
        </>
      ) : (
        remote.data && (
          <Empty title="No rules yet">
            Add a source, then create a rule with at least one text condition.
          </Empty>
        )
      )}
    </>
  );
}
export function RuleEditorPage({ id }: { id?: string }) {
  const remote = useRemote<Rule>(
    id ? "/rules/" + encodeURIComponent(id) : null,
  );
  const sources = useRemote<Page<Source>>("/sources?pageSize=100");
  const rule = remote.data;
  return (
    <>
      <Link class="back-link" href="/rules">
        ‹ Rules
      </Link>
      <PageHeading title={id ? "Edit rule" : "New rule"} />
      <ErrorNotice
        message={sources.error || remote.error}
        onRetry={() => {
          sources.refresh();
          remote.refresh();
        }}
      />
      {sources.loading || (id && remote.loading) ? (
        <Loading />
      ) : sources.data && (sources.data.items.length || rule) ? (
        id && !rule ? (
          <Empty title="Rule not found">
            Return to Rules to choose an existing rule.
          </Empty>
        ) : (
          <RuleForm
            key={id || "new"}
            initial={rule}
            sources={sources.data!.items}
          />
        )
      ) : (
        sources.data && (
          <Empty title="Choose a source first">
            <Link href="/sources">Open Sources</Link> to select a chat or topic
            before creating rules.
          </Empty>
        )
      )}
    </>
  );
}
function RuleForm({ initial, sources }: { initial?: Rule; sources: Source[] }) {
  const preferred = new URLSearchParams(location.search).get("source");
  const [draft, setDraft] = useState<RuleInput>(() =>
    initial
      ? {
          sourceIds: [...initial.sourceIds],
          enabled: initial.enabled,
          conditions: initial.conditions.map((c) => ({ ...c })),
          attachmentTypes: [...initial.attachmentTypes],
        }
      : {
          sourceIds: sources
            .filter((source) => source.id === preferred)
            .map((source) => source.id),
          enabled: true,
          conditions: [{ kind: "part", value: "" }],
          attachmentTypes: [],
        },
  );
  const action = useAction();
  const updateCondition = (index: number, change: Partial<TextCondition>) =>
    setDraft({
      ...draft,
      conditions: draft.conditions.map((condition, i) =>
        i === index ? { ...condition, ...change } : condition,
      ),
    });
  const types: AttachmentType[] = [
    "image",
    "video",
    "audio",
    "voice",
    "document",
    "sticker",
    "animation",
    "other",
  ];
  return (
    <form
      class="card form"
      onSubmit={(event) => {
        event.preventDefault();
        void action.run(async () => {
          await api(initial ? "/rules/" + initial.id : "/rules", {
            method: initial ? "PUT" : "POST",
            body: draft,
          });
          navigate("/rules");
        });
      }}
    >
      <ErrorNotice message={action.error} />
      <fieldset>
        <legend>Sources ({draft.sourceIds.length} selected)</legend>
        <p>
          Edits and enabling or disabling this rule apply to every assigned
          source.
        </p>
        {sources.map((source) => (
          <label class="check" key={source.id}>
            <input
              type="checkbox"
              checked={draft.sourceIds.includes(source.id)}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  sourceIds: event.currentTarget.checked
                    ? [...draft.sourceIds, source.id]
                    : draft.sourceIds.filter((id) => id !== source.id),
                })
              }
            />
            {source.name}
            {source.enabled ? "" : " (disabled)"}
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Text conditions</legend>
        <p class="muted">
          Every condition must pass. Matching ignores letter case and preserves
          accents.
        </p>
        {draft.conditions.map((condition, index) => (
          <div class="condition-editor" key={index}>
            <label class="field">
              Condition {index + 1} type
              <select
                value={condition.kind}
                onChange={(event) =>
                  updateCondition(index, {
                    kind: event.currentTarget.value as TextCondition["kind"],
                  })
                }
              >
                {Object.entries(conditionLabels).map(([kind, label]) => (
                  <option value={kind} key={kind}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label class="field">
              {condition.kind === "hashtag"
                ? "Tag, with or without #"
                : "Text to match"}
              <input
                required
                maxLength={500}
                value={condition.value}
                onInput={(event) =>
                  updateCondition(index, { value: event.currentTarget.value })
                }
                autoComplete="off"
              />
            </label>
            {draft.conditions.length > 1 && (
              <button
                type="button"
                class="danger subtle"
                onClick={() =>
                  setDraft({
                    ...draft,
                    conditions: draft.conditions.filter((_, i) => i !== index),
                  })
                }
              >
                Remove condition {index + 1}
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          disabled={draft.conditions.length >= 20}
          onClick={() =>
            setDraft({
              ...draft,
              conditions: [...draft.conditions, { kind: "part", value: "" }],
            })
          }
        >
          Add condition
        </button>
      </fieldset>
      <fieldset>
        <legend>Attachment condition (optional)</legend>
        <p class="muted">
          Leave all unchecked to match text alone. Select Image to require text
          and an image. With several types selected, one selected type is
          sufficient.
        </p>
        <div class="attachment-options">
          {types.map((type) => (
            <label class="check" key={type}>
              <input
                type="checkbox"
                checked={draft.attachmentTypes.includes(type)}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    attachmentTypes: event.currentTarget.checked
                      ? [...draft.attachmentTypes, type]
                      : draft.attachmentTypes.filter((t) => t !== type),
                  })
                }
              />
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </label>
          ))}
        </div>
      </fieldset>
      <div class="actions">
        <button type="submit" class="primary" disabled={action.busy}>
          {action.busy ? "Saving…" : "Save rule"}
        </button>
        <Link class="button" href="/rules">
          Cancel
        </Link>
      </div>
      <p class="footnote">
        Changes apply to future processing, including recovered messages. Stored
        matches keep their original rule names.
      </p>
    </form>
  );
}

function MatchCard({ match }: { match: Match }) {
  return (
    <article class="card match-card">
      <div class="card-heading">
        <h2>
          <Link href={"/matches/" + match.id}>{match.sourceName}</Link>
        </h2>
        <span
          class={
            "badge " + (match.delivery?.status === "failed" ? "bad" : "neutral")
          }
        >
          {match.delivery?.status === "sent"
            ? "SMTP accepted"
            : match.delivery?.status === "failed"
              ? "Email failed"
              : "Email pending"}
        </span>
      </div>
      <p class="muted">{utc(match.messageTime)}</p>
      <p class="message-preview">
        {match.text
          ? match.text.slice(0, 280) + (match.text.length > 280 ? "…" : "")
          : "No text available"}
      </p>
      <div class="tags" aria-label="Matched rules">
        {match.ruleNames.map((name, index) => (
          <span class="tag" key={index}>
            {name}
          </span>
        ))}
      </div>
      <Link class="detail-link" href={"/matches/" + match.id}>
        View match <span aria-hidden="true">›</span>
      </Link>
    </article>
  );
}
export function MatchesPage() {
  const [page, setPage] = useState(1);
  const remote = useRemote<Page<Match>>(`/matches?page=${page}`, true);
  usePageClamp(remote.data, setPage);
  return (
    <>
      <PageHeading
        title="Matched Messages"
        description="Saved notifications, newest first. All times are UTC."
      />
      <ErrorNotice message={remote.error} onRetry={remote.refresh} />
      {remote.loading ? (
        <Loading />
      ) : remote.data?.items.length ? (
        <>
          <div class="stack">
            {remote.data.items.map((match) => (
              <MatchCard key={match.id} match={match} />
            ))}
          </div>
          <Pager data={remote.data} onPage={setPage} />
        </>
      ) : (
        remote.data && (
          <Empty title="No matched messages">
            Enabled sources and rules will add matching messages here.
          </Empty>
        )
      )}
    </>
  );
}
export function MatchDetail({ id }: { id: string }) {
  const remote = useRemote<Match>("/matches/" + id, true);
  const action = useAction();
  const match = remote.data;
  const sender = match?.sender;
  return (
    <>
      <Link class="back-link" href="/matches">
        ‹ Matched Messages
      </Link>
      <PageHeading title="Match details" />
      <ErrorNotice
        message={action.error || remote.error}
        onRetry={remote.error ? remote.refresh : undefined}
      />
      {remote.loading ? (
        <Loading />
      ) : (
        match && (
          <>
            <article class="card">
              <h2>{match.sourceName}</h2>
              <dl class="details">
                <div>
                  <dt>Sender</dt>
                  <dd>
                    {[
                      sender?.name,
                      sender?.username ? "@" + sender.username : undefined,
                      sender?.id,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Unavailable"}
                  </dd>
                </div>
                <div>
                  <dt>Message time</dt>
                  <dd>{utc(match.messageTime)}</dd>
                </div>
                <div>
                  <dt>Match time</dt>
                  <dd>{utc(match.matchedAt)}</dd>
                </div>
                <div>
                  <dt>Matched rules</dt>
                  <dd>{match.ruleNames.join(", ")}</dd>
                </div>
                <div>
                  <dt>Source link</dt>
                  <dd>
                    {match.url && /^https?:\/\//.test(match.url) ? (
                      <a
                        href={match.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open Telegram message ↗
                      </a>
                    ) : (
                      "Unavailable"
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Attachments</dt>
                  <dd>
                    {match.attachments.length
                      ? match.attachments
                          .map(
                            (a) => a.type + (a.name ? " (" + a.name + ")" : ""),
                          )
                          .join(", ")
                      : "None"}
                  </dd>
                </div>
              </dl>
              <div class="message-body">
                {match.text || "No text available"}
              </div>
            </article>
            <section class="card" aria-labelledby="delivery-title">
              <h2 id="delivery-title">Email delivery</h2>
              <Delivery
                job={match.delivery}
                busy={action.busy}
                onRetry={() =>
                  action.run(async () => {
                    await api("/jobs/" + match.delivery!.id + "/retry", {
                      method: "POST",
                      body: {},
                    });
                    remote.refresh();
                  })
                }
              />
              <p class="footnote">
                SMTP acceptance does not confirm inbox delivery. An uncertain
                send result can cause a duplicate email.
              </p>
            </section>
            <section class="card">
              <h2>Delete stored match</h2>
              <p>
                This keeps the Telegram message and any email already queued.
              </p>
              <button
                type="button"
                class="danger"
                disabled={action.busy}
                onClick={() => {
                  if (
                    confirm(
                      "Delete this stored match? Telegram content and queued email will be kept.",
                    )
                  )
                    void action.run(async () => {
                      await api("/matches/" + id, { method: "DELETE" });
                      navigate("/matches");
                    });
                }}
              >
                Delete match
              </button>
            </section>
          </>
        )
      )}
    </>
  );
}

export function ConnectorsPage({ status }: { status?: ConnectorStatus }) {
  return (
    <>
      <Link class="back-link" href="/more">
        ‹ More
      </Link>
      <PageHeading
        title="Connectors"
        description="Telegram monitoring from your personal account."
      />
      <section class="card">
        <div class="card-heading">
          <h2>Telegram</h2>
          <Status state={status?.state} />
        </div>
        {status?.retryAt && (
          <p class="muted">Next connection attempt {utc(status.retryAt)}</p>
        )}
        <p>
          {status?.state === "connected"
            ? "The connector is authorized. Monitoring and recovery run while the application is running."
            : "Use the CLI to authorize or reconnect this account."}
        </p>
        <h3>Connect or reconnect</h3>
        <p>
          Obtain your application ID and hash from{" "}
          <a
            href="https://my.telegram.org"
            target="_blank"
            rel="noopener noreferrer"
          >
            my.telegram.org ↗
          </a>
          , add them to the protected configuration, and run:
        </p>
        <pre class="command">
          {status?.instruction ||
            "MONITOR_CONFIG=/absolute/path/config.json npm run setup:telegram"}
        </pre>
        <p>
          Scan the QR code in Telegram’s device settings. Complete two-step
          verification in the terminal if requested, then restart the
          application.
        </p>
        {status?.capabilities && (
          <>
            <h3>Monitoring support</h3>
            <ul class="plain-list">
              <li>
                History recovery:{" "}
                {status.capabilities.history ? "Available" : "Unavailable"}
              </li>
              <li>
                Forum topics:{" "}
                {status.capabilities.topics ? "Available" : "Unavailable"}
              </li>
              <li>
                Attachment metadata:{" "}
                {status.capabilities.attachmentMetadata
                  ? "Available"
                  : "Unavailable"}
              </li>
            </ul>
          </>
        )}
        <p class="footnote">
          Recovery includes all available messages after the saved position.
          Deleted or inaccessible messages cannot be recovered. Media content is
          not downloaded.
        </p>
      </section>
    </>
  );
}

export function ActivityPage() {
  const [view, setView] = useState(
    new URLSearchParams(location.search).get("view") === "delivery"
      ? "delivery"
      : "events",
  );
  const [page, setPage] = useState(1);
  const events = useRemote<Page<Activity>>(
    view === "events" ? `/activity?page=${page}` : null,
    true,
  );
  const jobs = useRemote<Page<EmailJob>>(
    view === "delivery" ? `/jobs?page=${page}` : null,
    true,
  );
  const action = useAction();
  const remote = view === "events" ? events : jobs;
  usePageClamp(remote.data, setPage);
  return (
    <>
      <Link class="back-link" href="/more">
        ‹ More
      </Link>
      <PageHeading
        title="Activity Log"
        description="Operational incidents and durable email delivery."
      />
      <div class="segmented" role="group" aria-label="Activity view">
        <button
          type="button"
          class={view === "events" ? "selected" : ""}
          aria-pressed={view === "events"}
          onClick={() => {
            setView("events");
            setPage(1);
          }}
        >
          Events
        </button>
        <button
          type="button"
          class={view === "delivery" ? "selected" : ""}
          aria-pressed={view === "delivery"}
          onClick={() => {
            setView("delivery");
            setPage(1);
          }}
        >
          Email delivery
        </button>
      </div>
      <ErrorNotice
        message={action.error || remote.error}
        onRetry={remote.error ? remote.refresh : undefined}
      />
      {remote.loading ? (
        <Loading />
      ) : view === "events" ? (
        events.data?.items.length ? (
          <>
            <div class="stack">
              {events.data.items.map((event) => (
                <article class="card" key={event.id}>
                  <div class="card-heading">
                    <h2>{event.code.replaceAll("_", " ")}</h2>
                    <span
                      class={
                        "badge " +
                        (event.level === "error" && !event.resolvedAt
                          ? "bad"
                          : "neutral")
                      }
                    >
                      {event.level === "info"
                        ? "Info"
                        : event.resolvedAt
                          ? "Resolved"
                          : "Open incident"}
                    </span>
                  </div>
                  <p>{event.message}</p>
                  <p class="muted">
                    {event.occurrences}{" "}
                    {event.occurrences === 1 ? "occurrence" : "occurrences"} ·
                    Last seen {utc(event.lastSeenAt)}
                  </p>
                  <p class="muted">
                    Opened {utc(event.openedAt)}
                    {event.resolvedAt
                      ? " · Resolved " + utc(event.resolvedAt)
                      : ""}
                  </p>
                </article>
              ))}
            </div>
            <Pager data={events.data} onPage={setPage} />
          </>
        ) : (
          events.data && (
            <Empty title="No activity yet">
              Connection and delivery incidents will appear here.
            </Empty>
          )
        )
      ) : jobs.data?.items.length ? (
        <>
          <div class="stack">
            {jobs.data.items.map((job) => (
              <article class="card" key={job.id}>
                <h2>
                  {job.kind === "match"
                    ? "Match notification"
                    : "Incident alert"}
                </h2>
                <Delivery
                  job={job}
                  busy={action.busy}
                  onRetry={() =>
                    action.run(async () => {
                      await api("/jobs/" + job.id + "/retry", {
                        method: "POST",
                        body: {},
                      });
                      jobs.refresh();
                    })
                  }
                />
              </article>
            ))}
          </div>
          <Pager data={jobs.data} onPage={setPage} />
          <p class="footnote">
            SMTP accepted means the SMTP server accepted the email. Inbox
            delivery is outside the application’s control.
          </p>
        </>
      ) : (
        jobs.data && (
          <Empty title="No email jobs">
            Matches and incidents create durable delivery jobs.
          </Empty>
        )
      )}
    </>
  );
}

export function SettingsPage({ onLogout }: { onLogout: () => void }) {
  const remote = useRemote<SafeSettings>("/settings");
  const action = useAction();
  return (
    <>
      <Link class="back-link" href="/more">
        ‹ More
      </Link>
      <PageHeading
        title="Settings"
        description="Connection and access configuration."
      />
      <ErrorNotice
        message={action.error || remote.error}
        onRetry={remote.error ? remote.refresh : undefined}
      />
      {remote.loading ? (
        <Loading />
      ) : (
        remote.data && (
          <section class="card">
            <h2>Application</h2>
            <dl class="details">
              <div>
                <dt>Public origin</dt>
                <dd>{remote.data.publicOrigin}</dd>
              </div>
              <div>
                <dt>Timezone</dt>
                <dd>{remote.data.timezone}</dd>
              </div>
              <div>
                <dt>Telegram credentials</dt>
                <dd>
                  {remote.data.telegramConfigured
                    ? "Configured"
                    : "Not configured"}
                </dd>
              </div>
              <div>
                <dt>SMTP</dt>
                <dd>
                  {remote.data.smtpConfigured ? "Configured" : "Not configured"}
                </dd>
              </div>
              <div>
                <dt>Session duration</dt>
                <dd>{remote.data.sessionDays} days</dd>
              </div>
            </dl>
            <p class="footnote">
              Passwords, Telegram credentials, SMTP details, and storage paths
              are managed in the protected configuration file. Restart the
              application after changing that file.
            </p>
          </section>
        )
      )}
      <section class="card">
        <h2>Access</h2>
        <p>Sign out of this browser to invalidate its session.</p>
        <button
          type="button"
          disabled={action.busy}
          onClick={() =>
            action.run(async () => {
              await api("/logout", { method: "POST", body: {} });
              onLogout();
            })
          }
        >
          {action.busy ? "Signing out…" : "Sign out"}
        </button>
      </section>
    </>
  );
}
export function MorePage() {
  return (
    <>
      <PageHeading title="More" />
      <nav class="card menu" aria-label="More pages">
        <Link href="/posts">
          <span>
            <strong>Posts</strong>
            <small>Create and publish text and images</small>
          </span>
          <span aria-hidden="true">›</span>
        </Link>
        <Link href="/schedules">
          <span>
            <strong>Schedules</strong>
            <small>Recurring publications in UTC</small>
          </span>
          <span aria-hidden="true">›</span>
        </Link>
        <Link href="/connectors">
          <span>
            <strong>Connectors</strong>
            <small>Connection status and CLI setup</small>
          </span>
          <span aria-hidden="true">›</span>
        </Link>
        <Link href="/activity">
          <span>
            <strong>Activity Log</strong>
            <small>Incidents and email delivery</small>
          </span>
          <span aria-hidden="true">›</span>
        </Link>
        <Link href="/settings">
          <span>
            <strong>Settings</strong>
            <small>Configuration and sign out</small>
          </span>
          <span aria-hidden="true">›</span>
        </Link>
      </nav>
      <p class="footnote">One Telegram account · All times are UTC</p>
    </>
  );
}
