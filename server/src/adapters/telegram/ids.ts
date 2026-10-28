import { readBigIntFromBuffer } from "telegram/Helpers.js";

export function telegramLong(value: string) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigInt64LE(BigInt(value));
  return readBigIntFromBuffer(buffer, true, true);
}
