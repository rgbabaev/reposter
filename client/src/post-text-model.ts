import type { TextEntity, TextStyle } from "@monitor/shared";

export interface PostText {
  text: string;
  entities: TextEntity[];
}
export interface TextSelection {
  start: number;
  end: number;
}
export type TextMark = Pick<TextEntity, "type" | "url">;
interface TextRun {
  text: string;
  marks: TextMark[];
}
const styles: TextStyle[] = [
  "blockquote",
  "link",
  "bold",
  "italic",
  "underline",
  "strike",
  "spoiler",
  "code",
  "pre",
];
export const sameMark = (a: TextMark, b: TextMark) =>
  a.type === b.type && a.url === b.url;
const exclusive = (mark: TextMark) =>
  mark.type === "code" || mark.type === "pre";

export function normalizeMarks(marks: TextMark[]): TextMark[] {
  const code = marks.find(exclusive);
  if (code) return [code];
  return styles.flatMap((type) => {
    const mark = marks.find((value) => value.type === type);
    return mark ? [mark] : [];
  });
}
export function marksAt(value: PostText, offset: number): TextMark[] {
  return normalizeMarks(
    value.entities
      .filter(
        (entity) =>
          entity.offset <= offset && entity.offset + entity.length > offset,
      )
      .map(({ type, url }) => ({ type, ...(url ? { url } : {}) })),
  );
}
function runs(value: PostText, start = 0, end = value.text.length): TextRun[] {
  const boundaries = [
    ...new Set([
      start,
      end,
      ...value.entities.flatMap((entity) =>
        [entity.offset, entity.offset + entity.length].filter(
          (offset) => offset > start && offset < end,
        ),
      ),
    ]),
  ].sort((a, b) => a - b);
  return boundaries.slice(0, -1).map((offset, index) => ({
    text: value.text.slice(offset, boundaries[index + 1]),
    marks: marksAt(value, offset),
  }));
}
export function fromRuns(runs: TextRun[]): PostText {
  const value: PostText = { text: "", entities: [] };
  const open: (TextMark & { offset: number })[] = [];
  const close = () => {
    const mark = open.pop()!;
    const length = value.text.length - mark.offset;
    if (length) value.entities.push({ ...mark, length });
  };
  for (const run of runs) {
    if (!run.text) continue;
    const marks = normalizeMarks(run.marks);
    let shared = 0;
    while (
      shared < open.length &&
      shared < marks.length &&
      sameMark(open[shared]!, marks[shared]!)
    )
      shared++;
    while (open.length > shared) close();
    for (const mark of marks.slice(shared))
      open.push({ ...mark, offset: value.text.length });
    value.text += run.text;
  }
  while (open.length) close();
  value.entities.sort((a, b) => a.offset - b.offset || b.length - a.length);
  return value;
}
export function changedText(
  previous: string,
  next: string,
): { selection: TextSelection; text: string } {
  const before = Array.from(previous);
  const after = Array.from(next);
  let start = 0;
  while (
    start < before.length &&
    start < after.length &&
    before[start] === after[start]
  )
    start++;
  let end = before.length;
  let nextEnd = after.length;
  while (
    end > start &&
    nextEnd > start &&
    before[end - 1] === after[nextEnd - 1]
  ) {
    end--;
    nextEnd--;
  }
  return {
    selection: {
      start: before.slice(0, start).join("").length,
      end: previous.length - before.slice(end).join("").length,
    },
    text: after.slice(start, nextEnd).join(""),
  };
}
export function replaceText(
  value: PostText,
  selection: TextSelection,
  text: string,
  marks: TextMark[],
): PostText {
  return fromRuns([
    ...runs(value, 0, selection.start),
    { text, marks },
    ...runs(value, selection.end),
  ]);
}
export function selectedMarks(
  value: PostText,
  selection: TextSelection,
): TextMark[] {
  if (selection.start === selection.end)
    return marksAt(value, Math.max(0, selection.start - 1));
  const selected = runs(value, selection.start, selection.end);
  return (
    selected[0]?.marks.filter((mark) =>
      selected.every((run) => run.marks.some((other) => sameMark(mark, other))),
    ) ?? []
  );
}
export function formatText(
  value: PostText,
  selection: TextSelection,
  mark?: TextMark,
  toggle = true,
): PostText {
  const remove =
    toggle &&
    mark &&
    selectedMarks(value, selection).some((other) => sameMark(mark, other));
  return fromRuns([
    ...runs(value, 0, selection.start),
    ...runs(value, selection.start, selection.end).map((run) => ({
      text: run.text,
      marks: !mark
        ? []
        : remove
          ? run.marks.filter((other) => other.type !== mark.type)
          : exclusive(mark)
            ? [mark]
            : [
                ...run.marks.filter(
                  (other) => !exclusive(other) && other.type !== mark.type,
                ),
                mark,
              ],
    })),
    ...runs(value, selection.end),
  ]);
}
export function validLink(url: string): boolean {
  try {
    return (
      url.length <= 2048 &&
      ["https:", "http:", "tg:", "mailto:"].includes(new URL(url).protocol)
    );
  } catch {
    return false;
  }
}

