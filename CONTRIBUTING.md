# Contributing to XTagger

Welcome! XTagger is developed in the open. All contributions are valued — code, docs, selector updates, bug reports, and feature ideas.

## Quick Start

```bash
git clone https://forgejo.xtagger.dev/root/xtagger.git
cd xtagger
pnpm install
pnpm build
pnpm test        # Must all pass before submitting a PR
```

## Project Structure

Read [ARCHITECTURE.md](./docs/ARCHITECTURE.md) first. Key points:

- **Core** (`src/core/`) is pure TypeScript. Never import browser APIs here.
- **Adapters** (`src/adapters/`, `src/platforms/`) implement core's port interfaces.
- **Modules communicate via EventBus**, not direct imports between modules.
- **All errors are Result types** — no thrown exceptions in core logic.

## Before You Start

1. Check the Forgejo issues for existing discussion on your topic.
2. For significant changes, open an issue to discuss the approach before coding.
3. For selector config fixes — go ahead and open a PR directly (fast-track review).

## Coding Standards

### TypeScript

- Strict mode, no `any` (except marked adapter boundaries)
- Functional style, pure functions preferred
- Every public function has JSDoc
- Every module has a JSDoc header stating its layer and dependencies

### Naming

```typescript
const camelCaseVariables = 'yes';
function camelCaseFunctions() {}
type PascalCaseTypes = string;
interface PascalCaseInterfaces {}
const SCREAMING_SNAKE_CONSTANTS = 42;
```

### Error Handling

```typescript
// ✅ Core pattern
function myOperation(): Result<Tag, TagError> {
  if (!valid) return Err({ type: 'TAG_NOT_FOUND', tagId });
  return Ok(tag);
}

// ❌ Never in core
function myOperation(): Tag {
  if (!valid) throw new Error('not found');
  return tag;
}
```

### File Structure

- Max 300 lines per file
- Max 50 lines per function  
- Max 5 inter-module imports per file
- Co-locate types in `.types.ts` files when they're shared
- Each file has a `@file`, `@layer`, and `@description` JSDoc header

### Formatting

Handled by Biome. Run `pnpm lint:fix` before committing. No style debates — the tool decides.

## Submitting Changes

### Regular PRs

1. Fork the repo on Forgejo
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes, following the coding standards above
4. Run `pnpm ci` — all checks must pass
5. If your change is architecturally significant, add an ADR in `docs/adr/`
6. Open a PR with:
   - Clear description of what changed and why
   - Link to any related issues
   - Note if any code was AI-generated (flag in PR description)
   - Screenshot/demo for UI changes

### Selector Config Updates (Fast Track)

When X.com breaks selectors, we need to move fast. Selector-only PRs get expedited review:

1. Edit `selector-configs/x.com.json`
2. Increment `selectorVersion`
3. Update `lastVerified` to today's date
4. Add a comment in the `notes` field describing what changed
5. Open a PR titled `fix(selectors): update X.com selector for [element]`
6. Selector PRs only need one review and don't require the full feature review process

### Architecture Decision Records (ADRs)

Significant decisions require an ADR **before** implementation. Use the template:

```markdown
# ADR-NNN: [Title]

## Status: Proposed

## Date: YYYY-MM-DD

## Context
What problem are we solving? What constraints exist?

## Decision
What specifically are we doing?

## Consequences
- Pro: ...
- Con: ...

## Alternatives Considered
- Option A: rejected because...
```

ADRs go in `docs/adr/`. Number them sequentially.

## AI-Assisted Contributions

This project is partially developed with AI coding agents. If you use AI assistance:

- Flag AI-generated code in your PR description
- Review the code carefully — AI can produce plausible-looking but incorrect code
- Ensure AI-generated code follows all the coding standards here
- AI-generated code is held to the same standard as human-written code

## Testing

- Every public function needs a test in `tests/unit/`
- Integration tests for storage and messaging in `tests/integration/`
- E2E tests (Playwright) for critical user flows in `tests/e2e/`
- Coverage targets: 80% for core, 60% for adapters

```bash
pnpm test              # Run unit tests once
pnpm test:watch        # Watch mode
pnpm test:coverage     # With coverage report
pnpm test:e2e          # Playwright E2E (needs a built dist/)
```

## Getting Help

- Open a Forgejo issue with the `question` label
- Check existing issues and PRs — your question may already be answered
- Read the relevant ADR for context on design decisions

---

*This project values clarity, correctness, and privacy. We're not in a hurry — we'd rather ship less, more carefully.*
