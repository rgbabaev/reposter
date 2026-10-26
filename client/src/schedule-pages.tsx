import { postHeading, scheduleHeading } from "@monitor/shared";
import { useEffect, useState } from "preact/hooks";
import type {
  CalendarSchedule,
  Page,
  Post,
  Schedule,
  Source,
} from "@monitor/shared";
import { api, useAction, useRemote, utc } from "./api";
import {
  Empty,
  ErrorNotice,
  Link,
  Loading,
  navigate,
  PageHeading,
  Pager,
} from "./components";
import { DestinationSelect } from "./publication-pages";

const weekdays = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
function describe(calendar: CalendarSchedule) {
  const time = `${String(calendar.hour).padStart(2, "0")}:${String(calendar.minute).padStart(2, "0")} UTC`;
  return calendar.frequency === "daily"
    ? `Daily at ${time}`
    : calendar.frequency === "weekly"
      ? `${weekdays[calendar.weekday!]} at ${time}`
      : `Day ${calendar.day} of each month at ${time} (clamped to month end)`;
}
export function SchedulesPage() {
  const [page, setPage] = useState(1);
  const remote = useRemote<Page<Schedule>>(`/schedules?page=${page}`, true);
  return (
    <>
      <PageHeading
        title="Schedules"
        description="Recurring publication and replacement in UTC."
        action={
          <Link class="button primary" href="/schedules/new">
            New schedule
          </Link>
        }
      />
      <ErrorNotice message={remote.error} onRetry={remote.refresh} />
      {remote.loading && <Loading />}
      {remote.data && (
        <>
          {!remote.data.items.length && (
            <Empty title="No schedules yet">
              Create a post, then choose its destination and recurring time.
            </Empty>
          )}
          <div class="stack">
            {remote.data.items.map((schedule) => (
              <ScheduleCard
                key={schedule.id}
                schedule={schedule}
                refresh={remote.refresh}
              />
            ))}
          </div>
          <Pager data={remote.data} onPage={setPage} />
        </>
      )}
      <Link class="button" href="/publications">
        Publication history
      </Link>
    </>
  );
}
function ScheduleCard({
  schedule,
  refresh,
}: {
  schedule: Schedule;
  refresh: () => void;
}) {
  const action = useAction();
  return (
    <article class="card">
      <h2>{scheduleHeading(schedule)}</h2>
      <p>
        {schedule.destination.name} ·{" "}
        <strong>{schedule.paused ? "Paused" : "Active"}</strong>
      </p>
      <p>{describe(schedule.calendar)}</p>
      <p>
        Next recurring time: {utc(schedule.nextRunAt)}
        {schedule.paused ? " · Waiting until resumed" : ""}
      </p>
      <p class="muted">
        Each run deletes this schedule's previous publication before sending its
        replacement.
      </p>
      {schedule.blockedRunId && (
        <p role="status">
          A run is unfinished.{" "}
          <Link href="/publications">Check publication history</Link> before
          starting another.
        </p>
      )}
      <ErrorNotice message={action.error} />
      <div class="actions">
        <button
          type="button"
          disabled={action.busy}
          onClick={() =>
            void action.run(async () => {
              await api(`/schedules/${schedule.id}`, {
                method: "PATCH",
                body: { paused: !schedule.paused },
              });
              refresh();
            })
          }
        >
          {schedule.paused ? "Resume" : "Pause"}
        </button>
        <button
          type="button"
          disabled={action.busy}
          onClick={() =>
            void action.run(async () => {
              await api(`/schedules/${schedule.id}/run`, { method: "POST" });
              navigate("/publications");
            })
          }
        >
          Run Now
        </button>
        {!schedule.blockedRunId && (
          <Link class="button" href={`/schedules/${schedule.id}/edit`}>
            Edit schedule
          </Link>
        )}
        <button
          type="button"
          disabled={action.busy || !!schedule.blockedRunId}
          onClick={() => {
            if (
              !confirm(
                `Delete “${scheduleHeading(schedule)}”? Future runs stop. The post, Telegram messages and publication history are retained.`,
              )
            )
              return;
            void action.run(async () => {
              await api(`/schedules/${schedule.id}`, { method: "DELETE" });
              refresh();
            });
          }}
        >
          Delete schedule
        </button>
        <Link class="button" href={`/posts/${schedule.postId}/edit`}>
          Edit post
        </Link>
      </div>
      <p class="footnote">
        Run Now works while paused and preserves the next recurring time.
      </p>
    </article>
  );
}
export function ScheduleEditorPage({ id }: { id?: string }) {
  const remote = useRemote<Schedule>(id ? `/schedules/${id}` : null);
  const action = useAction();
  const [postPage, setPostPage] = useState(1);
  const posts = useRemote<Page<Post>>(`/posts?page=${postPage}&pageSize=100`);
  const sources = useRemote<Page<Source>>("/sources?pageSize=100");
  const [postId, setPostId] = useState(() =>
    id ? "" : new URLSearchParams(location.search).get("post") || "",
  );
  const [sourceId, setSourceId] = useState("");
  const [frequency, setFrequency] =
    useState<CalendarSchedule["frequency"]>("daily");
  const [time, setTime] = useState("09:00");
  const [weekday, setWeekday] = useState(1);
  const [day, setDay] = useState(1);
  useEffect(() => {
    if (!remote.data) return;
    const schedule = remote.data;
    setPostId(schedule.postId);
    setFrequency(schedule.calendar.frequency);
    setTime(
      `${String(schedule.calendar.hour).padStart(2, "0")}:${String(schedule.calendar.minute).padStart(2, "0")}`,
    );
    setWeekday(schedule.calendar.weekday ?? 1);
    setDay(schedule.calendar.day ?? 1);
  }, [remote.data]);
  const assignedSource = sources.data?.items.find(
    (source) =>
      source.externalId === remote.data?.destination.externalId &&
      source.topicId === remote.data?.destination.topicId,
  );
  if (id && remote.loading) return <Loading />;
  if (id && !remote.data)
    return <ErrorNotice message={remote.error || "Schedule not found."} />;
  return (
    <>
      <PageHeading
        title={id ? "Edit schedule" : "New schedule"}
        description="One reusable post and one group or forum topic."
      />
      <ErrorNotice
        message={action.error || remote.error || posts.error || sources.error}
      />
      {(posts.loading || sources.loading) && <Loading />}
      {remote.data?.blockedRunId && (
        <p>
          A run is unfinished.{" "}
          <Link href="/publications">
            Cancel, retry or review it in publication history
          </Link>{" "}
          before editing.
        </p>
      )}
      <form
        class="card"
        onSubmit={(event) => {
          event.preventDefault();
          void action.run(async () => {
            const [hour, minute] = time.split(":").map(Number);
            await api(id ? `/schedules/${id}` : "/schedules", {
              method: id ? "PUT" : "POST",
              body: {
                postId,
                ...(sourceId ? { sourceId } : {}),
                calendar: {
                  frequency,
                  hour,
                  minute,
                  ...(frequency === "weekly" ? { weekday } : {}),
                  ...(frequency === "monthly" ? { day } : {}),
                },
              },
            });
            navigate("/schedules");
          });
        }}
      >
        <label class="field">
          Post
          <select
            required
            value={postId}
            onChange={(event) => setPostId(event.currentTarget.value)}
          >
            <option value="">Choose a post</option>
            {postId &&
              !posts.data?.items.some((post) => post.id === postId) && (
                <option value={postId}>Current post (outside this page)</option>
              )}
            {posts.data?.items.map((post) => (
              <option key={post.id} value={post.id}>
                {postHeading(post)}
              </option>
            ))}
          </select>
        </label>
        {posts.data && posts.data.total > posts.data.pageSize && (
          <Pager
            data={posts.data}
            onPage={(page) => {
              setPostPage(page);
              setPostId("");
            }}
          />
        )}
        {id && (
          <p>
            The previous publication is deleted at its original destination on
            the next run, even when the destination changes.
          </p>
        )}
        <DestinationSelect
          required={!id}
          placeholder={
            id && !assignedSource ? remote.data?.destination.name : undefined
          }
          sources={sources.data?.items || []}
          value={sourceId || assignedSource?.id || ""}
          onChange={setSourceId}
        />
        <label class="field">
          Repeat
          <select
            value={frequency}
            onChange={(event) =>
              setFrequency(
                event.currentTarget.value as CalendarSchedule["frequency"],
              )
            }
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
        <label class="field">
          Time (UTC)
          <input
            type="time"
            required
            value={time}
            onInput={(event) => setTime(event.currentTarget.value)}
          />
        </label>
        {frequency === "weekly" && (
          <label class="field">
            Weekday
            <select
              value={weekday}
              onChange={(event) =>
                setWeekday(Number(event.currentTarget.value))
              }
            >
              {weekdays.map((name, index) => (
                <option value={index} key={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}
        {frequency === "monthly" && (
          <label class="field">
            Day of month
            <input
              type="number"
              required
              min={1}
              max={31}
              value={day}
              onInput={(event) => setDay(Number(event.currentTarget.value))}
            />
            <small>
              Short months use their last day; later months retain this original
              day.
            </small>
          </label>
        )}
        <div class="actions">
          <button
            class="primary"
            disabled={
              action.busy ||
              !postId ||
              (!id && !sourceId) ||
              !!remote.data?.blockedRunId
            }
          >
            {id ? "Save schedule" : "Create schedule"}
          </button>
          <Link class="button" href="/schedules">
            Cancel
          </Link>
        </div>
      </form>
    </>
  );
}
