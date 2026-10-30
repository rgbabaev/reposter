# 0021. Shared visual tokens

## Context

The first Web Awesome migration retained heavier application colors, typography and control styling. The requested appearance should resemble Web Awesome’s documentation site.

## Decision

Use the bundled default theme’s color, typography, radius and spacing tokens throughout the app. Use white surfaces, thin borders, compact button text, restrained blue accents and a small coral brand accent. Keep mobile bottom navigation, visible focus, 44px touch targets and 16px text-entry controls. Keep assets local and add no font or theme dependencies.

## Consequences

Application layouts and Web Awesome components share one visual language. Layout and Telegram editor styling remain application-owned. Future visual adjustments should use the same theme tokens rather than independent color palettes.
