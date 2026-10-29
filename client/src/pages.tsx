import { Dialog } from "./dialog";
import { EntityList, usePageClamp, type BulkAction } from "./entity-list";
import { MatchImageGallery } from "./match-images";
import { ruleHeading } from "@monitor/shared";
import { useEffect, useState } from "preact/hooks";
import type {
  Activity,
  AttachmentType,
  ConnectorStatus,
  Dashboard as DashboardData,
  DiscoveredSource,
  NotificationJob,
  NotificationChannels,
  Match,
  MatchPage,
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
            <Link href="/activity?view=delivery" class="stat">
              <span>Pending Telegram reports</span>
              <strong>{data.pendingTelegramNotifications}</strong>
            </Link>
            <Link href="/activity?view=delivery" class="stat">
              <span>Failed Telegram reports</span>
              <strong>{data.failedTelegramNotifications}</strong>
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
  const bulkActions: BulkAction<Source>[] = [
    {
      label: "Delete",
      confirm:
        "Rule assignments are removed; stored matches and queued notifications are kept.",
      run: (source) => api(`/sources/${source.id}`, { method: "DELETE" }),
    },
    ...[false, true].map((enabled) => ({
      label: enabled ? "Enable" : "Disable",
      eligible: (source: Source) => source.enabled !== enabled,
      run: (source: Source) =>
        api(`/sources/${source.id}`, { method: "PATCH", body: { enabled } }),
    })),
  ];
  usePageClamp(discovered.data, setDiscoveryPage);
  function refreshSelected() {
    selected.refresh();
    all.refresh();
  }
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
        <EntityList
          data={selected.data}
          loading={selected.loading}
          error={selected.error}
          refresh={refreshSelected}
          onPage={setPage}
          scope={page}
          actions={bulkActions}
          itemLabel={(source) => source.name}
          renderItem={(source) => (
            <article class="card">
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
                <span class={"badge " + (source.enabled ? "good" : "neutral")}>
                  {source.enabled ? "Enabled" : "Disabled"}
                </span>
              </div>
              {source.error && (
                <p class="error-text">
                  Source access needs attention. Check Connectors and Activity
                  Log.
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
                  href={"/rules/new?source=" + encodeURIComponent(source.id)}
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
                        `Remove “${source.name}” and its rule assignments? Stored matches and queued notifications will be kept.`,
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
          )}
          emptyTitle="No monitored sources"
          emptyDescription={
            "Choose Add sources to select your first chat or forum topic."
          }
        />
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
  const bulkActions: BulkAction<Rule>[] = [
    {
      label: "Delete",
      confirm: "Existing matches are kept.",
      run: (rule) => api(`/rules/${rule.id}`, { method: "DELETE" }),
    },
    ...[false, true].map((enabled) => ({
      label: enabled ? "Enable" : "Disable",
      eligible: (rule: Rule) =>
        rule.enabled !== enabled && (!enabled || rule.sourceIds.length > 0),
      run: (rule: Rule) =>
        api(`/rules/${rule.id}`, { method: "PUT", body: { ...rule, enabled } }),
    })),
  ];
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
        message={action.error || sources.error}
        onRetry={sources.error ? sources.refresh : undefined}
      />
      <EntityList
        data={remote.data}
        loading={remote.loading}
        error={remote.error}
        refresh={remote.refresh}
        onPage={setPage}
        scope={page}
        actions={bulkActions}
        itemLabel={ruleHeading}
        renderItem={(rule) => (
          <article class="card">
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
        )}
        emptyTitle="No rules yet"
        emptyDescription={
          "Add a source, then create a rule with at least one text condition."
        }
      />
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
        <div class="tags" aria-label="Notification delivery">
          {(match.deliveries ?? (match.delivery ? [match.delivery] : [])).map(
            (job) => (
              <span
                key={job.id}
                class={`badge ${job.status === "failed" ? "bad" : job.status === "sent" ? "good" : "neutral"}`}
              >
                {job.channel === "telegram" ? "Telegram" : "Email"}{" "}
                {job.status === "sent" ? "accepted" : job.status}
              </span>
            ),
          )}
        </div>
      </div>
      <p class="muted">{utc(match.messageTime)}</p>
      <p class="message-preview">
        {match.text
          ? match.text.slice(0, 280) + (match.text.length > 280 ? "…" : "")
          : "No text available"}
      </p>
      <MatchImageGallery match={match} />
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
  const [filterOpen, setFilterOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [text, setText] = useState("");
  const [rules, setRules] = useState<string[]>([]);
  const [filters, setFilters] = useState<{ text: string; rules: string[] }>({ text: "", rules: [] });
  const parameters = new URLSearchParams({ page: String(page), text: filters.text });
  filters.rules.forEach((rule) => parameters.append("rule", rule));
  const query = parameters.toString();
  const remote = useRemote<MatchPage>(`/matches?${query}`, true);
  const [ruleNames, setRuleNames] = useState<string[]>([]);
  useEffect(() => {
    if (remote.data) setRuleNames(remote.data.ruleNames);
  }, [remote.data]);
  const filtered = !!(filters.text || filters.rules.length);
  const bulkActions: BulkAction<Match>[] = [
    {
      label: "Delete",
      confirm: "Telegram messages and queued notifications are kept.",
      run: (match) => api(`/matches/${match.id}`, { method: "DELETE" }),
    },
  ];
  return (
    <>
      <PageHeading
        title="Matched Messages"
        description="Saved notifications, newest first. All times are UTC."
      />
      <EntityList
        data={remote.data}
        loading={remote.loading}
        error={remote.error}
        refresh={remote.refresh}
        onPage={setPage}
        scope={query}
        actions={bulkActions}
        filters={
          <button type="button" class={filtered ? "filter-button active" : "filter-button"}
            aria-haspopup="dialog" aria-label={filtered ? "Filter, filters are on" : "Filter"}
            onClick={() => {
            setText(filters.text);
            setRules([...filters.rules]);
            setFilterOpen(true);
          }}>
            Filter{filtered && <span class="filter-status" aria-hidden="true">On</span>}
          </button>
        }
        itemLabel={(match) => match.sourceName}
        renderItem={(match) => <MatchCard match={match} />}
        emptyTitle={filtered ? "No matches for these filters" : "No matched messages"}
        emptyDescription={
          filtered ? "Change or clear the filters to see more matches." : "Enabled sources and rules will add matching messages here."
        }
      />
      {filterOpen && <Dialog class="match-filter-dialog" aria-labelledby="match-filter-title"
        onClose={() => setFilterOpen(false)}>
        <form onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setFilters({ text: text.trim(), rules });
          setFilterOpen(false);
        }}>
          <h2 id="match-filter-title">Filter matches</h2>
          <div class="field">
            <label for="match-text">Message text</label>
            <input id="match-text" type="search" value={text}
              onInput={(event) => setText(event.currentTarget.value)} />
          </div>
          <fieldset class="match-rule-options">
            <legend>Matched rules</legend>
            <p class="muted">Match any selected rule. Leave all unchecked for all rules.</p>
            {ruleNames.map((name) => (
              <label class="check" key={name}>
                <input type="checkbox" checked={rules.includes(name)}
                  onChange={(event) => {
                    const checked = event.currentTarget.checked;
                    setRules((selected) => checked
                      ? [...selected, name]
                      : selected.filter((rule) => rule !== name));
                  }} />
                {name}
              </label>
            ))}
            {!ruleNames.length && <p>No saved rules</p>}
          </fieldset>
          <div class="actions">
            <button type="submit">Apply filters</button>
            <button type="button" onClick={() => {
              setText("");
              setRules([]);
              setFilters({ text: "", rules: [] });
              setPage(1);
              setFilterOpen(false);
            }}>Clear filters</button>
            <button type="button" onClick={() => setFilterOpen(false)}>Cancel</button>
          </div>
        </form>
      </Dialog>}
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
              <MatchImageGallery match={match} />
            </article>
            <section class="card" aria-labelledby="delivery-title">
              <h2 id="delivery-title">Notification delivery</h2>
              {(
                match.deliveries ?? (match.delivery ? [match.delivery] : [])
              ).map((job) => (
                <div key={job.id}>
                  <h3>
                    {job.channel === "telegram" ? "Telegram report" : "Email"}
                  </h3>
                  <Delivery
                    job={job}
                    busy={action.busy}
                    onRetry={() =>
                      action.run(async () => {
                        await api("/jobs/" + job.id + "/retry", {
                          method: "POST",
                          body: {},
                        });
                        remote.refresh();
                      })
                    }
                  />
                </div>
              ))}
              <p class="footnote">
                Accepted means the provider accepted the report. It does not
                confirm it was read. An uncertain send result can cause a
                duplicate notification.
              </p>
            </section>
            <section class="card">
              <h2>Delete stored match</h2>
              <p>
                This keeps the Telegram message and any notifications already
                queued.
              </p>
              <button
                type="button"
                class="danger"
                disabled={action.busy}
                onClick={() => {
                  if (
                    confirm(
                      "Delete this stored match? Telegram content and queued notifications will be kept.",
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
  const jobs = useRemote<Page<NotificationJob>>(
    view === "delivery" ? `/jobs?page=${page}` : null,
    true,
  );
  const action = useAction();
  const eventBulkActions: BulkAction<Activity>[] = [
    {
      label: "Delete",
      eligible: (event) => event.level === "info" || !!event.resolvedAt,
      confirm:
        "Only informational and resolved events can be deleted. Pending alerts are retained.",
      run: (event) => api(`/activity/${event.id}`, { method: "DELETE" }),
    },
  ];
  const jobBulkActions: BulkAction<NotificationJob>[] = [
    {
      label: "Delete",
      eligible: (job) => job.status === "sent",
      confirm: "Only accepted notification records are deleted.",
      run: (job) => api(`/jobs/${job.id}`, { method: "DELETE" }),
    },
    {
      label: "Retry",
      eligible: (job) => job.status === "failed",
      run: (job) => api(`/jobs/${job.id}/retry`, { method: "POST", body: {} }),
    },
  ];
  return (
    <>
      <Link class="back-link" href="/more">
        ‹ More
      </Link>
      <PageHeading
        title="Activity Log"
        description="Operational incidents and durable email and Telegram delivery."
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
          Notification delivery
        </button>
      </div>
      <ErrorNotice message={action.error} />
      {view === "events" ? (
        <EntityList
          key="events"
          data={events.data}
          loading={events.loading}
          error={events.error}
          refresh={events.refresh}
          onPage={setPage}
          scope={`${view}:${page}`}
          actions={eventBulkActions}
          itemLabel={(event) => event.code}
          renderItem={(event) => (
            <article class="card">
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
                {event.occurrences === 1 ? "occurrence" : "occurrences"} · Last
                seen {utc(event.lastSeenAt)}
              </p>
              <p class="muted">
                Opened {utc(event.openedAt)}
                {event.resolvedAt ? " · Resolved " + utc(event.resolvedAt) : ""}
              </p>
            </article>
          )}
          emptyTitle="No activity yet"
          emptyDescription={
            "Connection and delivery incidents will appear here."
          }
        />
      ) : (
        <>
          <EntityList
            key="delivery"
            data={jobs.data}
            loading={jobs.loading}
            error={jobs.error}
            refresh={jobs.refresh}
            onPage={setPage}
            scope={`${view}:${page}`}
            actions={jobBulkActions}
            itemLabel={(job) => `${job.channel} ${job.kind} notification`}
            renderItem={(job) => (
              <article class="card">
                <p class="muted">
                  {job.channel === "telegram" ? "Telegram report" : "Email"}
                </p>
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
            )}
            emptyTitle="No notification jobs"
            emptyDescription={
              "Matches and incidents create durable delivery jobs."
            }
          />
          {jobs.data?.items.length ? (
            <p class="footnote">
              Accepted means SMTP or Telegram accepted the notification.
              Delivery and reading are outside the application’s control.
            </p>
          ) : null}
        </>
      )}
    </>
  );
}

export function SettingsPage({ onLogout }: { onLogout: () => void }) {
  const remote = useRemote<SafeSettings>("/settings");
  const action = useAction();
  const [channels, setChannels] = useState<NotificationChannels>();
  const selectedChannels = channels ?? remote.data?.notificationChannels;
  const toggleChannel = (
    channel: keyof NotificationChannels,
    enabled: boolean,
  ) =>
    action.run(async () => {
      if (!selectedChannels) return;
      const previous = selectedChannels;
      setChannels({ ...previous, [channel]: enabled });
      try {
        setChannels(
          await api<NotificationChannels>("/settings/notifications", {
            method: "PATCH",
            body: { [channel]: enabled },
          }),
        );
      } catch (error) {
        setChannels(previous);
        throw error;
      }
    });
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
          <>
            <section class="card" aria-labelledby="notification-channels-title">
              <h2 id="notification-channels-title">Notification channels</h2>
              <p>
                Choose where to receive match and incident reports. Changes
                apply immediately and survive restart.
              </p>
              <fieldset disabled={action.busy}>
                <legend>Delivery channels</legend>
                <label class="check">
                  <input
                    type="checkbox"
                    checked={selectedChannels?.email ?? false}
                    onChange={(event) =>
                      void toggleChannel("email", event.currentTarget.checked)
                    }
                  />
                  Email notifications
                </label>
                <label class="check">
                  <input
                    type="checkbox"
                    checked={selectedChannels?.telegram ?? false}
                    disabled={!remote.data.telegramNotificationsConfigured}
                    onChange={(event) =>
                      void toggleChannel(
                        "telegram",
                        event.currentTarget.checked,
                      )
                    }
                  />
                  Telegram notifications
                </label>
              </fieldset>
              {!remote.data.telegramNotificationsConfigured && (
                <p class="muted">
                  Configure and enable Telegram reports in the protected
                  configuration file, then restart to make this switch
                  available.
                </p>
              )}
              {selectedChannels &&
                !selectedChannels.email &&
                !selectedChannels.telegram && (
                  <p role="status">
                    Both channels are off. Matches and incidents are still
                    stored.
                  </p>
                )}
              <p class="footnote">
                Off pauses queued delivery and stops new notifications for that
                channel. Re-enable to resume pending jobs. A send already in
                progress may finish.
              </p>
            </section>
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
                    {remote.data.smtpConfigured
                      ? "Configured"
                      : "Not configured"}
                  </dd>
                </div>
                <div>
                  <dt>Telegram reports</dt>
                  <dd>
                    {remote.data.telegramNotificationsConfigured
                      ? "Configured"
                      : "Not configured"}
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
          </>
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
            <small>Incidents and notification delivery</small>
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
