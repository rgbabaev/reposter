# 0020. Web Awesome components

## Context

The interface duplicates control styling and modal behavior. The requested migration needs components that work directly with Preact.

## Decision

Use pinned Web Awesome free custom elements, importing individual components and the light theme into the Vite bundle. Use typed Preact JSX declarations without React wrappers or `preact/compat`. Keep semantic navigation, native image uploads and the Telegram rich text editor. Use Web Awesome controls in their toolbars and forms. Retain the shared dialog boundary for application close state and focus restoration, including asynchronous action confirmations. A small button adapter forwards accessible labels and states to the focusable shadow element.

## Consequences

The UI gains shared controls and accessible component behavior, with additional client assets and transitive dependencies. Shadow DOM requires component properties, label APIs and CSS parts instead of native-control selectors. Allow `data:` in CSP `connect-src` for Web Awesome’s bundled SVG icon fetches; network connections remain same-origin. No database or API migration is required. This replaces the specification’s previous prohibition on UI kits and the native-dialog implementation in ADR 0019.
