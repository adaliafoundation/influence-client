# Repository instructions

Keep code clean, readable, reusable, testable, and performant. Reuse existing code where appropriate. Add comments only when they clarify non-obvious behavior. Avoid unnecessary fallbacks or non-standard handling; discuss a cleaner approach when needed.

Prioritize code readability and appropriate code reuse. Keep shared behavior in one clearly named implementation instead of duplicating it across callers, and prefer straightforward control flow over unnecessary abstraction.

## Shared UI components and visual consistency

Treat the existing UI as the design specification. New modals, buttons, warnings, forms, and other interface elements must look and behave like their existing counterparts without requiring the user to request consistency during review.

- Before creating or restyling UI, inspect comparable existing screens and the shared components they use. Check both the component implementation and representative call sites; a component's available styling props are not evidence that an override is appropriate.
- Reuse the established components, style variants, theme tokens, spacing, typography, and action layouts. For dialogs, start with `GenericDialog` or `ConfirmationDialog` and their shared buttons; use `WarningAlert` for established warning styling.
- Prefer the shared component's defaults. Do not add local CSS, inline styles, or styling props that override button colors, fills, borders, sizes, or other established presentation merely to make a new instance look distinctive. Using a shared component with unnecessary overrides does not count as visual reuse.
- Interpret requests such as “primary action” or “warning” using existing UI conventions. Do not invent a solid-filled button, new color scheme, or other variant unless the user explicitly requests that visual difference.
- If an existing component cannot express a required behavior or layout, make the smallest reusable extension to that component, preserving other callers' behavior. Avoid copying its markup or styles into a new implementation, and do not add one-off styling escape hatches when an existing variant suffices.
- Before presenting UI work as complete, compare it with the existing examples and review every new styling override. Remove overrides that are not required by the request. Verify action order, alignment, button appearance, warning treatment, and busy/disabled states. Do not claim visual consistency based only on lint or unit tests.

## Before committing

Run `npm run audit:security` before every commit, even when dependencies did not change. New advisories can affect an unchanged lockfile. This uses the release pipeline's `npm audit --omit=dev --audit-level=critical` gate.

Resolve critical findings and rerun the check before committing. If the audit cannot reach the registry or otherwise fails, report it as blocked, not passed. Do not bypass the check, lower its threshold, or use `npm audit fix --force` to clear findings through breaking dependency changes.

Run the tests appropriate to the change as well. The npm audit does not replace the release image's Grype scans.
