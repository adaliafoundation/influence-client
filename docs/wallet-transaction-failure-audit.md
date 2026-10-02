# Wallet and transaction failure response audit

Historical audit before the notification migration. See [current error-handling conventions](error-handling.md) for the implemented behavior.

Audited against the local client checkout on 2026-09-30. This is a static code-path audit, including the recent restriction of fee top-up prompts to insufficient-balance/funds errors. No wallet transactions or deployed-contract tests were performed. This document describes current behavior; it does not implement the proposed changes.

Scope: shared wallet connection/login, gameplay transaction submission and monitoring, fee-payment dialogs, action-specific permission feedback, and adjacent bridge/funding/purchase flows. Messages originating inside wallet extensions, Privy, Stripe, Banxa, or Layerswap are controlled by those providers and are not fully catalogued here. Raw provider/server messages below are dynamic, not fixed client copy.

## Presentation conventions

- **Popup alert:** a top-center notification, not a modal. Generic alerts use a warning icon. Callers can set a warning border and duration. An omitted duration defaults to persistent until dismissed; it does not automatically mean five seconds.
- **Modal:** the fee-payment dialog with explicit confirm and “Not Now” buttons.
- **Inline:** text within the currently open action dialog or store page.
- **Failed activity:** a dismissible failed transaction entry in the action list. The formatting uses the action's label and a failed indicator, rather than displaying the full raw error. When a transaction hash is available, clicking can copy diagnostics and open the explorer.
- **Silent:** no additional client message; there may still be a wallet-provider message or console logging.

Sources: `src/game/interface/Alerts.js`, `src/lib/getAlertContent.js`, `src/game/interface/hud/ActionItem.js`, `src/lib/actionItem.js`.

## Connection, login, and session failures

| Trigger | Response | Current message / behavior |
| --- | --- | --- |
| Wallet connection needs user choice | Login UI | Opens the wallet-selection flow; no error required. |
| User cancels login | Silent | Resets auth state without an error popup. Cancellation detection accepts several provider codes, names, and messages. |
| Background reconnect cannot find connector, or is cancelled | Silent | Returns to idle/authenticated status as appropriate. Other background connection errors generally are not surfaced by the manual-error branch either. |
| Manual connector returns no account | Warning popup, 10 s | “[Wallet name] did not return an account. Please try again.” |
| Wrong chain and chain-switch attempt fails | Warning popup, 10 s | “Incorrect chain, please switch to [configured chain]” |
| Login challenge has unsupported typed-data domain | Warning popup, 10 s | “Login could not be signed by this wallet. Please try another wallet or report this issue.” |
| Wallet cannot sign login challenge | Warning popup, 10 s | “This wallet could not sign the login challenge. Please try reconnecting or use another wallet.” |
| Gameplay-session approval not completed | Warning popup, 10 s, unless handled as cancellation | “Gameplay session approval was not completed. Please try logging in again.” |
| Other login/connection/signature error | Warning popup, 10 s | `userMessage`, then raw string/message; otherwise “An unknown error occurred, please check the console for details.” Call sites also supply “Please try again.” / “Signature verification failed.” fallbacks. |
| Insecure-session upgrade fails inside authentication | No dedicated popup in that catch | Returns false; transaction callers can translate this into “Please sign in to continue.” |
| Connection error after an API session already exists | Popup plus disconnect | Disconnects the wallet only when the API session remains valid; otherwise logs out/reset. |

Sources: `src/contexts/SessionContext.js`, `src/lib/privyAuthErrors.js`.

## Before transaction submission

