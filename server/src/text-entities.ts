import type { TextEntity } from "@monitor/shared";
import { HttpError } from "./http.js";

export function validateEntities(text: string, input: unknown): TextEntity[] {
  if (!Array.isArray(input) || input.length > 100)
    throw new HttpError(400, "Provide at most 100 formatting ranges.");
  const boundary = (offset: number) =>
    offset === 0 ||
    offset === text.length ||
    !(
      /[\uD800-\uDBFF]/.test(text[offset - 1]!) &&
      /[\uDC00-\uDFFF]/.test(text[offset]!)
    );
  const entities = input.map((value): TextEntity => {
    if (!value || typeof value !== "object")
      throw new HttpError(400, "Invalid formatting range.");
    const { type, offset, length, url } = value;
    if (
      ![
        "bold",
        "italic",
        "underline",
        "strike",
        "spoiler",
        "code",
        "pre",
        "link",
        "blockquote",
      ].includes(type) ||
      !Number.isInteger(offset) ||
      !Number.isInteger(length) ||
      offset < 0 ||
      length < 1 ||
      offset + length > text.length ||
      !boundary(offset) ||
      !boundary(offset + length)
    )
      throw new HttpError(
        400,
        "Formatting ranges must cover complete characters within the text.",
      );
    if (type === "link") {
      try {
        if (
          typeof url !== "string" ||
          url.length > 2048 ||
          !["https:", "http:", "tg:", "mailto:"].includes(new URL(url).protocol)
        )
          throw new Error();
      } catch {
        throw new HttpError(400, "Provide an http, https, tg or mailto link.");
      }
    }
    return { type, offset, length, ...(type === "link" ? { url } : {}) };
  });
  for (const [index, a] of entities.entries())
    for (const b of entities.slice(index + 1)) {
      const overlap =
        a.offset < b.offset + b.length && b.offset < a.offset + a.length;
      const nested =
        (a.offset <= b.offset && a.offset + a.length >= b.offset + b.length) ||
        (b.offset <= a.offset && b.offset + b.length >= a.offset + a.length);
      if (
        overlap &&
        (!nested ||
          [a.type, b.type].some((type) => type === "code" || type === "pre") ||
          (a.type === "link" && b.type === "link") ||
          (a.type === "blockquote" && b.type === "blockquote"))
      )
        throw new HttpError(
          400,
          "Formatting must be nested; code ranges cannot overlap other formatting.",
        );
    }
  return entities.sort((a, b) => a.offset - b.offset || b.length - a.length);
}
