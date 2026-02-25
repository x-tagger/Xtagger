#!/usr/bin/env bash
# XTagger — initial repo setup and Forgejo push
# Usage: ./setup.sh <forgejo-username> [repo-name]
# Example: ./setup.sh alice xtagger

set -euo pipefail

FORGEJO_URL="https://forgejo.haggis.top"
FORGEJO_USER="${1:?Usage: ./setup.sh <username> [repo-name]}"
REPO_NAME="${2:-xtagger}"
REMOTE="$FORGEJO_URL/$FORGEJO_USER/$REPO_NAME.git"

echo "📦 Installing dependencies..."
pnpm install

echo "🔧 Initialising git..."
git init
git add -A
git commit -m "chore: initial scaffold — Phase 0 foundation

- Core domain: Result<T,E>, EventBus, entities, Zod schemas
- Port interfaces: StoragePort, PlatformPort, BrowserPort, LoggerPort
- Services: TagService, ImportExportService, ConflictResolver, ColorPalette
- Schema migrations: migration-001 (baseline)
- Chrome MV3 manifest
- X.com selector config (v1)
- Unit tests: result, event-bus, conflict-resolver, color-palette
- CI/CD: Forgejo Actions pipeline with bundle size checks
- ADRs: 001 (hexagonal arch), 002 (result types), 003 (storage)
- Docs: README, ARCHITECTURE.md"

echo ""
echo "🚀 Ready to push. Run:"
echo "   git remote add origin $REMOTE"
echo "   git push -u origin main"
echo ""
echo "Then create the repo at: $FORGEJO_URL/repo/create"