| Trigger | Response | Current message / behavior |
| --- | --- | --- |
| Permission revoked | Persistent warning popup | “Access has changed. Review permissions before submitting.” Returns the denied result; no transaction. |
| Permission cannot be resolved | Persistent warning popup | “Unable to confirm permissions. Please try again.” Returns unresolved; no transaction. |
| Wallet missing, reconnect fails or times out | Persistent warning popup | “Reconnect your wallet to continue.” Connection waiter times out after 30 seconds once login returns. |
| No matching system contract/configuration | Persistent warning popup | “Contract is invalid.” |
| Wallet locked/unavailable | Persistent warning popup | “Account is unavailable.” |
| Empty manually supplied call list | Console only | Logs “no calls included in executeCalls input”; returns without a transaction. |
| Session upgrade required and fails | Warning popup, 10 s | “Please sign in to continue.” Can also create a failed activity for system transactions. |
| Explicit purchase authorization fails | Usually silent cancellation | Creates an error with “User rejected explicit transaction authorization.” and `userMessage` “Please authorize this purchase to continue.” The rejection filter suppresses that user message. Most signing exceptions are converted into this rejection, except encoding/missing-data failures. |
| Sponsored-only wallet has unavailable sponsorship | Warning popup, 10 s | “Sponsored transactions are temporarily unavailable. Please try again shortly.” |
| Deployment unsupported | Error passed to caller | `userMessage`: “Account deployment is not available for this wallet.” Store setup may display it in an alert. |
| Deployment data incomplete | Error passed to caller | `userMessage`: “Account setup is incomplete. Please reconnect and try again.” |
| Purchase price exceeds combined wallet balance | Generic failure popup + failed activity | Error carries `additionalFundsRequired` and `additionalFundsToken`, but the system catch checks `additionalUSDCRequired`. This producer/consumer mismatch prevents that specific recovery branch from recognizing this error. |
| Missing balance, invalid pricing token, mixed currencies, unavailable swap liquidity, or mission assertion failure | Generic failure popup, usually failed activity | These throw plain errors. The shared user-facing fallback is “Transaction failed. Please try again.”, hiding the more specific reason from the popup. |

Sources: `src/contexts/ChainTransactionContext.js` (`requireExplicitAuthorization`, `deployAccount`, `executeCalls`, `executeSystem`, configured contract `execute`).

## Fee-payment modal catalogue

All of these have a “Not Now” button. Declining fee authorization cancels the submission and suppresses the generic transaction-failure alert.

| Type / title | Body | Confirm button / effect |
| --- | --- | --- |
| TRANSITION — Starter Provisions Complete | “The Prime Council underwrote the network clearance for your crew's first operations. Those provisions are now complete.” / “Your crew now operates independently. There is no subscription—you only pay a small network fee when your crew acts. Influence uses the AVNU fee tokens you authorize, with STRK as a fallback.” | Continue Operations; acknowledges paid fees. |
| USDC — Authorize Operational Fees | “Your crew's starter provisions covered the network clearance for its first operations.” / “From here, each order carries a small network fee. There is no subscription—you only pay when your crew acts. Allow Influence to pay those fees from your USDC balance through AVNU?” | Allow USDC Fees. |
| SWAY — Authorize Operational Fees | “Your crew needs network clearance to continue this operation.” / “Allow Influence to pay the small per-action fee from your SWAY balance through AVNU when USDC is unavailable?” | Allow SWAY Fees. |
| PAYMASTER_UNAVAILABLE — Sponsored Fees Unavailable | “The paymaster is temporarily unavailable. You can continue by paying network fees from your STRK balance.” | Continue with STRK. |
| TOP_UP_STRK — STRK Required for Network Fees | “We could not complete this transaction with native STRK fees. Gasless fee payment is currently unavailable.” / “Check your balance and transfer STRK to your account on Starknet to pay network fees, then try again.” Also shows account address. | OK; closes the modal. |
| TOP_UP — Operational Reserve Required | “We could not complete this transaction using the available network fee payment methods.” / “Check your balance and top up your account with USDC or STRK to pay network fees. There is no subscription—you only pay when your crew acts.” | Top Up Wallet; opens store/SWAY page. |

Current trigger behavior:

- Already-enabled fee tokens are tried first; new tokens require consent.
- Estimation failures can fall through silently to another fee token or native STRK.
- Paymaster unavailability can fall back to native fees. Ambiguous execution failures are not automatically resubmitted through another method.
- Native insufficient balance/funds errors trigger TOP_UP or TOP_UP_STRK. A pending signature, timeout, network failure, ordinary execution error, or insufficient **max fee** alone does not trigger these prompts after the recent fix.
- Classification still uses message-text regexes, not a unified structured error model. An “insufficient balance” message alone does not prove which transfer/token caused it.
- TOP_UP_STRK can also be selected when paymaster usage was disabled, not necessarily when an outage was confirmed; its “currently unavailable” copy is broader than the proven condition.

