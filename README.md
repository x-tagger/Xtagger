# XTagger 🏷️

> **Local-first annotation layer for X.com.** Tag any account with custom labels. Your tags, your device, your data.

[![CI](https://forgejo.haggis.top/xtagger/xtagger/actions/workflows/ci.yml/badge.svg)](https://forgejo.haggis.top/xtagger/xtagger/actions)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)

## What is XTagger?

Social media platforms give you no way to remember *why* you followed someone, categorise accounts by topic, or share that knowledge with others. XTagger adds a personal annotation layer on top of X.com:

- 🏷️ **Tag any account** — "journalist", "AI researcher", "blocked in EU", whatever you need
- 👁️ **See tags in-feed** — coloured dots/pills next to usernames as you scroll
- 📦 **Export & share** — portable JSON collections you can share via any medium
- 🔒 **100% local** — zero cloud, zero accounts, zero telemetry. IndexedDB only.
- 🔓 **Open source** — every line auditable on [Forgejo](https://forgejo.haggis.top/xtagger/xtagger)

## Installation

> **Status: Pre-release (Phase 0 — foundation only)**

1. Clone this repo
2. `pnpm install && pnpm build`
3. Load `dist/` as an unpacked Chrome extension

Packaged release coming in Phase 2.

## Development

```bash
pnpm install
pnpm dev          # watch mode
pnpm test         # unit tests
pnpm typecheck    # TypeScript strict check
pnpm lint         # Biome lint + format check
pnpm build        # production bundle
```

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full layered architecture.

Key principles:
- **Hexagonal Architecture** — core domain has zero browser/DOM dependencies
- **Result types** — no exceptions thrown in core code
- **Event-driven** — modules communicate via typed EventBus
- **Local-first** — all data in IndexedDB, never leaves device unless you export

## Sharing Collections

XTagger uses a decentralised sharing model. Export your tag collection to a `.xtagger.json` file and share it however you like — PrivacyBin, a Forgejo gist, an X post, email. Import from a file, clipboard, or URL. No backend required.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). All significant decisions are documented in [docs/adr/](docs/adr/).

## License

AGPL-3.0 — see [LICENSE](LICENSE).
