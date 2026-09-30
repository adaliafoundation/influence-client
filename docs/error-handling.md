# Player-facing failures

Edit player-facing failure/recovery text in `src/lib/errorMessages.js`. This includes fee-choice dialogs and error-report controls. Keep technical exception text in diagnostics rather than rendering provider messages directly.

## Reporting ownership

Use `reportFailure(notify, error, { message, context })` from `src/lib/errorReporting.js` at the boundary handling the failed attempt. `message` is a catalogue key; omitted keys use the common classification. Context should be limited to the action name and transaction hash, not account/session objects or signing payloads.

- One top notification explains the failure. The same error propagated through multiple handlers is reported once.
- User cancellations are silent.
- Errors already handled by a funding/fee-choice modal have `suppressTransactionFailure` set and do not also generate a toast.
- `useFailureReporter` reports submission guard results and returns the reported result so dialogs can propagate it without reporting it again. It creates a separate result per attempt, including when the SDK returns a shared checking-state object.
- Ordinary loading and prerequisite guidance can remain inline. Do not add a second inline failure/retry message after a failed submission.
- Unexpected failures attach a sanitized plaintext report. The notification's Details button opens the existing Dialog component only on request. The report is selectable and has a copy button with a manual-copy fallback.
- Confirmed reverts are failures. Receipt-monitoring errors without confirmed reverts retain pending status and show uncertainty guidance once per transaction hash. The existing activity/receipt reconciliation remains active.

## Funding

`createFundingError(amount, token, total)` carries a `fundingRequirement` with decimal-string amounts in the original token's base units. `amount` is the shortfall; `total` is the full purchase target. ChainTransactionContext consumes that same field and opens FundingFlow using the full target, which compares against the current balance. It does not silently resubmit the purchase after funding. The old `additionalUSDCRequired` branch is removed.

Fee-token consent and top-up dialogs remain actionable choices; their copy is in the same catalogue. Ordinary timeout, connection, and retry advice never opens a failure modal automatically.

## Diagnostics

Reports retain exception name, message, stack, causes, codes, safe provider response fields, action, hash, timestamp, and browser version. Secret-bearing fields and known credential forms in text are redacted; transport request/configuration objects are excluded. Bigints and circular references are supported. The hard-crash copy flow uses the same sanitizer. Avoid adding arbitrary application state to action reports.

## Verification

Use unit tests for classification, cancellation, duplicate suppression, report redaction/copy behavior, and funding amounts. Provider-hosted wallet/checkout messages remain outside the client's control.