Sources: `src/components/TransactionFeePrompt.js`, `src/lib/transactionFees.js`, `src/contexts/ChainTransactionContext.js`.

## Wallet submission errors and confirmed/uncertain chain outcomes

| Trigger | Response | Current message / behavior |
| --- | --- | --- |
| Recognized user rejection (`USER_REFUSED_OP`, `User abort`, `User rejected`) | Normally silent | Generic popup suppressed. Failed-history filtering uses a separate, case-sensitive regex, so classification is not fully consistent. |
| Other submission exception | Warning popup, 10 s; system path usually adds failed activity | `error.userMessage` or “Transaction failed. Please try again.” Manual `executeCalls` rethrows; `executeSystem` generally consumes the error after reporting. |
| Exact message `Timeout` | **Two popups** | Generic transaction-failed popup (10 s), then “Previous tx is not yet accepted on l2. Wait for the extension notification and try again.” (5 s). Failed-history entry suppressed. |
| Other message containing `Timeout` | Usually generic popup | Failed-history entry suppressed by substring even when it is not the exact timeout that receives the special explanation. Lowercase variants need not match that history filter. |
| Expired/revoked wallet session | **Two popups**, potentially failed activity | Generic failure (10 s), plus “Your wallet session is no longer valid. Please try again to approve a new session.” (5 s). |
| Account not deployed / SNIP-9 incompatibility text | Deployment alert **plus generic failure**, potentially failed activity | Persistent alert: “You must deploy your account first. Click here to prompt a deployment transaction.” It hides the close icon and invokes deployment through the alert removal callback. |
| Transaction receipt wait rejects and no indexed activity is found | Failed activity; console logging | Stores error message or “Transaction was rejected.” Removes pending entry. There is no dedicated shared popup here. A receipt-fetch timeout/network failure is therefore capable of being represented as a failed transaction without a confirmed revert. |
| Receipt wait rejects but indexed activity already exists | No failure UI | Treats it as confirmed and clears pending entry. |
| Explicit REVERTED receipt found in background check | Failed activity; console logging | Stores `revert_reason` or “Transaction was rejected.” Checks start after 30 s, on subsequent blocks. No dedicated shared popup. |
| Background receipt lookup fails | Console only | `console.warn`; pending entry stays. |
| Missing transaction hash in pending history | Silent cleanup | Removes pending entry without user-facing error. |
| User clicks failed activity with transaction hash | Explorer + clipboard popup | Copies diagnostics, opens explorer, displays “Transaction error copied to clipboard. If you are stuck, contact the Influence team in Discord.” |

Sources: `src/contexts/ChainTransactionContext.js` (`handleExecutionExeption`, pending receipt effects, `onTransactionError`), `src/game/interface/hud/ActionItem.js`.

## Action-specific inline feedback

These can coexist with shared transaction alerts; there is no single consistent response contract across managers and dialogs.

| Action | Response | Current text |
| --- | --- | --- |
| Forced launch | Inline status, dialog stays open | Returned eligibility reason; controller drift: “Ship controller changed. Review the launch mode.” Catch fallback: “Unable to verify ship protection. Please try again.” |
| Planning | Inline status, dialog stays open | Returned planning reason; catch fallback: “Unable to verify planning permission. Please try again.” |
| Production permission/quote recheck | Inline message and permission retry | “Permissions or the job quote changed. Review the job before trying again.” Lower-level quote reason: “Access changed. Review the updated job quote.” |
| Mission verification | Inline status + Retry verification button | “Wait for campaign verification before submitting this action.”; “The starter campaign changed. Reopen this action.”; “This crew cannot perform campaign work.”; API failure: “Campaign verification is unavailable. Retry shortly.”; otherwise thrown message or “Campaign verification failed. Retry shortly.” |
| Other manager early returns | Caller dependent | Some return denied/checking results while their dialog handlers do not consume the result. For example the normal launch handler calls `undockShip` without displaying a returned failure, whereas the forced-launch handler reads its reason. A blanket claim that every denied action displays an explanation would be incorrect. |

