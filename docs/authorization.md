# Client authorization

The client uses the SDK 2.7.2 `Authorization` evaluator for current contract rules on every asset. There is no legacy authorization mode.

## Boundaries

- `src/lib/authorization.js` normalizes API component records, resolves SDK requirements, and supplies external policy results. It does not implement permission precedence. Undefined components are unloaded; null and empty collections are confirmed absence.
- `src/hooks/useAuthorizationService.js` supplies shared `authorize` and `recheckAuthorization` functions through CrewContext. Readiness, location, capacity, occupancy, payment, and transaction simulation remain separate checks.
- `src/lib/authorizationData.js` batches projected component reads. Inventory searches return paginated candidates, not authorization evidence. The client retains unresolved candidates as disabled rows and evaluates access with the SDK.
- The planning and ship-ejection adapters retain their UI result shape, but delegate permission decisions to the SDK. Do not reintroduce synthesized lot control or wallet ownership as a substitute for tenancy or exact crew identity.

## Using the service

Use `authorize(method, args, entities)` for a rendered decision. Render unresolved results as checking and enable actions only for `allowed`. `crewCan` is a positive convenience gate backed by this service; never negate it to authorize cleanup. Use the SDK eviction helpers for that purpose.

Requests are queued during rendering and loaded after commit. Component reads are shared within a block. New blocks, relevant entity-cache changes, wallet/provider changes, and explicit retries discard old results. External policy responses belong only to their evaluation and are read at the explicit block; a failed read is not rejection. Indexed component reads remain dependent on indexer freshness, so transaction simulation remains necessary.

Use `recheckAuthorization` at submission, with current final action inputs. It refreshes data independently of UI caches and rejects results from an obsolete scope. Destructive cleanup also checks acting-crew prerequisites. Production checks use completion time, not only current permission; start rules must not be reused for finish actions. If an existing lease ends too early, the job remains disabled until it is extended. Planned lease/purchase transactions must still match their current quote and pass simulation.

Delivery inventory permission does not authorize payment. Acceptance refreshes the delivery price and the origin's current controlling crew's delegate. A changed price requires review; zero-price acceptance emits no SWAY transfer.

## Regression checks

Run client unit tests with mocked data and policies:

```sh
CI=true npm test -- --watchAll=false --runInBand
```

Authorization-specific tests cover component completeness, inclusive boundaries, active-tenant precedence (including planned-site repossession), crew/ship docking grants, stale responses, pre-submit changes, candidate batching/pagination, production completion and quote checks, and delivery payments. Tutorial entities explicitly provide their mocked permission components.

The contracts are not deployed. Do not substitute deployed-contract or browser integration tests for these unit checks.

## Transport and completion-time alignment in SDK 2.7.2

The current contracts and SDK agree that the speed bonus affects instant transport. They compare `distance / speedBonus <= baseFreeRadius * distanceBonus`; the physical instant-transfer radius therefore includes both bonuses, and its boundary is inclusive. The client delegates timing to `Asteroid.getLotTravelTimeReal` and displays the same rule in transfer-distance tooltips. Food resupply retains its contract-specific no-penalty bonus floor.

The current processing contract calculates the input leg from origin to processor, matching the existing client route. Input and output storage sharing a lot does not remove the trip to a processor elsewhere. These updates resolve the two timing differences identified in the previous review. Production authorization continues to use the calculated completion time, with fresh permission checks and transaction validation.

SDK 2.7.2 resolves the remaining rounding-order issue. The client uses whole real-time SDK helpers for every hopper leg and rounds production phases independently before summing. Processing uses `Process.getSetupTimeReal` and `getProcessingTimeReal`; extraction uses `Extractor.getExtractionTimeReal`; assembly uses `Time.toRealDurationCeil` per phase. Crew labor uses `Time.getCrewLaborDuration`, and display/submission completion checks use `Time.getProductionCompletionTime` with whole-second inputs.

The shared trip estimator, delivery/marketplace estimates, sampling, stationing, launch/landing travel, movement visualization and tutorial travel now use the same per-leg helper. General orbital/calendar conversions and dock queue calculations retain their separate semantics.

The regression example (asteroid 1, lots 1 and 102, acceleration 24) now produces two 341-second legs, totaling 682 seconds. Unit coverage checks that a lease one second short is rejected and exact completion coverage is accepted, including after fresh submission reads.

## Follow-up review

The additional review removed wallet crew-list control gates from construction, scanning, travel and administration UI, replacing them with SDK controls. Wallet asset listings and ownership indicators remain presentation; exact pilot/tenant identity checks remain where required by contracts. Policy descriptions and lease/auction price helpers also remain presentation, not permission decisions. No direct `Permission.isPermitted` calls or `crewStatus` comparisons authorize actions.

Additional fixes and regressions cover:

- Selected-crew changes invalidate captured and in-flight submission checks.
- Proposed deliveries source from REMOVE_PRODUCTS-authorized inventories, retain checking state for unresolved destination access, and describe acceptance by any ADD_PRODUCTS-authorized crew.
- Fresh production completion times must fit within the quoted new lease, including the exact end boundary.
- Agreement lookup and edits preserve entity label plus ID; account grant matching normalizes address padding. Allowlist edits preserve ship-versus-crew identity.
- Crew eviction and repossession refresh emergency mode on the current ship or escape module, alongside delegation, roster, readiness and location. Forced ship launch keeps its distinct contract prerequisites.
- Lease-auction start requires confirmed absence of the recorded tenant's USE_LOT, not merely an expired prepaid agreement. A concurrent tenancy change remains unresolved.
- Bulk purchases and escrow buy-order creation use the underlying transaction permission preflight.
- Planning and ship eviction reuse the shared external-policy reader with an explicit block. The unused boolean permission adapter was removed.

The transaction preflight maps supported systems to SDK primitives; it is not a replacement for every contract precondition or simulation. Auction pricing, inventories, travel timing and payment requirements remain separate concerns.

Recruitment into an existing crew uses SDK permission checks, including submission preflight. Starting a new crew opens setup with an explicit creation-time access label: its ID does not exist until contract execution, so the client must not substitute the selected crew's entity grants. That creation path relies on transaction validation for the new identity, rather than claiming a resolved SDK authorization before it exists.


## Whole-second timing (SDK 2.7.2)

Production estimates round each travel leg and each setup/production phase to whole real-time seconds using SDK helpers before summing or taking a positioning maximum. Shared crew trip details use `Asteroid.getLotTravelTimeReal`; processing uses `Process.getSetupTimeReal` and `getProcessingTimeReal`; extraction uses `Extractor.getExtractionTimeReal`; assembly rounds each phase with `Time.toRealDurationCeil`. Crew labor uses `Time.getCrewLaborDuration` after summing production phases.

The same integer task duration feeds display, lease quotes, and production authorization. `Time.getProductionCompletionTime` uses the later of block time and crew ready time and refuses fractional durations during fresh submission checks. Two legs of 340.208 seconds require 682 seconds, so a lease ending at 681 seconds is rejected. No buffer is added, and the existing origin-to-processor route is preserved. These callers require SDK 2.7.2; refresh the client's SDK lockfile after that version is published (the existing semver range includes it).
