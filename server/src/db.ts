/** All experimental node:sqlite use stays in this module. */
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdirSync, chmodSync, readdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
export class Storage {
  private db: DatabaseSync;
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.db.function("normalized_text", { deterministic: true }, (value) =>
      String(value ?? "").normalize("NFC").toLowerCase(),
    );
    chmodSync(path, 0o600);
    this.db.exec(
      "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;",
    );
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS migrations(version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
    );
    const directory = new URL("../migrations/", import.meta.url);
    for (const file of readdirSync(directory)
      .filter((f) => /^\d+.*\.sql$/.test(f))
      .sort()) {
      if (this.get("SELECT version FROM migrations WHERE version=?", file))
        continue;
      this.transaction(() => {
        this.db.exec(readFileSync(new URL(file, directory), "utf8"));
        this.run(
          "INSERT INTO migrations VALUES(?,?)",
          file,
          new Date().toISOString(),
        );
      });
    }
  }
  get<T = Record<string, any>>(
    sql: string,
    ...params: SQLInputValue[]
  ): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }
  all<T = Record<string, any>>(sql: string, ...params: SQLInputValue[]): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }
  run(sql: string, ...params: SQLInputValue[]) {
    return this.db.prepare(sql).run(...params);
  }
  transaction<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  close() {
    this.db.close();
  }
}

/** Separate database holds only an OS-backed exclusive lock, never application data.
 * It is released by the kernel after crashes, including across container PID namespaces.
 */
export class DataLock {
  private lock: DatabaseSync;
  constructor(directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const path = directory + "/.monitor.lock";
    this.lock = new DatabaseSync(path);
    chmodSync(path, 0o600);
    try {
      this.lock.exec(
        "PRAGMA busy_timeout=0; PRAGMA locking_mode=EXCLUSIVE; BEGIN EXCLUSIVE;",
      );
    } catch {
      this.lock.close();
      throw new Error(
        "data directory: another application instance is already running",
      );
    }
  }
  close() {
    this.lock.exec("ROLLBACK");
    this.lock.close();
  }
}
