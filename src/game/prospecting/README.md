# In-scene prospecting

The client uses SDK **2.9.0-rc.2** and retains the existing Voronoi/depth-cut asteroid
view. Two explicit modes keep local playtests separate from gameplay transactions.

- `App.prospectingMode=local` is the default. `App.enableDevTools` exposes the local
  simulation and mining preview, using instant local entropy and rendering metadata.
- `App.prospectingMode=chain` exposes the actual game campaign and extraction flows.
  Set `REACT_APP_APP_PROSPECTINGMODE=chain` only against a Dispatcher whose matching
  systems and verifier are registered and activated. This flag also enables the
  prospecting interface outside dev tools. Missing systems fail rather than falling
  back to simulated results. No deployed addresses or activation constants are changed.

## Chain playthrough

1. Select a resource in Resources and open Prospect on a permissioned starting lot.
2. Unlock the shared inbox/private-data key, then start the on-chain campaign. Choose
   a Core Drill inventory, or use an available starter sample allowance.
3. Follow, Cross-cut or Characterize a reachable segment. A sample's complete intent
   and salt are encrypted and saved before submission. Its target lot, commitment,
   index and inventory are public; the method, source, depth and observations stay private.
4. Wait for the scheduled work and fixed future-block draw. Reconciliation verifies
   the saved intent against the accepted core, durably saves its result, then reveals
   it. A matching core recovers a wallet submission even when its hash was lost.
   Rejected/unknown submissions retain the same action and commitment; no new entropy
   is chosen during recovery. A submitted transaction needs a confirmed revert to retry.
5. Select one productive claim after 1–10 samples. Generate and verify its Groth16
   proof in the browser, then create the claim on chain. The transaction uses the
   ordinary fee/session/mission-observation pipeline. Proof generation alone creates
   no spendable claim. Finalization remains possible after origin permission revocation.
6. The resulting Deposit/Claim is indexed by the server. Its extractor must be on
   the claim's own lot. The regular extraction dialog offers constant-rate claims
   and baseline resources above the global cutoff, with the existing destination,
   capacity, facility lease and deposit-purchase flow. Trace resources require claims.

An abandoned campaign retains its real 24-hour replacement deadline. Replacement
retires the old campaign ID and proof. There is one occupying campaign per origin,
not one per crew/account or material. Starting extraction does not invalidate old
samples; any RUNNING target slot blocks a new sample, including finished jobs that
await collection. Existing extraction finish uses its stored output and timing.

The starter prospecting mission retains its ID/reward and requires one finalized
campaign claim of at least 1,000 tonnes. Historical partial sample counters do not
satisfy this objective. Existing completed mission flags remain valid.

## Legacy sampling transition

In chain mode, the prospecting sidebar also shows this lot's pending legacy samples
and improvements, including their existing timers and completion transactions.
Activity links and old sampling action links redirect to this pane; legacy dialogs
are used only before activation. Completion uses `SampleDepositFinish` with the
sample owner's crew, independently of the selected crew, campaign encryption keys
or new proof generation. An in-flight legacy job is never converted into a new
campaign or awarded a second balance. Existing jobs retain their committed results.

The resources pane and extraction flow treat finished deposits without `Claim`
metadata as default-grade claims, preserving identity, permissions and balances.
Running extractions continue to use their stored output and finish time. New grants
provide 10 / 15 / 20 sampling uses; existing granted balances are not rewritten.

## Implementation

`chainCampaign.js` implements durable sample intents, chain reconciliation, private
transcript checks and finalization. `useChainCampaign.js` connects it to the current
crew, RPC provider and normal transaction context. `useCampaignStorage.js` owns
wallet-key unlock, local storage and eventual peer replication. `campaignRecord.js`
keeps local schema 1 separate from chain schema 2; neither can be relabeled as the other.

Chain records are encrypted under chain/Dispatcher/account/asteroid/origin/material
**and campaign ID**, preserving earlier claims when a new campaign starts. Missing
private data for an already-sampled campaign blocks continuation and requires
backup recovery; the client never seeds a fresh transcript over accepted work.
The public server campaign-history endpoint can discover campaign IDs, while the
RPC provider remains authoritative for commitments, timing and current status.

Rendering reach and ore-chance shading are previews. Paid actions use canonical
fixed-point metadata and approach masks from SDK `Prospecting.Game` RPC reads.
Quality stays neutral at 10000 BPS. The circuit supplies the agreed +50% quantity
adjustment once; the UI and contracts do not add another multiplier.

## Private backups and tests

Run the server's `npm run private-data` worker and configure its printed multiaddr
in `REACT_APP_APP_PRIVATEDATAPEERS`. Public browser deployment needs WSS/TLS, a
persistent volume and an operated capacity policy. Local writes do not wait for
remote acknowledgments. See [PRIVATE_DATA.md](PRIVATE_DATA.md).

Use the repositories' pinned Node 22 runtime. Focused tests cover durable writes,
uncertain broadcasts, fixed entropy, encrypted recovery, campaign isolation,
permissions and the baseline authorization path. The production build compiles
both browser and serving bundles. Matching development proving assets remain in
`public/prospecting-proofs`; regenerate them through influence-starknet's `proofs/fieldwork` builder. One padded
circuit and key serve every campaign length; keep the deployed verifier in sync.

The contracts runtime harness can exercise this client controller on an isolated
local chain. Actual wallet signing, deployment-specific indexing and the full
asteroid interaction still require a manual integration playtest. Production
trusted setup and key selection remain deferred; no activation is performed here.

The worker requires the rc.2 padded proof format. Publish/install that SDK release
before rebuilding client/server containers. Installing only rc.1 alongside the new
asset manifest deliberately fails rather than producing a mismatched proof.
