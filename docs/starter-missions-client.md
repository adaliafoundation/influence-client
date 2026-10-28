# Mission client integration (SDK 2.8.0)

Starter and colonization campaigns share lifecycle operations, transaction reconciliation,
mission lists, details, timelines, status styling, and buttons. The client uses the native
Dispatcher observer ABI; the retired `MissionAction` wrapper and its participation toggle,
dialog context, manager adapters, and persisted preference have been removed.

## Native action observation

`missionObservation.js` discovers candidates immediately before submitting each native
system call through `/v2/missions/observation-candidates`. Requests contain the system,
packed target, actual caller crew, and building type for construction planning. The server
resolves the target building's asteroid and campaign enrollment. It can nominate later
missions before individual acceptance, preserving construction and production provenance.

The shared transaction builder schedules SDK `begin_observation`, native execution, and
`end_observation` groups. Native transaction keys, variables, payments, wallet options, and
activity settlement stay intact. Composite actions observe their relevant native steps;
batched fills receive separate sequential groups. Pending metadata records the candidate
assignments. Successful receipts invalidate both campaign query families.

Starter candidates still require qualifying construction and matching action fingerprints.
`missionBindings.js` verifies those against the binding endpoint. Known unbound or
nonqualifying starter work stays native, while any colony candidates remain observed.
Unknown or mismatched bindings and candidate lookup failures stop preparation rather than
silently losing evidence. No on-chain failure is retried without observation.

Observation runs automatically for relevant actions; it does not depend on opening a mission
dialog, owning the target asteroid, or having an eligible starter crew. Simulation bypasses
the real transaction builder and cannot accept or claim missions.

Wallet session policies include `begin_observation` and `end_observation` on the Dispatcher.
Existing session-policy validation invalidates outdated saved policies.

## Marketplace and third-party evidence

Sell fills retain their existing SWAY transfer confirmations and native `FillSellOrder`
calldata, including the buyer crew. One invocation can nominate both the buyer's starter
storage/economic evidence and another player's colony commerce/capstone assignments.

Buy fills retain the stored withdraw hook and `Escrow.withdraw`. The SDK hashes the stored
native fields plus fill fields and the callback suffix: executing account, withdraw hook
type, token, actual withdrawal count, recipients and uint256 amounts. The expected immediate
caller is Escrow, not the executing account. `end_observation` makes a hash/caller mismatch
revert atomically. The observer does not change the order identity or payment recipients.
Buy cancellation skips observation even though it shares the fill hook. Order creation and
market food resupply are not supported observer actions.

Candidate discovery uses the exchange building's location, not the trader's owned asteroids.
Rewards remain assigned to the colony's original colonizer. The client neither substitutes
the trader as beneficiary nor requires the trader to control that colony.

## Colonization interface and authority

Missions presents Your Foothold in Adalia and Colonization as peer expandable campaign cards.
Each contains its mission rows; Colonization also contains a selector for wallet asteroids
and the currently selected asteroid. `MissionRow` shares presentation with future standalone missions.
`/v2/missions/colonization/:asteroidId` supplies all five definitions, lifecycle flags,
recorded objectives, original colonizer, current NFT owner, and selected-building readiness.

- Accept Claim a New World before the first surface scan starts; observe both start and finish.
- After the observed scan, Habitat, Spaceport and Marketplace branches can progress independently.
- Anyone may construct and use qualifying buildings. Construction must start after the scan.
- Acceptance and claims require the original colonizer to currently own the asteroid.
- Branch entitlements survive building loss; Found a Colony must have all three qualifying,
  used buildings operational when claimed. Its dialog shows current readiness even if its
  historical completed flag is already set.

`useMissionManager` shares acceptance, validation, claims, completion and pending matching.
`CompleteMission` batches validation and claim when recorded objectives are earned but not
yet claimable. The submission pipeline fetches authoritative state and checks the appropriate
crew-delegate or colony-owner authority before opening the wallet. It does not use lifecycle
ownership checks to gate third-party gameplay observation.

## Refresh and pending state

Query keys include chain, API deployment, and exact decimal subject ID. Entity labels are
included in assignment identities so asteroid and crew IDs cannot collide. `useMissionQuery`
shares receipt/indexed lifecycle reconciliation, debounced socket updates, processor catch-up
and reconnect recovery. Starter state has one background subscriber; the selected colony
subscribes to its Asteroid room and also polls while mounted for operational-state changes.

A receipt confirms execution; indexed lifecycle state clears mission pending controls.
Claim events also refresh SWAY balances. Colony queries refresh from third-party evidence
messages in the asteroid room, independently of the active crew.

## Mission guidance

Starter briefings remain in `starterMissionStories.js`; reusable gameplay guidance remains
in `missionGuidance.js`. HUD objectives and their existing guidance links retain starter
progress presentation. Colony details reuse the mission timeline with their own objectives
and ownership explanation, without starter-only recipes, samples or crew warnings.

`colonizationMissionContent.json` contains the authored colony briefs, reusable guidance
pages, and objective-to-topic mappings. The shared tutorial message renders both campaigns.
Colony guidance and its return-to-details action retain the asteroid subject and campaign;
their scopes cannot collide with crew scopes. Enrollment guidance is available before
acceptance, including when browsing without an asteroid. Scan and docking buttons register
coachmark targets alongside the existing construction, stationing, and marketplace controls.
The image paths in the content file are delivery paths; runtime artwork remains governed by
`COLONIZATION_IMAGES` and the licensed-media manifest until the new bundle is published.

## Verification

Client regression tests cover exact native and Escrow callback hashes, third-party buy/sell
fills, batch ordering and payments, combined starter/colony candidates, cancellation,
lookup failure, native fallback for known unbound starter work, campaign ownership,
subject-scoped pending reconciliation, and capstone operational readiness.

Live Sepolia wallet transactions are a separate end-to-end check: enroll an unscanned owned
asteroid, scan it, start qualifying construction, then fill a buy and sell order with another
account and confirm commerce evidence and rewards remain on the original asteroid assignment.

## On-chain campaign visibility

The Missions page uses `useMissionCampaigns` to read the indexed
`STARTER_MISSION_CAMPAIGN` and `COLONIZATION_CAMPAIGN` constants and their registered
campaign definitions. A missing/zero ID or missing definition hides the campaign.
The definition must contain the expected number of missions (eight starter, five
colonization); starter also requires `STARTER_MISSION_CUTOFF`, matching the summary API.
This lookup is independent of crew eligibility and asteroid ownership, so an active
colony campaign can still be browsed before purchasing an asteroid.

Campaign status refreshes when Missions opens and on window focus, using the normal
query lifecycle without a polling timer. Changes become visible after server indexing
and the next refresh. Setting a campaign
constant to zero disables its visibility; restoring the same registered ID restores it
without creating a different campaign. This uses the actual contract configuration,
not a display-only flag: disabling the ID also affects contract mission operations.
Lookup failures show a retry state instead of claiming that campaigns are inactive.
