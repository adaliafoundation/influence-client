# Runtime client configuration

The release image is built without operator configuration. The same image digest
runs against prerelease or production; supply public service endpoints and optional
integration IDs when starting the container. No rebuild is needed.

## Configuration contract

`src/appConfig/_default.json` declares every supported key and its type.
`prerelease.json` and `production.json` contain shared network facts: chain IDs,
contract addresses, network-specific public links, and application defaults.
The content-addressed client media CID is versioned with the client. Service
endpoints, account IDs, and keys belong in the operator's untracked environment.

Names follow the config path: `Api.influence` becomes
`REACT_APP_API_INFLUENCE`. Boolean overrides accept `true`, `false`, `1`, or `0`.
`Banxa.minFiat` must be a positive number. All other values remain strings,
including chain IDs and contract addresses. Empty strings disable optional services;
they do not restore a preset value.

Browser precedence is runtime environment, then build-time environment, then
network defaults, then shared defaults. The server uses its process environment
with the same resolver. The container has no build-time operator values.

`REACT_APP_CONFIG_ENV` must be `prerelease` or `production`. Production requires
an explicit selection. Development and tests default to prerelease. `NODE_ENV`
is controlled by the build tool and must not be used to select a network.

## Required services

Copy `.env.example` to an untracked operator file and fill in:

| Variable | Purpose |
| --- | --- |
| `REACT_APP_CONFIG_ENV` | Network preset |
| `REACT_APP_API_INFLUENCE` | Influence API, including its WebSocket service |
| `REACT_APP_API_IPFS` | IPFS gateway serving the versioned media CID |
| `REACT_APP_API_AVNU` | AVNU API for purchase and transaction swaps |
| `REACT_APP_STARKNET_PROVIDER` | Starknet RPC 0.10 endpoint for the selected network |
| `REACT_APP_ETHEREUM_PROVIDER` | Ethereum RPC for the built-in asset portal/bridge |

Use HTTP(S) URLs. Browser-facing endpoints must be reachable from players'
browsers, support the deployment origin where applicable, and match the selected
network. RPC provider keys in URLs are public browser credentials; apply the
provider's origin restrictions. Private credentials belong on a backend.

Startup rejects missing required settings and malformed service URLs, naming the
variables without logging their values. This checks configuration shape, not
service availability, credentials, CORS, backend compatibility, or RPC chain IDs.

### Starknet RPC compatibility

The client, AVNU SDK, and Cartridge Controller use Starknet.js v10. Both
`REACT_APP_STARKNET_PROVIDER` and the optional backup must use RPC 0.10 endpoints.
For Alchemy, use `/starknet/version/rpc/v0_10/`. The client does not rewrite URLs or
negotiate an older RPC dialect. Cartridge uses its native RPCs for Mainnet and
Sepolia sessions; custom chains use the configured endpoint. Paymaster URLs and
the backend's RPC configuration are separate settings.

## Optional integrations

| Variables | Behavior when unconfigured |
| --- | --- |
| `REACT_APP_PRIVY_APPID`, `REACT_APP_PRIVY_CLIENTID` | Influence Account login is hidden; Ready becomes the default for new players. The client ID is optional even with an app ID. |
| `REACT_APP_STARKNET_PAYMASTERPROXY` | Required if Privy is enabled; supplies authenticated sponsorship. |
| `REACT_APP_API_CLIENTID_STRIPE` | Starter packs are hidden. New-player recruitment uses normal crewmate recruitment; insufficient USDC prompts wallet funding. |
| `REACT_APP_API_BANXA` | Banxa funding is hidden; the other funding options appear directly without a dropdown. |
| `REACT_APP_API_CLIENTID_LAYERSWAP` | Layerswap is hidden from funding options. |
| `REACT_APP_API_CLIENTID_GOOGLE` | All YouTube-powered help tabs are hidden; the wiki remains available. |
| `REACT_APP_API_CLIENTID_GTM` | Google Tag Manager is disabled. |
| `REACT_APP_STARKNET_PROVIDERBACKUP` | Only the primary Starknet RPC is used. |
| `REACT_APP_STARKNET_PAYMASTER` | User-paid transactions require native STRK on a deployed account. Set this to the public AVNU paymaster URL to enable fee-token payment, including Privy swaps and NFT transfers; those actions never use the sponsorship proxy. |

