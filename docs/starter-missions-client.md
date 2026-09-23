# Starter mission client foundation

The client uses SDK 2.6.4. The client deliberately excludes
all marketplace actions from campaign wrapping: Close the Production Loop is
use-or-deliver only. The server must expose the SDK 2.6.4 binding endpoint described
below. Production fingerprints cover only the retained Processor component.

## Data and artwork

`useStarterMissions(crewId)` reads `/v2/missions/starter/:crewId` through the
existing authenticated API client. Its query key contains the chain, API URL,
and canonical decimal crew ID. IDs and micro-SWAY remain exact strings; use
BigInt for token arithmetic. No request is made without a crew/session or during
simulation.

`STARTER_MISSION_IMAGES` in `src/lib/starterMissions.js` maps all eight SDK IDs to
licensed-media keys. Pass a key to `getLicensedAssetUrl`. The two new images must
still be published in the media bundle and the directory CID updated.

## Acceptance, claims, and reconciliation

`useStarterMissionManager()` exposes `accept(missionId)`, `claim(missionId)`,
`validate(missionId, delivery?)`, `complete(missionId)`, `getPending(missionId)`, and `canManage`, plus
the query result. `canManage` checks delegation only; UI buttons must also inspect
the server flags and pending state. Validation without a delivery performs normal
evaluation. A delivery argument is an Entity `{ label: Entity.IDS.DELIVERY, id }`
for an already completed, campaign-bound delivery, not a packed entity UUID.

Submissions fetch a fresh mission view and check assignment, delegation, and
operation availability. Acceptance uses `canAccept`; claims use `claimable`
independently of eligibility. Wrapped actions and validation require acceptance
and eligibility. In-flight and pending operations are matched by campaign,
subject, and mission. Successful receipts settle mission lifecycle transactions, including
validation that emits no lifecycle event, and invalidate mission queries.
Wrapped gameplay keeps its existing activity-based pending-state settlement.

## Gameplay wiring

Existing managers take an optional mission ID:

| Manager | Signature |
| --- | --- |
| Construction | `useConstructionManager(lotId, missionId)` |
| Core sampling | `useCoreSampleManager(lotId, missionId)` |
| Extraction | `useExtractionManager(lotId, slot, missionId)` |
| Processing | `useProcessManager(lotId, slot, missionId)` |
| Delivery | `useDeliveryManager({ ...filters, missionId })` |
| Food resupply | `useFeedCrewManager(missionId)` |

Mission ID 0 is valid. Without an explicit ID, managers consult the shared action-dialog
campaign context when present; callers outside that context retain ordinary gameplay.
The context restores participation using the binding endpoint and a scoped player
preference. It does not infer action binding from eligibility alone.

The shared `useStarterMissionExecution` passes a mission assignment through the
fourth `execute` argument. The transaction pipeline retains native transaction
keys/vars for existing pending and activity consumers, storing the assignment in
transaction metadata. It serializes native arguments via the SDK, excluding
`caller_crew` (supplied by the mission wrapper).

Allowed actions are ConstructionPlan/Start/Finish, SampleDepositStart/Finish,
ExtractResourceStart/Finish, ProcessProductsStart/Finish, SendDelivery,
ReceiveDelivery, and ResupplyFood. Construction abandonment, sample improvement,
paid delivery acceptance, market orders, and market resupply are not mission
actions. An explicit mission request for an unsupported action is rejected; it
never silently submits uncredited gameplay.

For FlexibleExtractResourceStart and LeaseAndProcessProductsStart, existing
lease/purchase/payment calls remain native, and only extraction/processing is
wrapped. They are separate dispatcher calls, not paid-context mission callbacks.
The contract still enforces campaign construction and crew control; leasing some
other crew's building does not make it qualify.

Mission actions remain subject to contract rules: supported building types,
campaign warehouse binding, initial sample bindings, a single qualifying
extraction, whole recipes, distinct delivery endpoints, and actual food inventory
consumption. Mission screens must guide those requirements; the adapter is not a
second implementation of the contract. A rejected wrapped transaction must be
corrected, not retried automatically as an ordinary action.

