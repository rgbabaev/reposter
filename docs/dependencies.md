# Direct dependencies

All versions are exact and locked by package-lock.json. Runtime: Node.js 24.19.0.

- telegram (GramJS): Telegram user-account authorization, discovery, live updates, history, publication and deletion.
- nodemailer: SMTP delivery using verified TLS.
- qrcode-terminal: render rotating Telegram authorization QR tokens in a terminal.
- preact: accessible interactive browser views.
- @awesome.me/webawesome: locally bundled, framework-independent controls, cards, feedback and dialogs; no React wrappers.
- @monitor/shared: workspace contracts; no runtime dependencies.
- vite (development): production browser asset bundling.
- typescript (development): compile and check typed ESM.
- @types/node, @types/nodemailer, @types/qrcode-terminal (development): package type declarations.

HTTP, crypto, SQLite, filesystem, configuration validation, navigation, and scheduling use platform APIs. GramJS and Web Awesome have transitive dependencies; inspect the lockfile before updates.
