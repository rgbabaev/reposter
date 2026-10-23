import type { IncomingMessage, ServerResponse } from "node:http";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(value));
}
export async function body(
  req: IncomingMessage,
  max = 64 * 1024,
): Promise<Record<string, unknown>> {
  if (!req.headers["content-type"]?.startsWith("application/json"))
    throw new HttpError(415, "Use application/json.");
  const length = Number(req.headers["content-length"]);
  if (Number.isFinite(length) && length > max)
    throw new HttpError(413, "Request is too large.");
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > max) {
      req.resume();
      throw new HttpError(413, "Request is too large.");
    }
    chunks.push(Buffer.from(chunk));
  }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "Expected a JSON object.");
  }
}
export function pagination(url: URL) {
  const page = Number(url.searchParams.get("page") || 1);
  const pageSize = Number(url.searchParams.get("pageSize") || 25);
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    page > 1000000 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100
  )
    throw new HttpError(400, "Invalid pagination.");
  return { page, pageSize };
}
export function securityHeaders(res: ServerResponse) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  );
}