export function renderPostText(root: HTMLElement, value: PostText) {
  const fragment = document.createDocumentFragment();
  for (const run of runs(value)) {
    let node: Node = document.createTextNode(run.text);
    for (const mark of [...run.marks].reverse()) {
      const span = document.createElement("span");
      span.dataset.style = mark.type;
      if (mark.url) span.dataset.url = mark.url;
      span.append(node);
      node = span;
    }
    fragment.append(node);
  }
  if (!value.text || value.text.endsWith("\n")) {
    const placeholder = document.createElement("br");
    placeholder.dataset.placeholder = "true";
    fragment.append(placeholder);
  }
  root.replaceChildren(fragment);
}
export function readPostText(root: Node): PostText {
  if (
    root instanceof HTMLElement &&
    root.textContent === "" &&
    root.querySelectorAll("br").length <= 1
  )
    return { text: "", entities: [] };
  const result: TextRun[] = [];
  const walk = (node: Node, marks: TextMark[]) => {
    if (node.nodeType === Node.TEXT_NODE) {
      result.push({ text: node.textContent ?? "", marks });
      return;
    }
    if (!(node instanceof Element) && !(node instanceof DocumentFragment))
      return;
    if (node instanceof Element) {
      if (node.hasAttribute("data-placeholder")) return;
      if (node.tagName === "BR") {
        result.push({ text: "\n", marks });
        return;
      }
      const type = node.getAttribute("data-style") as TextStyle | null;
      if (type && styles.includes(type))
        marks = [
          ...marks,
          {
            type,
            ...(type === "link"
              ? { url: node.getAttribute("data-url") ?? "" }
              : {}),
          },
        ];
    }
    for (const child of node.childNodes) walk(child, marks);
  };
  walk(root, []);
  return fromRuns(result);
}
export function readSelection(root: HTMLElement): TextSelection | undefined {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  if (
    !root.contains(range.startContainer) ||
    !root.contains(range.endContainer)
  )
    return;
  const offset = (node: Node, position: number) => {
    const prefix = document.createRange();
    prefix.selectNodeContents(root);
    prefix.setEnd(node, position);
    return readPostText(prefix.cloneContents()).text.length;
  };
  return {
    start: offset(range.startContainer, range.startOffset),
    end: offset(range.endContainer, range.endOffset),
  };
}
export function restoreSelection(root: HTMLElement, selection: TextSelection) {
  const locate = (offset: number): [Node, number] => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const length = node.textContent?.length ?? 0;
      if (offset <= length) return [node, offset];
      offset -= length;
    }
    return [root, root.childNodes.length ? root.childNodes.length - 1 : 0];
  };
  root.focus();
  const range = document.createRange();
  range.setStart(...locate(selection.start));
  range.setEnd(...locate(selection.end));
  const current = window.getSelection();
  current?.removeAllRanges();
  current?.addRange(range);
}
