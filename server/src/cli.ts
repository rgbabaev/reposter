import { StringDecoder } from "node:string_decoder";
import { loadConfig, type Config } from "./config.js";
import { makeClient, saveSession } from "./adapters/telegram/session.js";
import qr from "qrcode-terminal";
async function password(): Promise<string> {
  if (!process.stdin.isTTY)
    throw new Error("Two-step verification requires an interactive terminal.");
  process.stdout.write("Telegram two-step verification password (hidden): ");
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    const decoder = new StringDecoder("utf8");
    const cleanup = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.off("data", read);
      process.stdout.write("\n");
    };
    const read = (data: Buffer) => {
      for (const char of decoder.write(data)) {
        if (char === "\u0003") {
          cleanup();
          reject(new Error("Login cancelled."));
          return;
        }
        if (char === "\r" || char === "\n") {
          cleanup();
          resolve(value);
          value = "";
          return;
        }
        if (char === "\u007f" || char === "\b")
          value = Array.from(value).slice(0, -1).join("");
        else if (char >= " ") value += char;
      }
    };
    process.stdin.on("data", read);
  });
}
async function main() {
  process.umask(0o077);
  let config: Config;
  try {
    config = loadConfig();
  } catch (error) {
    // Configuration validation messages contain field requirements, never values.
    console.error(error instanceof Error ? error.message : "Invalid configuration.");
    process.exitCode = 1;
    return;
  }
  const client = makeClient(config);
  const cancel = () => {
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    void client.destroy().finally(() => process.exit(130));
  };
  process.once("SIGINT", cancel);
  process.once("SIGTERM", cancel);
  try {
    await client.connect();
    if (!(await client.checkAuthorization()))
      await client.signInUserWithQrCode(config.telegram, {
        qrCode: async ({ token, expires }) => {
          console.log(
            `Scan with Telegram → Settings → Devices → Link Desktop Device. QR expires ${new Date(expires * 1000).toISOString()} (UTC). New QR codes appear automatically.`,
          );
          qr.generate("tg://login?token=" + token.toString("base64url"), {
            small: true,
          });
        },
        password,
        onError: async () => {
          console.error(
            "Telegram login failed. Check application credentials, authorization and connection.",
          );
          return true;
        },
      });
    if (!(await client.checkAuthorization()))
      throw new Error("Telegram authorization was not completed.");
    saveSession(config, client);
    console.log(
      "Authorized session saved with owner-only permissions. Start or restart Personal Monitor.",
    );
  } finally {
    await client.destroy();
  }
}
main().catch(() => {
  console.error(
    "Telegram setup failed. Check the protected configuration, private session directory, network access, and application credentials from my.telegram.org.",
  );
  process.exitCode = 1;
});
