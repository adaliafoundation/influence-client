# Repository instructions

Keep code clean, readable, reusable, testable, and performant. Reuse existing code where appropriate. Add comments only when they clarify non-obvious behavior. Avoid unnecessary fallbacks or non-standard handling; discuss a cleaner approach when needed.

## Before committing

Run `npm run audit:security` before every commit, even when dependencies did not change. New advisories can affect an unchanged lockfile. This uses the release pipeline's `npm audit --omit=dev --audit-level=critical` gate.

Resolve critical findings and rerun the check before committing. If the audit cannot reach the registry or otherwise fails, report it as blocked, not passed. Do not bypass the check, lower its threshold, or use `npm audit fix --force` to clear findings through breaking dependency changes.

Run the tests appropriate to the change as well. The npm audit does not replace the release image's Grype scans.
