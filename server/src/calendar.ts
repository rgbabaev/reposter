import type { CalendarSchedule } from "@monitor/shared";
import { HttpError } from "./http.js";

export function validateCalendar(value: unknown): CalendarSchedule {
  if (!value || typeof value !== "object")
    throw new HttpError(400, "A UTC calendar schedule is required.");
  const input = value as Record<string, unknown>;
  const integer = (value: unknown, min: number, max: number) =>
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max;
  if (input.frequency === "hourly") {
    if (!integer(input.intervalHours, 1, 24))
      throw new HttpError(400, "Use a whole number of hours from 1 to 24.");
    return {
      frequency: "hourly",
      intervalHours: input.intervalHours as number,
    };
  }
  if (
    !["daily", "weekly", "monthly"].includes(String(input.frequency)) ||
    !integer(input.hour, 0, 23) ||
    !integer(input.minute, 0, 59) ||
    (input.frequency === "weekly" && !integer(input.weekday, 0, 6)) ||
    (input.frequency === "monthly" && !integer(input.day, 1, 31))
  )
    throw new HttpError(
      400,
      "Use a valid UTC time, weekday (0–6), or monthly day (1–31).",
    );
  return {
    frequency: input.frequency as "daily" | "weekly" | "monthly",
    hour: input.hour as number,
    minute: input.minute as number,
    ...(input.frequency === "weekly"
      ? { weekday: input.weekday as number }
      : {}),
    ...(input.frequency === "monthly" ? { day: input.day as number } : {}),
  };
}
export function nextOccurrence(
  calendar: CalendarSchedule,
  after: Date,
): string {
  if (calendar.frequency === "hourly") {
    const interval = calendar.intervalHours * 60 * 60 * 1000;
    return new Date(after.getTime() + interval).toISOString();
  }
  const year = after.getUTCFullYear(),
    month = after.getUTCMonth();
  let candidate: Date;
  if (calendar.frequency === "monthly") {
    const monthly = (offset: number) =>
      new Date(
        Date.UTC(
          year,
          month + offset,
          Math.min(
            calendar.day!,
            new Date(Date.UTC(year, month + offset + 1, 0)).getUTCDate(),
          ),
          calendar.hour,
          calendar.minute,
        ),
      );
    candidate = monthly(0);
    if (candidate <= after) candidate = monthly(1);
  } else {
    candidate = new Date(
      Date.UTC(year, month, after.getUTCDate(), calendar.hour, calendar.minute),
    );
    if (calendar.frequency === "weekly")
      candidate.setUTCDate(
        candidate.getUTCDate() +
          ((calendar.weekday! - candidate.getUTCDay() + 7) % 7),
      );
    if (candidate <= after)
      candidate.setUTCDate(
        candidate.getUTCDate() + (calendar.frequency === "weekly" ? 7 : 1),
      );
  }
  return candidate.toISOString();
}
