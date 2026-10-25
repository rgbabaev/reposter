import type { IncomingMessage, ServerResponse } from "node:http";
import { HttpError, body, json, pagination } from "./http.js";
import { postBodyLimit } from "./posts.js";
import { Publications } from "./publications.js";
import { Schedules } from "./schedules.js";

export class PublicationApi {
  constructor(
    private publications: Publications,
    private schedules: Schedules,
  ) {}
  async route(
    url: URL,
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<boolean> {
    const path = url.pathname;
    const { page, pageSize } = pagination(url);
    const posts = this.publications.posts;
    if (path === "/api/schedules" && req.method === "GET") {
      json(res, 200, this.schedules.list(page, pageSize));
      return true;
    }
    if (path === "/api/schedules" && req.method === "POST") {
      json(res, 201, this.schedules.create(await body(req)));
      return true;
    }
    const schedule = path.match(/^\/api\/schedules\/([^/]+)(?:\/(run))?$/);
    if (schedule && req.method === "GET" && !schedule[2]) {
      json(res, 200, this.schedules.get(schedule[1]!));
      return true;
    }
    if (schedule && req.method === "PUT" && !schedule[2]) {
      json(res, 200, this.schedules.update(schedule[1]!, await body(req)));
      return true;
    }
    if (schedule && req.method === "DELETE" && !schedule[2]) {
      this.schedules.remove(schedule[1]!);
      json(res, 200, { deleted: true });
      return true;
    }
    if (schedule && req.method === "PATCH" && !schedule[2]) {
      json(
        res,
        200,
        this.schedules.pause(schedule[1]!, (await body(req)).paused),
      );
      return true;
    }
    if (schedule && req.method === "POST" && schedule[2]) {
      json(res, 202, this.schedules.runNow(schedule[1]!));
      return true;
    }
    if (path === "/api/posts" && req.method === "GET") {
      json(res, 200, posts.list(page, pageSize));
      return true;
    }
    if (path === "/api/posts" && req.method === "POST") {
      json(res, 201, posts.save(await body(req, postBodyLimit)));
      return true;
    }
    const image = path.match(/^\/api\/post-images\/([^/]+)$/);
    if (image && req.method === "GET") {
      const file = posts.image(image[1]!);
      res.writeHead(200, {
        "Content-Type": file.mimeType,
        "Content-Length": file.data.length,
        "Cache-Control": "no-store",
        "Content-Disposition": 'inline; filename="' + file.name + '"',
      });
      res.end(file.data);
      return true;
    }
    const post = path.match(/^\/api\/posts\/([^/]+)$/);
    if (post && req.method === "GET") {
      json(res, 200, posts.get(post[1]!));
      return true;
    }
    if (post && req.method === "PUT") {
      posts.get(post[1]!);
      json(res, 200, posts.save(await body(req, postBodyLimit), post[1]!));
      return true;
    }
    if (post && req.method === "DELETE") {
      posts.remove(post[1]!);
      json(res, 200, { deleted: true });
      return true;
    }
    if (path === "/api/publications" && req.method === "GET") {
      json(res, 200, this.publications.list(page, pageSize));
      return true;
    }
    if (path === "/api/publications" && req.method === "POST") {
      const input = await body(req);
      const run = this.publications.queue(
        input.postId,
        this.publications.destination(input.sourceId),
      );
      this.publications.wake();
      json(res, 202, run);
      return true;
    }
    const run = path.match(
      /^\/api\/publications\/([^/]+)\/(retry|reconcile|cancel)$/,
    );
    if (run && req.method === "POST") {
      json(
        res,
        200,
        run[2] === "cancel"
          ? this.publications.cancel(run[1]!)
          : run[2] === "retry"
            ? this.publications.retry(run[1]!)
            : await this.publications.reconcile(run[1]!, await body(req)),
      );
      return true;
    }
    if (
      path.startsWith("/api/posts") ||
      path.startsWith("/api/publications") ||
      path.startsWith("/api/post-images")
    )
      throw new HttpError(404, "Publication route not found.");
    return false;
  }
}
