# ADR-005: X.com Platform Adapter Design

## Status: Accepted
## Date: 2025-01-15

## Context

X.com is a React single-page app that dynamically mutates the DOM as users scroll.
CSS class names are obfuscated and rotated on deploy. Any hardcoded selector will
eventually break. The extension must be resilient to this reality.

## Decision

**Multi-strategy selector engine** with fallback chain:
1. `data-testid` attributes (most stable — X uses these internally)
2. ARIA roles/labels (legally/socially resistant to removal)
3. Structural heuristics (DOM tree shape)
4. Text content matching (last resort)

Selectors live in an external JSON config, not in code. The config is versioned
and can be updated independently of a full extension release.

**Shadow DOM injection** for complete style isolation. No CSS can bleed in or out.

**History API patching** for SPA navigation detection. Standard approach for
content scripts; unavoidable for SPAs that don't fire standard navigation events.

**Failure threshold + notification**: After 3 consecutive failures for any selector,
emit `selector:failed` and show a non-blocking notification. The popup and tag
management always work regardless of injection status.

## Consequences

**Pro:** Extension gracefully degrades when X changes its DOM.
**Pro:** Selector updates can be shipped without a full extension update.
**Pro:** Shadow DOM means our UI is completely isolated from X.com's styles.
**Con:** History API patching is technically a monkey-patch; low risk in practice.
**Con:** Selector maintenance is ongoing work. Mitigated by community contributions.

## Alternatives Considered

- **MutationObserver on `document.body` only**: Too broad, misses scoped changes. Rejected.
- **Polling (setInterval)**: Wastes CPU, unpredictable timing. Rejected.
- **iframe for UI isolation**: Too heavy, CSP issues. Shadow DOM is the right choice.