Sources: `src/game/interface/hud/actionDialogs/LaunchShip.js`, `PlanBuilding.js`, `src/hooks/useProductionAuthorization.js`, `src/contexts/MissionActionContext.js`, `src/hooks/actionManagers/useShipDockingManager.js`.

## Adjacent bridge and purchase/funding flows

| Flow | Presentation and messages |
| --- | --- |
| Bridge wallet prerequisites | Popup, 5 s: “Connect an Ethereum wallet before bridging.” / “Connect your Starknet wallet before bridging.” Missing game account opens login. |
| Bridge configuration | Popup, 5 s: “This bridge is not configured for the current deployment.” / “Crew minting is not configured for this deployment.” / “SWAY bridge is not configured for this deployment.” |
| Bridge execution failure | Popup, 5 s: raw `shortMessage` or `message`, with fallbacks “Bridge transaction failed.”, “Receive transaction failed.”, “Crew mint transaction failed.”, “SWAY bridge transaction failed.”, “SWAY withdrawal failed.”, “SWAY receive transaction failed.” No shared cancellation suppression. |
| Bridge confirmation tracking | Records transfer status `failed` with provider message or “Ethereum transaction failed.” / “Starknet transaction failed.” Background tracking promise rejection is intentionally swallowed after recording status. |
| Banxa checkout creation | Warning popup, 5 s: “Your wallet is still being prepared. Please try again in a moment.” for undeployed-wallet errors; otherwise “Banxa funding is temporarily unavailable. Please try another funding option.” |
| Banxa iframe cross-origin access | Silent, intentionally | Expected browser restriction while checkout is hosted externally. |
| Faucet request failure | Popup | “Faucet request failed, please try again later.” |
| Stripe checkout load/create | Warning popup, typically 10 s | Server error or raw message; fallbacks “Unable to load Stripe checkout.” / “Unable to create Stripe checkout.” |
| Incomplete Stripe resume data | Warning popup | “Stripe checkout could not be resumed because the server response was incomplete.” |
| Stripe unconfigured | Warning popup | “Stripe Checkout is not configured for this environment.” |
| Starter-account setup or crew submission | Warning popup | `userMessage`/server message/raw message; fallback “Unable to set up your Influence account.” / “Unable to submit starter crew.” |

Sources: `src/hooks/useBridgeActions.js`, `src/game/launcher/store/FundingFlow.js`, `src/game/launcher/store/StarterPackSKU.js`. Provider-hosted checkout UI is outside this static catalogue.

## Issues to tighten, for review before implementation

1. **Separate failed from unknown outcomes.** A receipt-monitoring timeout is not proof of a revert. Keep the hash visible and reconcile before offering a retry that could duplicate an action.
2. **One response per failure.** Exact timeouts, expired sessions, and undeployed accounts currently can produce multiple alerts from the same exception.
3. **Unify cancellation classification.** Login, shared submission, fee handling, bridge flows, and failed-history storage use different rules. Match structured provider codes/names where supported and normalize once.
4. **Give each action a consistent failure result.** Early denied/unresolved returns must reach inline feedback; promises consumed by the shared context must not look like successful completion to a caller.
5. **Fix purchase-funding metadata mismatch.** `additionalFundsRequired` / `additionalFundsToken` are produced, but `additionalUSDCRequired` is consumed.
6. **Scope funding advice to evidence.** The recent fix removes generic native errors from top-up prompts, but generic insufficient-balance text still does not identify the fee token or distinguish fees from an action transfer.
7. **Replace blanket “try again” with recovery-specific wording.** Reconnect for connection failure; renew session for session expiry; review inputs for contract rejection; check status for uncertain submission; fund only a known deficit.
8. **Standardize duration and surface.** Some generic alerts persist indefinitely, others disappear after 5 or 10 seconds. Use inline actionable feedback where the action can be corrected, and avoid stacking a popup over the same inline explanation.
9. **Keep raw diagnostics out of primary copy.** Login, bridges, and purchases can expose provider text while gameplay hides useful reasons behind a generic fallback. Keep technical detail available through expandable details/copy support.

No response/copy changes from this audit have been applied.
