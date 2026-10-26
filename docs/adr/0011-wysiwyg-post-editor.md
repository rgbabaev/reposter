# 0011. WYSIWYG post editor

## Context

Explicit formatting ranges are difficult to use. Posts need direct visual editing without changing the existing Telegram-compatible storage and publication snapshots.

## Decision

Use a native contenteditable surface with a Preact toolbar and a small text/entity model. Render trusted spans and text nodes; persist only plain text and validated UTF-16 formatting entities. Canonicalize overlapping styles into valid nested ranges and keep code/preformatted text exclusive. Provide selection-aware controls, typing styles, links, keyboard shortcuts and bounded undo/redo. Leave composition to the browser until completion. Paste plain text using the current style.

## Consequences

No dependency or database migration is required. Existing posts, captions, image order and retry snapshots remain compatible. Clipboard HTML is not imported. Browser checks cover Chromium and WebKit; actual phone keyboards and live Telegram rendering still need operator acceptance.
