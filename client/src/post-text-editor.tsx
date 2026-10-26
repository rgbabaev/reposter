import type { TextStyle } from "@monitor/shared";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import {
  changedText,
  formatText,
  normalizeMarks,
  readPostText,
  readSelection,
  renderPostText,
  replaceText,
  restoreSelection,
  sameMark,
  selectedMarks,
  validLink,
  type PostText,
  type TextMark,
  type TextSelection,
} from "./post-text-model";

interface EditorSnapshot {
  value: PostText;
  selection: TextSelection;
}
const formats: { type: TextStyle; label: string; text?: string }[] = [
  { type: "bold", label: "Bold", text: "B" },
  { type: "italic", label: "Italic", text: "I" },
  { type: "underline", label: "Underline", text: "U" },
  { type: "strike", label: "Strikethrough", text: "S" },
  { type: "spoiler", label: "Spoiler" },
  { type: "code", label: "Code" },
  { type: "pre", label: "Preformatted" },
  { type: "blockquote", label: "Quote" },
];
const equal = (a: PostText, b: PostText) =>
  JSON.stringify(a) === JSON.stringify(b);

export function PostTextEditor({
  value,
  maxLength,
  onChange,
}: {
  value: PostText;
  maxLength: number;
  onChange: (value: PostText) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const current = useRef<EditorSnapshot>({
    value,
    selection: { start: 0, end: 0 },
  });
  const undo = useRef<EditorSnapshot[]>([]);
  const redo = useRef<EditorSnapshot[]>([]);
  const pending = useRef<TextMark[] | undefined>(undefined);
  const composing = useRef(false);
  const [active, setActive] = useState<TextMark[]>([]);
  const [history, setHistory] = useState({ undo: false, redo: false });
  const [linkOpen, setLinkOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const linkInput = useRef<HTMLInputElement>(null);
  const updateHistory = () =>
    setHistory({ undo: !!undo.current.length, redo: !!redo.current.length });
  const remember = () => {
    if (!root.current || composing.current) return;
    const selection = readSelection(root.current);
    if (!selection) return;
    if (
      selection.start !== current.current.selection.start ||
      selection.end !== current.current.selection.end
    )
      pending.current = undefined;
    current.current.selection = selection;
    setActive(
      pending.current ?? selectedMarks(current.current.value, selection),
    );
  };
  const display = (snapshot: EditorSnapshot) => {
    current.current = snapshot;
    renderPostText(root.current!, snapshot.value);
    restoreSelection(root.current!, snapshot.selection);
    setActive(
      pending.current ?? selectedMarks(snapshot.value, snapshot.selection),
    );
  };
  const commit = (next: EditorSnapshot) => {
    if (
      (next.value.text.length > maxLength &&
        next.value.text.length > current.current.value.text.length) ||
      next.value.entities.length > 100
    ) {
      setError(
        next.value.text.length > maxLength
          ? `Text allows at most ${maxLength} characters.`
          : "Use at most 100 formatting ranges.",
      );
      display(current.current);
      return;
    }
    setError("");
    if (!equal(current.current.value, next.value)) {
      undo.current = [...undo.current.slice(-99), { ...current.current }];
      redo.current = [];
    }
    display(next);
    onChange(next.value);
    updateHistory();
  };
  const insert = (text: string) => {
    remember();
    const { value, selection } = current.current;
    const marks = pending.current ?? selectedMarks(value, selection);
    const position = selection.start + text.length;
    commit({
      value: replaceText(value, selection, text, marks),
      selection: { start: position, end: position },
    });
    pending.current = marks;
  };
  const syncInput = () => {
    if (composing.current || !root.current) return;
    let next = readPostText(root.current);
    if (pending.current) {
      const previous = current.current.value;
      const change = changedText(previous.text, next.text);
      if (change.text)
        next = replaceText(
          previous,
          change.selection,
          change.text,
          pending.current,
        );
    }
    const selection = readSelection(root.current) ?? {
      start: next.text.length,
      end: next.text.length,
    };
    commit({ value: next, selection });
  };
  const apply = (mark?: TextMark, toggle = true) => {
    remember();
    const { value, selection } = current.current;
    if (selection.start === selection.end) {
      const marks = pending.current ?? selectedMarks(value, selection);
      pending.current = !mark
        ? []
        : marks.some((other) => sameMark(mark, other))
          ? marks.filter((other) => other.type !== mark.type)
          : normalizeMarks([
              ...marks.filter(
                (other) =>
                  other.type !== "code" &&
                  other.type !== "pre" &&
                  other.type !== mark.type,
              ),
              mark,
            ]);
      setActive(pending.current);
      restoreSelection(root.current!, selection);
    } else {
      pending.current = undefined;
      commit({ value: formatText(value, selection, mark, toggle), selection });
    }
  };
  const openLink = () => {
    remember();
    if (current.current.selection.start === current.current.selection.end) {
      setError("Select text to add or change a link.");
      return;
    }
    setUrl(
      selectedMarks(current.current.value, current.current.selection).find(
        (mark) => mark.type === "link",
      )?.url ?? "",
    );
    setLinkOpen(true);
    setError("");
  };
  const closeLink = () => {
    setLinkOpen(false);
    restoreSelection(root.current!, current.current.selection);
  };
  const saveLink = () => {
    if (!validLink(url.trim())) {
      setError("Enter an http, https, tg or mailto link.");
      return;
    }
    apply({ type: "link", url: url.trim() }, false);
    setLinkOpen(false);
  };
  const travel = (direction: "undo" | "redo") => {
    remember();
    const source = direction === "undo" ? undo : redo;
    const target = direction === "undo" ? redo : undo;
    const snapshot = source.current.pop();
    if (!snapshot) return;
    target.current.push({ ...current.current });
    pending.current = undefined;
    display(snapshot);
    onChange(snapshot.value);
    updateHistory();
    setError("");
  };
  useLayoutEffect(() => {
    if (!root.current) return;
    if (!equal(current.current.value, value) || !root.current.hasChildNodes()) {
      current.current = { value, selection: { start: 0, end: 0 } };
      renderPostText(root.current, value);
      undo.current = [];
      redo.current = [];
      pending.current = undefined;
      updateHistory();
    }
  }, [value]);
  useEffect(() => {
    document.addEventListener("selectionchange", remember);
    return () => document.removeEventListener("selectionchange", remember);
  }, []);
  useEffect(() => {
    if (linkOpen) linkInput.current?.focus();
  }, [linkOpen]);

  return (
    <div class="post-editor">
      <span id="post-text-label">Text</span>
      <div
        class="post-editor-toolbar"
        role="group"
        aria-label="Text formatting"
        onPointerDown={(event) => {
          if ((event.target as Element).closest("button"))
            event.preventDefault();
        }}
      >
        {formats.map((format) => (
          <button
            key={format.type}
            type="button"
            class={`format-button format-${format.type}`}
            aria-label={format.label}
            title={format.label}
            aria-pressed={active.some((mark) => mark.type === format.type)}
            onClick={() => apply({ type: format.type })}
          >
            {format.text ?? format.label}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={active.some((mark) => mark.type === "link")}
          aria-expanded={linkOpen}
          onClick={openLink}
        >
          Link
        </button>
        <button
          type="button"
          aria-label="Clear formatting"
          title="Clear formatting"
          onClick={() => apply()}
        >
          Clear
        </button>
        <button
          type="button"
          aria-label="Undo"
          title="Undo (Ctrl/Cmd+Z)"
          disabled={!history.undo}
          onClick={() => travel("undo")}
        >
          ↶
        </button>
        <button
          type="button"
          aria-label="Redo"
          title="Redo (Ctrl/Cmd+Shift+Z)"
          disabled={!history.redo}
          onClick={() => travel("redo")}
        >
          ↷
        </button>
      </div>
      {linkOpen && (
        <div class="post-editor-link">
          <label class="field">
            Link URL
            <input
              ref={linkInput}
              type="text"
              inputMode="url"
              value={url}
              placeholder="https://example.com"
              onInput={(event) => setUrl(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  saveLink();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  closeLink();
                }
              }}
            />
          </label>
          <button type="button" onClick={saveLink}>
            Apply link
          </button>
          {active.some((mark) => mark.type === "link") && (
            <button
              type="button"
              onClick={() => {
                apply(active.find((mark) => mark.type === "link"));
                setLinkOpen(false);
              }}
            >
              Remove link
            </button>
          )}
          <button type="button" onClick={closeLink}>
            Cancel link
          </button>
        </div>
      )}
      <div
        ref={root}
        class="post-editor-document"
        contentEditable
        role="textbox"
        aria-multiline="true"
        aria-invalid={value.text.length > maxLength || !!error}
        aria-labelledby="post-text-label"
        aria-describedby="post-text-help post-text-count"
        spellcheck
        tabIndex={0}
        onBeforeInput={(event) => {
          const input = event as InputEvent;
          if (composing.current || input.isComposing || !input.cancelable)
            return;
          remember();
          if (input.inputType === "insertText" && input.data !== null) {
            event.preventDefault();
            insert(input.data);
          } else if (
            ["insertParagraph", "insertLineBreak"].includes(input.inputType)
          ) {
            event.preventDefault();
            insert("\n");
          } else if (
            input.inputType === "historyUndo" ||
            input.inputType === "historyRedo"
          ) {
            event.preventDefault();
            travel(input.inputType === "historyUndo" ? "undo" : "redo");
          } else if (input.inputType.startsWith("format")) {
            event.preventDefault();
            const type = {
              formatBold: "bold",
              formatItalic: "italic",
              formatUnderline: "underline",
              formatStrikeThrough: "strike",
            }[input.inputType] as TextStyle | undefined;
            if (type) apply({ type });
          }
        }}
        onInput={syncInput}
        onCompositionStart={() => {
          remember();
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
          syncInput();
        }}
        onPaste={(event) => {
          event.preventDefault();
          const text = event.clipboardData
            ?.getData("text/plain")
            .replace(/\r\n?/g, "\n");
          if (text) insert(text);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setError("Paste text here; use Add images for attachments.");
        }}
        onKeyDown={(event) => {
          if (
            event.isComposing ||
            !(event.ctrlKey || event.metaKey) ||
            event.altKey
          )
            return;
          const key = event.key.toLowerCase();
          if (["b", "i", "u"].includes(key)) {
            event.preventDefault();
            apply({
              type: ({ b: "bold", i: "italic", u: "underline" } as const)[
                key as "b" | "i" | "u"
              ],
            });
          }
          if (key === "k") {
            event.preventDefault();
            openLink();
          }
          if (key === "z" || key === "y") {
            event.preventDefault();
            travel(key === "y" || event.shiftKey ? "redo" : "undo");
          }
        }}
      />
      <small id="post-text-help">
        Select text to format it, or turn on a style before typing. Pasted text
        uses the current style. Spoilers remain visible while editing.
      </small>
      <small id="post-text-count" role="status">
        {value.text.length} / {maxLength} characters
      </small>
      {(error || value.text.length > maxLength) && (
        <p class="error-text" role="alert">
          {error ||
            `Text allows at most ${maxLength} characters with the current attachments.`}
        </p>
      )}
    </div>
  );
}