## Missions interface

`/launcher/missions` opens the Missions menu (the existing trophy icon and Ctrl+4
shortcut are retained). The deprecated colonization/community catalog and client
referral capture, login fields, links, and `/play` landing interception are removed.
Configured Social Quests remain available separately.

The starter campaign expands into mission rows and uses a shared status presenter
for the compact list and image-led `DetailsModal` / `HeroLayout` details. Completed entitlements
remain visible after a crew loses eligibility. The modal supports acceptance,
claims, and validation, with pending/delegation guards. Sample progress and route
stage evidence are shown explicitly; unrecorded continuous progress is not inferred.

Mission details contain a briefing and a vertical timeline: acceptance, individual
objectives with optional guidance, and completion with the reward. `complete` claims
directly when the reward is already claimable. Otherwise, the virtual
`CompleteStarterMission` transaction batches `MissionValidate` and `ClaimMissionReward`
atomically. A fresh mission view must confirm acceptance, eligibility, earned
objectives, and an unclaimed reward before that batch can be submitted. It uses the
same assignment-scoped pending guard and receipt reconciliation as other mission actions.

A single `StarterMissionSync` mounted with the main interface loads starter state on
startup and crew changes. Other consumers share its query cache without duplicating
mission-event subscriptions. Mission queries refresh from named socket events, relevant campaign constants,
processor catch-up messages, and reconnects. Socket rooms now support overlapping
subscribers without leaving the room when just one subscriber unmounts.

## Remaining work

- Deploy the updated campaign implementation hash and server release; confirm activation constants are indexed.
- Optional guided links from mission details to gameplay locations.
- Mission lifecycle activity/toast presentation.
- Sepolia end-to-end verification, especially mixed payment/gameplay multicalls
  and delivery reconciliation, before enabling the feature.

### Mission stories and related assets

Add narrative copy in `src/lib/starterMissionStories.js`, keyed by the SDK mission key.
Each entry is an array of plain-text paragraphs. Nonempty stories appear as a Mission
briefing above the objective; empty entries render no placeholder.

`MissionSidebar` derives building types and example process outputs from SDK mission
requirements. Examples are labeled as such, rather than implied requirements. The
production-loop route selector previews SDK route inputs, intermediate, final outputs,
and associated buildings; it does not select or submit a route for the player.
The sidebar stacks below the main content on narrow screens. Thumbnails reuse the
existing sprite atlases and resource thumbnail component.

### Objectives and gameplay guidance

The HUD's Objectives section combines activities and mission rows under Ready and
In Progress. Eligible crews see one invitation before accepting the campaign.
The invitation opens Missions with the starter campaign expanded and disappears
after the first acceptance.
Available subsequent missions also appear as Ready. Claimed missions leave this
operational list but remain in the Missions catalogue. Finish All continues to
operate only on activity finish calls, never mission acceptance or reward claims.

Tab and collapse preferences are persisted locally per chain, API, crew, and
campaign. The default is Ready and expanded. Accepted missions and pending transactions
appear in In Progress independently of crew activity. Missions with recorded work
ready for finalization, or rewards ready to claim, appear in Ready.
Authoritative claimable rewards remain Ready regardless of crew eligibility.
Mission rows reuse the activity row styling and status palette, displaying only
the title, status icon, and compact details/guidance actions.

Each requirement in an accepted MissionDialog links to a short guide. Opening a guide closes
the modal and launcher, preserving the selected world entities. The accepted
mission row also opens its first unconfirmed requirement. Lea offers guidance
after the first acceptance when the player returns to gameplay; the offer can be
dismissed and is remembered locally. Guides never submit transactions or select
lots, buildings, recipes, or inventories. Existing neutral coachmark controls are
reused, with highlights suppressed while action dialogs are open or the crew is busy.