Third-party integrations also require compatible backend services and provider
setup, including allowed origins/redirects. A public ID alone does not provision
those services. Banxa's configured base URL is also used to interpret funding
return/status URLs; checkout creation goes through the Influence API.

## Releases and deployment requests

Server and client use the same release entry points:

| Actions workflow | Trigger | GitHub environment | Image tags |
| --- | --- | --- | --- |
| Release prerelease image | Push to main or manual run on main | prerelease | stack-prerelease-COMMIT and stack-prerelease |
| Release production image | Manual run on main with a full main-history commit SHA | production | production-COMMIT, production, latest |

`docker-stack-prerelease.yaml` calls `docker-release.yaml` with `channel: prerelease`.
The manual entry point defaults to production. Tests, image scans, smoke checks,
and signing precede channel promotion. The same commit can be released separately
in both channels; immutable channel/commit tags cannot be overwritten. If publication succeeded
but the webhook failed, use the published digest and inspect the host before
retrying deployment; a full release rerun refuses to overwrite the immutable tag.

The environment job is named **Publish prerelease image and request deployment**
or **Publish production image** in both repositories. Configure each GitHub
environment to allow the main branch. Keep production's required reviewers;
prerelease should have no reviewers or wait timer for automatic releases.

In the prerelease environment, configure variable `STACK_PRERELEASE_WEBHOOK_URL`
and secret `STACK_PRERELEASE_WEBHOOK_TOKEN` when the host is ready. Leave the URL
unset during initial host preparation. Environment variables and secrets are
available to the environment job, not the image build jobs.

Only a release matching the current head of main advances the prerelease alias.
The notification step also checks that the alias still matches its image digest.
A blank webhook URL skips notification while still publishing the image.

A green GitHub environment entry means publication and any configured deployment
request succeeded. The webhook only acknowledges the request; it does not wait
for the host's integration tests, backup, container updates, or health checks.
Check the host's journal and stack status to confirm deployment completion.
Production host deployment remains manual using the released immutable digest.

See [Container vulnerability allowances](container-security.md) for scan gates and
exception handling.

## Running a release image

The release workflow currently publishes `linux/amd64`. The Dockerfile can also
build natively on ARM64, but multi-architecture publishing is not enabled.

```sh
docker run --rm -p 3000:3000 --read-only --cap-drop ALL \
  --security-opt no-new-privileges \
  --env-file ./client.env \
  ghcr.io/OWNER/influence-client@sha256:IMAGE_DIGEST
```

Place the container behind an HTTPS reverse proxy that sets
`X-Forwarded-Proto: https`. The application redirects ordinary HTTP page requests
to HTTPS. `/healthz` and `/runtime-config.js` are available for container checks.
The client image does not include an Influence backend, RPC nodes, or an IPFS service.

Server-only settings are `PORT` (default 3000) and optional `AUTH_PASSWORD` for
HTTP basic authentication. The image sets `REQUIRE_RUNTIME_CONFIG=true` and
`NODE_ENV=production`; keep those settings. `IMAGE_REVISION` is release metadata.
If changing `PORT`, also adjust the container's port mapping and healthcheck.

All `REACT_APP_*` values are public. `/runtime-config.js` exposes only declared
configuration keys, is served with `Cache-Control: no-store`, and is excluded from
service-worker precaching. Never supply private keys, provider secrets, or backend
credentials as client config. Unknown variables are ignored, not passed through.

## Development and verification

Use `.env.example` for local development too. Static builds embed local `.env`
values; do not distribute such builds as environment-neutral images. Docker's
build context excludes `.env` and `.env.*`, including local backups.

Run `npm run test:runtime-config` for config validation tests and `npm test --
--watchAll=false` for client tests. The release image smoke test checks required
configuration, runtime delivery, and HTTP assets for both presets. The browser
smoke test exercises the production bundle with runtime configuration and mocked
external services; it does not submit transactions or verify live providers.
