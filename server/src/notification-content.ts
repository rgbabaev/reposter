import type { Match } from "@monitor/shared";
export const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
export function matchReport(match: Match) {
  const sender =
    [
      match.sender?.name,
      match.sender?.username ? "@" + match.sender.username : undefined,
      match.sender?.id,
    ]
      .filter(Boolean)
      .join(" · ") || "Unavailable";
  const link =
    match.url && /^https?:\/\//.test(match.url) ? match.url : undefined;
  const text = `Source: ${match.sourceName}\nSender: ${sender}\nMessage time: ${match.messageTime} UTC\nMatched: ${match.matchedAt} UTC\nRules: ${match.ruleNames.join(", ")}\nLink: ${link || "Unavailable"}\n\n${match.text}`;
  const html = `<h1>Monitoring match</h1><p><b>Source:</b> ${escapeHtml(match.sourceName)}</p><p><b>Sender:</b> ${escapeHtml(sender)}</p><p><b>Message time:</b> ${escapeHtml(match.messageTime)} UTC</p><p><b>Matched:</b> ${escapeHtml(match.matchedAt)} UTC</p><p><b>Rules:</b> ${match.ruleNames.map(escapeHtml).join(", ")}</p><p>${link ? '<a href="' + escapeHtml(link) + '">Open source message</a>' : "Source link: Unavailable"}</p><pre style="white-space:pre-wrap">${escapeHtml(match.text)}</pre>`;
  return {
    subject:
      "Monitoring match: " +
      Array.from(match.sourceName.replace(/[\r\n]/g, " "))
        .slice(0, 150)
        .join(""),
    text,
    html,
  };
}
export function incidentReport(
  payload: { code: string; message: string; openedAt: string },
  incident?: { occurrences: number; last_seen_at: string },
) {
  const text = `${payload.message}\nCode: ${payload.code}\nOpened: ${payload.openedAt} UTC\nOccurrences: ${incident?.occurrences || 1}\nLast seen: ${incident?.last_seen_at || payload.openedAt} UTC`;
  return {
    subject:
      "Personal Monitor incident: " +
      String(payload.code).replace(/[^A-Z_]/g, ""),
    text,
    html: "<pre>" + escapeHtml(text) + "</pre>",
  };
}
export function notificationReportId(text: string): string | undefined {
  return /^[^\n]*\nReport: ([a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}) · Part \d+\/\d+\n\n/u.exec(
    text,
  )?.[1];
}