Guidance is centered at the bottom and remains open until explicitly dismissed
with its X control, including through action timers.
Back/Next only navigates explanatory pages. Mission progress continues to come
from campaign evidence. Crew/campaign changes discard the open mission guide or
detail modal. Help's Gameplay Guides tab exposes the same topics without campaign
requirements to crews outside eligibility. Training keeps its separate flow.

Content editors should update `src/lib/starterMissionStories.js` for the eight
briefings and `src/lib/missionGuidance.js` for reusable topics and campaign advice.
Provisional text is enclosed in `[DRAFT]` markers. Requirement labels and numeric
thresholds remain derived from the mission view rather than duplicated in copy.
The old tutorial checklist, progression hook, and settings toggle have been removed.


## Shared action-dialog campaign integration

Supported action dialogs expose one campaign participation control after the crew has
accepted a mission. The choice is persisted per chain, API, campaign, and crew. The
shared execution hook uses that context; existing managers keep their native action
keys, inputs, transaction metadata, and wallet options. No individual mission ID is
stored against a building or action: campaign evidence is shared across objectives.
An accepted, unfinished mission is used as the wrapper assignment when available;
otherwise another accepted mission remains a valid assignment.

`MissionActionContext` checks bindings when a supported dialog opens, including after
reload. A matching binding restores campaign participation. The shared footer shows
verification problems and disables campaign submission while checks are unavailable.
Ordinary unbound actions remain native when the player has not opted into the campaign.
Unknown or mismatched finish bindings do not silently fall back to native execution.

`missionBindings.js` defines native action binding requirements, while
`useMissionBindings` handles authenticated cached API queries. Keys include chain, API,
campaign, packed crew UUID, kind, packed target UUID, and slot. Mounted queries refresh
on relevant component/mission events, indexer catch-up, reconnect, and periodically while
evidence is unavailable or unbound. Successful mission transaction receipts invalidate
both bindings and starter state. Pending and unbound states are not transaction failures.

Immediately before a wrapped transaction, the transaction pipeline reloads starter
state and verifies the necessary bindings. Extraction and processing also require
matched `Built` evidence. Incoming receipts into the campaign Warehouse's storage slot
may have an unbound Delivery: the contract can bind them at receipt. That exception
still requires matched Warehouse construction and does not apply to unknown or
mismatched delivery evidence. Downstream route masks and EconomicDelivery flags are
not matching fingerprints and remain untouched in API responses.

The sidebar and campaign progress remain read-only summaries, not permission gates.
Existing ownership, readiness, delegation, payment, and contract checks still apply.
Market orders, exchange food resupply, and paid delivery acceptance are not campaign
work; an opted-in unsupported submission is rejected rather than silently downgraded.

### Deployment and live verification

Deploy the revised campaign implementation hash and SDK 2.6.4 server release, and
confirm the earlier activation constants are indexed. ProcessType definitions and
backfills are no longer prerequisites for binding verification. Process fingerprints
are computed by the server from retained Processor event data only.

`unknown` with reason `processor_not_running` can occur between the processor reset
and the clearing of campaign evidence during completion indexing. It remains an
unavailable verification state: the client waits/retries and does not submit a mission
action or silently switch to an ordinary finish. A changed binding response also
refreshes the crew's starter summary, including when socket events were missed.

Verify with a prerelease crew: accept Make Landfall, enable campaign participation in
Plan Building, and plan a Warehouse. Confirm the warehouse and completion appear in
Missions. Then test a sample start, close/reload/reopen, and finish; repeat for a
constructed Extractor/processor and for a campaign Warehouse receipt from a sender
outside the campaign. Confirm normal unbound actions still work with participation off.
These wallet transactions and remote deployment changes have not been performed by this change.

Starter state must finish loading before a supported authenticated action can be
submitted. Simulation and signed-out gameplay keep their existing execution paths.
Changing crew, chain, or dialog target cancels pending client-side mission preparation.
For delivery dialogs entered via a transaction link, the delivery manager publishes
the resolved entity ID to the shared context so binding queries use the actual Delivery.
