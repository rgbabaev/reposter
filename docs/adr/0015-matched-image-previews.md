# 0015. On-demand matched image previews

## Context

The operator wants image previews and click-to-zoom in matched messages. Existing snapshots store metadata without media; older album snapshots lack per-image message IDs.

## Decision

Retain external message IDs per attachment for new matches. Add optional connector operations for legacy image discovery and bounded image downloads. Load thumbnails only for visible matches and full images on viewer open, through authenticated match-scoped routes. Use a native modal dialog for zoom/navigation and keyboard focus.

Migration 010 adds image references and a 100 MiB persistent LRU cache, cascading with match deletion. Coalesce requests, allow two concurrent downloads, cap previews at 1 MiB and full images at 10 MiB, and accept raster signatures only. Legacy albums use at most 100 nearby messages. Cancel outstanding work at shutdown and recheck match existence before caching. Normalize progressive photo-size descriptors for compatibility with the installed GramJS downloader.

## Consequences

Matching and notification delivery remain metadata/text only. New and older matches can display accessible images; cached images can survive outages and source removal. Cache eviction, deleted originals, missing history or unsupported formats can prevent display. This is not media archiving or analysis, and reports still contain no attachments.
