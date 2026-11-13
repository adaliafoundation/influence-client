# Private campaigns: browser proofs and encrypted peer backup

The client supports separate local-simulation and chain-backed campaigns. In chain
mode the SDK game adapter journals commitments, reads authoritative metadata and
future-block randomness, and submits the final proof through the normal transaction
pipeline. Local simulations remain explicitly separate and create no spendable claim.

## Shared encryption identity

Inbox messages, campaigns and future private records use the same wallet-recovered
private-data key. The legacy inbox signing message and derivation remain byte
compatible. Wallet recovery verifies the recovered key against the published inbox
public key; the account's Starknet signing private key never enters the client.

Unlock reconnects a restored login's wallet when necessary, retrieves its existing
recovery seed, asks for the existing signing message, then keeps the encryption key
in memory. First-time setup stores the recovery seed before submitting RekeyInbox
and reuses it on retries. It will not replace an existing identity with a missing
recovery seed. Existing API/contract names remain for compatibility.

No player encryption private key is persisted. Store version 12 removes the old
plaintext dmPrivateKey cache. Account/session changes clear the shared key; locking
private data also clears decrypted campaign observations and invalidates pending
recovery. Reload requires wallet unlock. Key rotation still requires migrating
ciphertext or retaining the old recovery material.

Optional passkey PRF wrapping is not implemented. It can later store an AES-wrapped
copy of this same key and require user verification, while retaining wallet
recovery. Saving an unwrapped CryptoKey alone is not that protection.

## Local durability

Records are scoped by chain, dispatcher, account, asteroid, starting lot and
material. Chain records additionally include the campaign ID, retaining earlier
claim histories when a new campaign starts. The encrypted payload contains identity, schema/rules/reward variant,
campaign context, ordered actions and salts, entropy, selection and claim index.
Derived observations and rendering geometry are reconstructed by replay.

Each action saves its complete pending input before resolution, then saves the
confirmed transcript before the UI accepts the result. Interrupted local actions
recover with the same entropy. Failed IndexedDB writes block further sampling;
revision checks reject competing tab writes. Claim quantity applies the agreed
+50% adjustment after rounding the original integer quantity.

## libp2p replication and recovery

Private-data networking lives in src/lib/privateData, separately from prospecting.
It uses WebSockets, Noise and Yamux with explicitly configured retention peers.
The node and record protocol can support other encrypted features later; chat is
not implemented by this change.

Uploads also carry an owner-signed forwarding authorization for the configured peer
group. Independent stack peers can replicate the encrypted snapshot among that group
over `/influence/private-replication/1.0.0`, keeping the original owner identity and
owner-only recovery. Grants last seven days and are renewed by later uploads; expiry
affects forwarding only. Operators must configure their replication destinations;
the browser's signature authorizes only peers in its configured list. Discovery and
browser-to-browser WebRTC remain future extensions.

An Ed25519 peer/signing identity is derived from the shared private-data key with a
separate domain. An opaque, key-dependent record identifier hides the lot/material
scope from retention peers. The client signs a canonical hash of the identifier,
revision, ciphertext and timestamp. Recovery verifies that signature before
accepting a record, then decrypts and validates its identity and replayed rules.
A peer cannot forge a different campaign merely by encrypting to a public key.

The retention peer authenticates the libp2p writer identity and writes ciphertext
atomically with file and directory fsync before acknowledging it. Writes compare
against the last acknowledged remote revision; equal revisions are idempotent only
for identical content. Stale or divergent device writes are rejected. An older
acknowledgment advances the replication base of a newer local write without marking
that newer write as backed up.

Sampling depends on the local save only. Replication runs in the background after
new saved revisions, on reconnect and every 15 seconds while this pane is open.
The UI reports backup success only after all configured peers acknowledge the
revision. Closing the pane leaves unsent ciphertext in IndexedDB; opening it again
resumes synchronization. Offline peers do not block local actions. Invalid signed
records and conflicting recovered histories do block recovery rather than silently
replacing data.

Once a stack has retained a signed snapshot and forwarding grant, server replication
continues while the browser is closed and resumes after server restarts. It cannot
recover newer local revisions that were never uploaded. Partial per-peer receipts
are remembered separately. A compare-and-swap retry can recognize an exact earlier
snapshot already signed by this device; unfamiliar remote histories are not overwritten.

After wallet unlock, opening the same starting lot/material checks remote backup
before loading the local campaign. A lost local record can be restored from a peer.
Conflicting device histories are preserved and rejected, not automatically merged.
There is no global private campaign directory yet: recovery currently requires the
same scope. Authoritative campaign discovery and freshness checks belong in the
chain adapter; a signature alone cannot prove that an isolated peer holds the latest
revision. Losing local storage before a backup acknowledgment still loses that work.

## Running a retention peer

From influence-server, run `npm run private-data`. The opt-in worker listens on
127.0.0.1:15179 by default, prints its authenticated multiaddr, and persists its own
identity and encrypted records beneath `data/private-records`. Configure that
multiaddr in `REACT_APP_APP_PRIVATEDATAPEERS`, then restart the client. The old sandbox
peer remains available for local experiments; it is no longer a server dependency.

The server verifies signed writes against the authenticated libp2p connection key,
limits payloads and per-peer/global record counts, and acknowledges after file and
directory fsync. It stores no player private key or plaintext scope. Run one worker
per directory and persist its `peer.seed`; public access needs a WSS/TLS proxy and
stable advertised address. See the server's `docs/prospecting.md` for configuration.

## Browser proving

After Select claim durably records the chosen claim, Generate proof downloads only
the key for that campaign length. A dedicated worker checks SHA-256/size descriptors
for its assets, generates Groth16, checks the expected public digest and verifies
locally. Progress and cancellation are exposed in the existing pane. Changing or
locking a campaign terminates its worker. Proofs can be regenerated from the saved
transcript; no private witness is sent to a prover service.

The fieldwork-r7-volume150-p10-v1 asset family uses one padded circuit for every length 1–10. Its circuit
matches the SDK model and its two-stage integer quantity rounding. Assets and verification
keys are versioned separately from the old reward experiment. These are disposable
single-party development keys; production setup remains deferred.

Generated assets are ignored by git and excluded from service-worker precaching.
Publish the matching development assets from influence-starknet (requires its proof toolchain):

```sh
node proofs/fieldwork/build.mjs --output ../influence-client/public/prospecting-proofs
```

This publishes one WASM/key/verification-key family and removes the old manifest’s
obsolete assets. Replacing keys also requires rebuilding/exporting the single Groth16
verifier and adapter, then refreshing SDK bindings before deployment.

## Validation and rollout boundary

Tests cover local ciphertext persistence, per-campaign isolation, wallet recovery,
missing hashes, failed writes, fixed time/block waits, stale writers, foreign peer
access, forged records and restarted disk storage. SDK proof statements and native
contract verification continue to use the same development key family.

The server indexes the public campaign/core components without treating their IDs
as entities, alongside real Claim/Deposit and ExtractorSlots metadata. Finalized
claim extraction uses those public components, not private local previews. Public
history can discover campaign IDs; a signed backup alone cannot prove that an
isolated peer holds the newest revision. Losing local storage before replication
still loses unsent private work, and an already-sampled campaign cannot be reset to
an empty record. Keep saved records and the shared recovery seed available.

Local deployment tests do not replace interactive wallet signing or the complete
asteroid playthrough. Production trusted setup, WSS operation and the final rollout
remain separate deployment decisions. No deployment or activation is performed.
