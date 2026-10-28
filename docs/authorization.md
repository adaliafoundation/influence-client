# Client authorization

The client uses the SDK `Authorization` evaluator for current contract rules on every asset. There is no legacy authorization mode.

## Boundaries

- `src/lib/authorization.js` normalizes API component records, resolves SDK requirements, and supplies external policy results. It does not implement permission precedence. Undefined components are unloaded; null and empty collections are confirmed absence.
- `src/hooks/useAuthorizationService.js` supplies shared `authorize` and `recheckAuthorization` functions through CrewContext. Readiness, location, capacity, occupancy, payment, and transaction simulation remain separate checks.
- `src/lib/authorizationData.js` batches projected component reads. Inventory searches return paginated candidates, not authorization evidence. The client retains unresolved candidates as disabled rows and evaluates access with the SDK.
- The planning and ship-ejection adapters retain their UI result shape, but delegate permission decisions to the SDK. Do not reintroduce synthesized lot control or wallet ownership as a substitute for tenancy or exact crew identity.

## Using the service

Use `authorize(method, args, entities)` for a rendered decision. Render unresolved results as checking and enable actions only for `allowed`. `crewCan` is a positive convenience gate backed by this service; never negate it to authorize cleanup. Use the SDK eviction helpers for that purpose.

Requests are queued during rendering and loaded after commit. Display checks reuse supplied components and share missing dependency reads. Actual entity-cache updates re-evaluate only dependent checks; unrelated query traffic and invalidation notifications do not trigger authorization reads. Wallet/provider and crew changes reset the scope. UI metadata does not create new requests. Concurrent consumers can retain distinct component projections of the same permission without replacing each other; unused projections are removed after consumers have seen the updated revision. New blocks alone do not trigger permission reads or reset displayed eligibility. The shared service, planning queries, and ship-ejection queries retain their displayed results until background refreshes complete. Shared display results are scoped to the wallet/provider and selected crew, and matched by action arguments and entity identity; new targets and changed action parameters start checking. Failed checks replace the previous result with an unresolved state. Production previews retain their evaluation time until job inputs change; submission recomputes completion time. External policy responses belong only to their evaluation and are read at its explicit block; a failed read is not rejection. Indexed component reads remain dependent on indexer freshness, so transaction simulation remains necessary.

HUD action buttons share a click-time refresh and consult their existing eligibility rules after it completes. Revoked access prevents opening the dialog and shows the permissions-changed notification. Idle dialogs do not poll authorization.

Use `recheckAuthorization` at submission, with current final action inputs. It refreshes data independently of UI caches, publishes the result to displayed checks, and rejects results from an obsolete scope. A permission denial in the shared transaction guard closes the submitting dialog (only if it is still the same dialog) and shows one notification. Destructive cleanup also checks acting-crew prerequisites. Production checks use completion time, not only current permission; start rules must not be reused for finish actions. If an existing lease ends too early, the job remains disabled until it is extended. Planned lease/purchase transactions must still match their current quote and pass simulation.

Delivery inventory permission does not authorize payment. Acceptance refreshes the delivery price and the origin's current controlling crew's delegate. A changed price requires review; zero-price acceptance emits no SWAY transfer.

## Regression checks

Run client unit tests with mocked data and policies:

```sh
CI=true npm test -- --watchAll=false --runInBand
```

Authorization-specific tests cover component completeness, inclusive boundaries, active-tenant precedence (including planned-site repossession), crew/ship docking grants, stale responses, pre-submit changes, candidate batching/pagination, production completion and quote checks, and delivery payments. Tutorial entities explicitly provide their mocked permission components.

## Transport and completion time

Production estimates round each travel leg and each setup/production phase to
whole real-time seconds using SDK helpers before summing or taking a positioning
maximum. Use `Asteroid.getLotTravelTimeReal` for hopper legs,
`Process.getSetupTimeReal` and `Process.getProcessingTimeReal` for processing,
`Extractor.getExtractionTimeReal` for extraction, and `Time.toRealDurationCeil`
for assembly phases. Crew labor uses `Time.getCrewLaborDuration` after summing
production phases.

The same integer duration feeds display, lease quotes, and authorization.
`Time.getProductionCompletionTime` uses the later of block time and crew ready
time and rejects fractional durations during fresh submission checks. Two legs
of 340.208 seconds require 682 seconds; a lease ending at 681 seconds is too short.
Do not add a buffer. Processing's input leg runs from origin to processor even
when input and output storage share a lot. Orbital/calendar conversions and dock
queue calculations have separate semantics.

Instant transport includes both speed and distance bonuses, with an inclusive
boundary: `distance / speedBonus <= baseFreeRadius * distanceBonus`. Food resupply
retains its contract-specific no-penalty bonus floor.

## Action-specific rules

- Wallet asset listings and ownership indicators are presentation, not permission
  decisions. Preserve exact pilot/tenant identity checks required by contracts.
- Proposed deliveries require REMOVE_PRODUCTS access at the origin and
  ADD_PRODUCTS access at the destination. Unresolved candidates remain disabled.
- Agreement lookup and edits preserve entity label plus ID. Normalize account
  address padding and distinguish ship grants from crew grants.
- Crew eviction and repossession refresh emergency mode, delegation, roster,
  readiness, and location. Forced ship launch has its own prerequisites.
- Lease-auction start requires confirmed absence of the tenant's USE_LOT access,
  not merely an expired prepaid agreement. Concurrent tenancy changes remain
  unresolved.
- Bulk purchases and escrow buy-order creation use transaction permission
  preflight. Planning and ship eviction share the external-policy reader at an
  explicit block.
- Recruitment into an existing crew uses SDK checks and submission preflight.
  A new crew has no identity until execution; its creation path relies on
  transaction validation rather than substituting the selected crew's grants.

Transaction preflight maps supported systems to SDK primitives. Auction pricing,
inventories, travel timing, payments, and simulation remain separate checks.
