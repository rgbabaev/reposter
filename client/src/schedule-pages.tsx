import { useState } from "preact/hooks";
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
      <h2>{schedule.name}</h2>
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
export function ScheduleEditorPage() {
  const action = useAction();
  const [name, setName] = useState("");
  const [postPage, setPostPage] = useState(1);
  const posts = useRemote<Page<Post>>(`/posts?page=${postPage}&pageSize=100`);
  const sources = useRemote<Page<Source>>("/sources?pageSize=100");
  const [postId, setPostId] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [frequency, setFrequency] =
    useState<CalendarSchedule["frequency"]>("daily");
  const [time, setTime] = useState("09:00");
  const [weekday, setWeekday] = useState(1);
  const [day, setDay] = useState(1);
  return (
    <>
      <PageHeading
        title="New schedule"
        description="One reusable post and one group or forum topic."
      />
      <ErrorNotice message={action.error || posts.error || sources.error} />
      {(posts.loading || sources.loading) && <Loading />}
      <form
        class="card"
        onSubmit={(event) => {
          event.preventDefault();
          void action.run(async () => {
            const [hour, minute] = time.split(":").map(Number);
            await api("/schedules", {
              method: "POST",
              body: {
                name,
                postId,
                sourceId,
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
          Name
          <input
            required
            maxLength={120}
            value={name}
            onInput={(event) => setName(event.currentTarget.value)}
          />
        </label>
        <label class="field">
          Post
          <select
            required
            value={postId}
            onChange={(event) => setPostId(event.currentTarget.value)}
          >
            <option value="">Choose a post</option>
            {posts.data?.items.map((post) => (
              <option key={post.id} value={post.id}>
                {post.name}
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
        <DestinationSelect
          sources={sources.data?.items || []}
          value={sourceId}
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
            disabled={action.busy || !postId || !sourceId}
          >
            Create schedule
          </button>
          <Link class="button" href="/schedules">
            Cancel
          </Link>
        </div>
      </form>
    </>
  );
}
