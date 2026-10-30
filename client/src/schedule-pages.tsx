import { confirmAction } from "./dialog";
import { Button } from "./web-awesome";
import { EntityList, type BulkAction } from "./entity-list";
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
  const bulkActions: BulkAction<Schedule>[] = [
    {
      label: "Delete",
      eligible: (schedule) => !schedule.blockedRunId,
      confirm:
        "Future runs stop. Posts, Telegram messages and publication history remain.",
      run: (schedule) => api(`/schedules/${schedule.id}`, { method: "DELETE" }),
    },
    ...[true, false].map((paused) => ({
      label: paused ? "Pause" : "Resume",
      eligible: (schedule: Schedule) => schedule.paused !== paused,
      run: (schedule: Schedule) =>
        api(`/schedules/${schedule.id}`, { method: "PATCH", body: { paused } }),
    })),
  ];
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
      <EntityList
        data={remote.data}
        loading={remote.loading}
        error={remote.error}
        refresh={remote.refresh}
        onPage={setPage}
        scope={page}
        actions={bulkActions}
        itemLabel={(schedule) => scheduleHeading(schedule)}
        renderItem={(schedule) => (
          <ScheduleCard schedule={schedule} refresh={remote.refresh} />
        )}
        emptyTitle="No schedules yet"
        emptyDescription={
          "Create a post, then choose its destination and recurring time."
        }
      />
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
    <wa-card role="article" class="card">
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
        <Button
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
        </Button>
        <Button
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
        </Button>
        {!schedule.blockedRunId && (
          <Link class="button" href={`/schedules/${schedule.id}/edit`}>
            Edit schedule
          </Link>
        )}
        <Button
          type="button"
          disabled={action.busy || !!schedule.blockedRunId}
          onClick={async () => {
            if (
              !(await confirmAction(
                `Delete “${scheduleHeading(schedule)}”? Future runs stop. The post, Telegram messages and publication history are retained.`,
              ))
            )
              return;
            void action.run(async () => {
              await api(`/schedules/${schedule.id}`, { method: "DELETE" });
              refresh();
            });
          }}
        >
          Delete schedule
        </Button>
        <Link class="button" href={`/posts/${schedule.postId}/edit`}>
          Edit post
        </Link>
      </div>
      <p class="footnote">
        Run Now works while paused and preserves the next recurring time.
      </p>
    </wa-card>
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
        <wa-card class="card">
          <div class="field">
            <wa-select
              label="Post"
              required
              value={postId}
              onChange={(event) => setPostId(String(event.currentTarget.value))}
            >
              <wa-option value="">Choose a post</wa-option>
              {postId &&
                !posts.data?.items.some((post) => post.id === postId) && (
                  <wa-option value={postId}>
                    Current post (outside this page)
                  </wa-option>
                )}
              {posts.data?.items.map((post) => (
                <wa-option key={post.id} value={post.id}>
                  {postHeading(post)}
                </wa-option>
              ))}
            </wa-select>
          </div>
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
          <div class="field">
            <wa-select
              label="Repeat"
              value={frequency}
              onChange={(event) =>
                setFrequency(
                  event.currentTarget.value as CalendarSchedule["frequency"],
                )
              }
            >
              <wa-option value="daily">Daily</wa-option>
              <wa-option value="weekly">Weekly</wa-option>
              <wa-option value="monthly">Monthly</wa-option>
            </wa-select>
          </div>
          <div class="field">
            <wa-input
              label="Time (UTC)"
              type="time"
              required
              value={time}
              onInput={(event) => setTime(String(event.currentTarget.value))}
            ></wa-input>
          </div>
          {frequency === "weekly" && (
            <div class="field">
              <wa-select
                label="Weekday"
                value={String(weekday)}
                onChange={(event) =>
                  setWeekday(Number(event.currentTarget.value))
                }
              >
                {weekdays.map((name, index) => (
                  <wa-option value={String(index)} key={name}>
                    {name}
                  </wa-option>
                ))}
              </wa-select>
            </div>
          )}
          {frequency === "monthly" && (
            <div class="field">
              <wa-input
                label="Day of month"
                type="number"
                required
                min={1}
                max={31}
                value={String(day)}
                onInput={(event) => setDay(Number(event.currentTarget.value))}
              >
                <small slot="hint">
                  Short months use their last day; later months retain this
                  original day.
                </small>
              </wa-input>
            </div>
          )}
          <div class="actions">
            <Button
              variant="brand"
              appearance="accent"
              type="submit"
              class="primary"
              disabled={
                action.busy ||
                !postId ||
                (!id && !sourceId) ||
                !!remote.data?.blockedRunId
              }
            >
              {id ? "Save schedule" : "Create schedule"}
            </Button>
            <Link class="button" href="/schedules">
              Cancel
            </Link>
          </div>
        </wa-card>
      </form>
    </>
  );
}
