# Background hug notifications

## User experience

Friends → Hug notifications asks for permission only after **Turn on hug notifications**. Each browser/deployment makes its own choice. New hugs can appear with the app tab closed; choosing the notification opens Friends. Notification text is the sender’s chosen display name and “sent you a hug!”, never private journal writing or streak details. Browser permission, a running browser push service, OS notification settings and background restrictions determine delivery. The app does not promise exact timing or delivery after a browser is force-stopped.

Turning off notifications or signing out removes the IndexedDB delivery binding and closes native notifications before network revocation. Queued payloads for that account/device/generation are then ignored. Account changes cannot display the previous account’s notifications. Re-enabling uses a fresh generation. Signing out of one device leaves other devices unchanged.

## Source and operational state

`users/{uid}/pushChoices/{deviceId}/events/{eventId}` holds immutable `HugNotificationsChosen` actions: literal enabled/reason, actor/device, predecessor and ordering. The private head projects those actions. Events contain no subscription endpoints, keys or computed notification state. Owner-only Rules validate atomic event/head/registration changes and reject an opt-out that retains its subscription.

`users/{uid}/pushDevices/{deviceId}` is private mutable transport metadata, outside source events and exports. It holds the browser’s endpoint/key material, scope, signing public key, consent pointer and generation. Owner collection listing is denied. This is not an API token: only the backend holds the signing private key, in one Secret Manager secret per environment. Subscription material still needs private handling. A stable device identifier and current binding live in scope-specific IndexedDB.

The private `sendHugNotification` Firestore creation trigger reacts to new `HugSent` source events only. It validates current accepted/unblocked friendship, recipient hug preferences and account, sender display name, relationship changes since the action, active opt-in preceding the hug, subscription schema/provider and deployment scope. No journal or LM Studio credentials are read. Up to twenty most recently refreshed devices are considered. Replays, initial client synchronization and consent after a hug do not send history.

Delivery leases/receipts in `hugPushDeliveries` are backend-only operational records. Transient failures retry; permanent provider errors retire the matching generation without deleting a renewed registration. At-least-once cloud delivery can repeat a transport message: the worker reserves each source event durably and rechecks its binding before/after showing it. Hugs expire 24 hours after their recorded source time. Browser providers are limited to Mozilla, Google and Apple HTTPS origins to prevent arbitrary outgoing requests.

## Worker lifecycle

The existing public-shell worker handles push and notification clicks. Explicit opt-in checks for an update, activates a waiting capable worker and verifies its capability through a message channel. No page reload is forced. Activation retains previous scope-specific public asset caches while app windows remain, so lazy imports in an older tab continue to work; normal activation with no open app windows prunes them. Private account data never enters these caches. Window matching isolates production from PR previews on the same origin.

## Deployment and costs

The journal itself still writes directly through Firebase Rules. This optional trusted sender needs Blaze billing and adds a second-generation Cloud Function, Eventarc/PubSub delivery, Secret Manager, builds and container images. Standard Web Push is used directly; there is no Firebase Messaging SDK or per-hug application service fee. Firebase lists FCM itself as no-cost, but that does not make the surrounding backend free. Function execution, Firestore operations, networking, secrets and retained build artifacts can incur charges after applicable allowances. Small-scale incremental cost is expected low, not guaranteed zero; some allowances aggregate across the billing account. See [Firebase pricing](https://firebase.google.com/pricing).

The sender runs in Sydney with zero minimum instances, one maximum instance, concurrency eight and 256 MiB memory. The deployment config prunes container images older than one day. These settings constrain resources, not the total bill. Billing alerts do not pause usage. Firebase’s preview spend caps can pause eligible services after the threshold, with enforcement delay; they are not a strict instantaneous ceiling. See [billing controls](https://firebase.google.com/docs/projects/billing/spend-caps).

Use the logged-in administrative Firebase CLI in the locked Nix shell:

```sh
nix develop -c npm ci
nix develop -c npm ci --prefix functions
nix develop -c node scripts/configure_push.mjs preview
nix develop -c npx firebase deploy --only functions:gratitude-push --project gratitude-drbrrl-dev --non-interactive --force
nix develop -c node scripts/configure_push.mjs preview
```

Repeat with `production` and `gratitude-drbrrl`. Review live Rules for drift before deploying the tested `firestore:rules`. The setup helper preserves existing signing keys and refuses a mismatched configured public key; it never prints private keys or tokens. Public `webPushPublicKey` configuration becomes `VITE_WEB_PUSH_PUBLIC_KEY` at build time. No private signing key belongs in Vite or GitHub Pages.

The dedicated keyless `gratitude-push` identity has Firestore access, Auth read access for recipient checks and Eventarc receiver permission; secret access is restricted to its signing secret. Invocation permission is scoped to the sender’s Cloud Run service, which is not public. Eventarc service-identity propagation can delay initial deployment; rerun after propagation rather than granting public access. The helper verifies active service/trigger identities and zero/one instance settings.

## Evidence and remaining device checks

Unit tests cover payload binding/expiry, consent replay, scope isolation and durable worker deduplication/opt-out races. Rules tests cover ownership, exact fields, atomic source/registration updates and private receipts. Delivery integration tests use emulators and a fake external transport to verify recipient checks, retry, expired subscription cleanup and no journal/credential reads. CI includes these tests and the dedicated 044 browser walkthrough in both viewports.

Scenario 044 stubs only external subscription acquisition. Real Chromium service workers and native Notification APIs receive dispatch through CDP, including after all app pages close. It covers old-worker upgrade, retained public modules, permission denial/recovery, invalid/expired messages, deduplication, notification links, opt-out and sign-out. Every action has a full unmasked screenshot at zero tolerance; native notification API checks describe what an OS panel screenshot cannot establish.

`scripts/smoke_push.mjs` is an explicitly invoked live **preview-only** administrative test. It creates clearly prefixed disposable Auth/social/consent fixtures, registers a temporary Mozilla push receiver, receives/decrypts the deployed sender’s encrypted notification and checks the private receipt. It unregisters/deletes its own fixtures in cleanup and never reads real journals. Run with `nix develop -c node scripts/smoke_push.mjs`; this incurs small real provider/backend usage. Successful live delivery has been verified. Physical Firefox/Android permission, OS notification display/tap and battery-policy behaviour remain a manual check on the user’s device.
