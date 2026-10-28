# Firebase setup record

The journal uses Firebase Authentication and direct Firestore browser transactions protected by Security Rules. There is no Cloud Functions dependency or billing-link prerequisite for this foundation. AI prompts use the managed Firebase AI Logic gateway; private photo attachments use Cloud Storage and the same managed gateway for recorded image summaries.

## Provisioned resources

Core resources verified on 2026-09-24; AI provisioned on 2026-10-08; billing and paid-mode configuration verified on 2026-10-15:

| Resource | Production | PR previews |
| --- | --- | --- |
| Firebase project | `gratitude-drbrrl` | `gratitude-drbrrl-dev` |
| Project number | `696882301155` | `959183629113` |
| Web app ID | `1:696882301155:web:3fdeda713681e3ed685dd6` | `1:959183629113:web:33d4c1d0ab65759fe796e8` |
| Public configuration | `config/firebase-production.json` | `config/firebase-preview.json` |
| Google provider | Enabled, OAuth client configured | Enabled, OAuth client configured |
| Firestore | `(default)`, Native/Standard, Sydney `australia-southeast1` | Same |
| Rules/indexes | Repository configuration deployed | Repository configuration deployed |

Both projects authorize their own `firebaseapp.com` and `web.app` domains, `drbrrl.github.io`, and `localhost`. The owner accepted Firebase terms, resolving the original activation 403. The owner enabled billing; read-only Cloud Billing checks confirmed `billingEnabled: true` on both projects on 2026-10-15. Preview journals live in the development project and are separate from production; use test reflections there. PRs share that development project.

## Frontend configuration and deployment

The Pages build runs `scripts/configure_firebase_build.py` to select preview configuration for PRs and production configuration for main. It supplies the Firebase app settings, public App Check site key and AI data mode used by the client. The emulator CI job uses only `demo-gratitude` and never publishes its build. The Firebase API keys in these files are public web configuration, not privileged credentials. Auth and Security Rules enforce data access.

The private repository `GEMINI_API_KEY` is unused. It is never supplied to Pages or embedded in frontend configuration. Firebase AI Logic is provisioned in both projects for `gemini-3.6-flash`. Both deployment configurations now use `aiDataMode: "paid"`, making consent-bound personalization available after deployment. Exact visible responses and actual provider model versions become events; replay never runs inference.

For local live testing, copy the values from the chosen public configuration into `.env.local` using `.env.example` as a template. Live AI also needs the local App Check setup described below. Prefer emulators for automated tests. Real Google account completion and supported mobile-browser sign-in should be checked by the owner; automated emulator tests cover sign-in, save/edit, cross-device reads, isolation and recovery.

## Where to put a Gemini API key

**The current application does not accept or need a supplied Gemini/Google AI Studio key.** Firebase AI Logic manages Gemini authorization using a Google-managed service account. The existing GitHub `GEMINI_API_KEY` secret is unused; adding or replacing that secret will not change the app. [Firebase's key guidance](https://firebase.google.com/docs/ai-logic/faq-and-troubleshooting)

| Configuration | Where it belongs |
| --- | --- |
| Gemini / Google AI Studio API key | No input in this integration. Do not paste it into chat, the app, Git-tracked files or a `VITE_*` variable. |
| Public Firebase web API key | Already in `config/firebase-preview.json` and `config/firebase-production.json`; local development uses `VITE_FIREBASE_API_KEY` in ignored `.env.local`. This is a different credential. |
| Public App Check site key | Already in those configuration files; local live AI also needs the App Check development setup below. |

To try AI prompts in PR #8, sign in to [the preview](https://drbrrl.github.io/gratitude/pr-preview/pr-8/), open **Settings → AI settings**, enable AI prompts and save your choices, then use **Today → Find me a prompt**. No key entry is required.

### Paid personalization configuration

Paid mode is now the default in both deployment configs and `.env.example`. The owner enabled billing, and both Firebase projects reported `billingEnabled: true` on 2026-10-15. The steps below describe the setup for another environment or a future reconfiguration; no billing changes are performed by the frontend configuration.

A Gemini key belongs to a Google Cloud project. Paid access in another project does not enable it in Gratitude's projects. The current app uses `gratitude-drbrrl-dev` for previews and `gratitude-drbrrl` for production. [Google's project/key explanation](https://ai.google.dev/gemini-api/docs/api-key)

1. Choose the intended environment and open its billing settings: [preview project](https://console.cloud.google.com/billing/linkedaccount?project=gratitude-drbrrl-dev) or [production project](https://console.cloud.google.com/billing/linkedaccount?project=gratitude-drbrrl). Link the intended billing account. This enables pay-as-you-go usage for that project.
2. Import that same project into [Google AI Studio's Projects page](https://aistudio.google.com/projects) and complete any required paid-tier activation or prepayment. Verify paid access before enabling personal context. [Firebase billing requirements](https://firebase.google.com/docs/ai-logic/pricing)
3. Set `aiDataMode` to `"paid"` in the matching `config/firebase-preview.json` or `config/firebase-production.json`, commit the configuration and redeploy through the normal Pages workflow. This flag does not itself enable billing. Each environment is configured separately.
4. In **Settings → AI settings**, choose which sources to share and save those choices. Sharing stays off until the user opts in.

Using a supplied key from another project directly would require a separate protected server integration; the current Pages app has no such credential store or endpoint. Supplying a key does not migrate existing accounts or journal data to that project.

## Rules deployment

```sh
nix develop -c npm ci
nix develop -c npm run test:firebase:all
nix develop -c npx firebase deploy --only firestore --project gratitude-drbrrl-dev
nix develop -c npx firebase deploy --only firestore --project gratitude-drbrrl
```

Firestore rules require a Google-authenticated owner, exact event fields, contiguous sequence, expected entry revision and a server timestamp. Event creation, stream-head advancement and the entry's last-event pointer must form one atomic write. Existing events and indexes cannot be arbitrarily changed/deleted. Unknown generations and event types are denied. Cloud append indexes are reconstructable from events but need administrative repair if damaged; local projection caches are disposable through the journal recovery UI.

The dated-entry increment adds `ReflectionWritten` schema 3. Its user-selected `entryAt` is a Firestore Timestamp bounded by the server request time; it remains unchanged during text edits. The actual server `recordedAt` stays separate. Schemas 1 and 2 remain accepted for existing entries. Deploy these additive Rules before publishing a client that creates dated entries; no new index or database migration is needed. Older browser tabs must reload to read schema 3 events. The updated Rules/indexes were deployed successfully to both Firebase projects on 2026-10-15 after emulator verification.

The optional main-only **Deploy Firebase** workflow now deploys only Firestore rules/indexes after emulator tests. It requires `GCP_WORKLOAD_IDENTITY_PROVIDER` and `GCP_DEPLOY_SERVICE_ACCOUNT`, which are not yet provisioned; this does not block the application. Current deployments use the authenticated CLI. There are no Functions runtime resources, Node 22 dependency tree or Secret Manager bindings to maintain.

The photo increment provisions separate private Sydney Storage buckets for preview and production; see the setup record below. GitHub Pages previews share an origin with production: separate Firebase projects and namespaced local caches are not isolation against hostile scripts on that origin.

## AI deployment and privacy

Run `nix develop -c node scripts/configure_ai.mjs preview` (or `production`) using an administrative Firebase login to reproduce the setup. It provisions AI Logic, enables App Check/reCAPTCHA APIs, registers a domain-restricted score-based reCAPTCHA Enterprise key, enforces App Check for `firebaseml.googleapis.com` (the App Check service identifier for AI Logic), requires Firebase Auth at the AI gateway and sets a 5 requests/minute/user limit. Both projects use one-hour App Check session tokens; replay protection for App Check tokens is not enabled. Event replay is a separate application concern and never calls Gemini.

Public App Check keys allow `drbrrl.github.io` only. They do not authorize journal access. For local live AI, use a private, temporary App Check debug token following [Firebase's instructions](https://firebase.google.com/docs/ai-logic/app-check); never commit or deploy that token. Normal development and CI use emulators and intercepted fictional model responses. Neither setup nor the app accesses the private repository Gemini secret, deploys Functions or links a billing account.

Both deployment configs select paid mode following the verified billing activation. User sharing remains off by default; saved choices determine which journal entries, feedback and preferences may inform a request. The optional `aiDataMode: "generic"` configuration sends a fixed instruction only and excludes those sources. Use that mode for unbilled environments because Gemini’s [unpaid-service terms](https://ai.google.dev/gemini-api/terms) prohibit personal/confidential input and allow product-improvement use and human review. The gateway’s [5 RPM/user quota](https://firebase.google.com/docs/ai-logic/quotas) is additional to model/project quotas; it is not a daily spending cap. No billing account is linked by this setup.

Firebase JS 12.19 maps Gemini responses without `modelVersion`. The application calls the same managed gateway over HTTP and uses Firebase SDKs for Auth/App Check so events can store the provider-reported model version. The Gemini Developer API route is `/v1beta/projects/PROJECT/models/MODEL:generateContent`; it is different from the location/publisher route for Vertex. Provider failures are recorded as sanitized categories, not raw error bodies. The adapter consumes visible text only, excluding thought parts.

### Verification for the AI increment

The updated Firestore rules/indexes were deployed to both projects on 2026-10-08 after emulator verification. App Check enforcement, domain registration, Auth requirement and reduced quotas were read back. Administrative-token generation attempts are rejected by the auth-enforced gateway; they are not evidence of a successful signed-in user request. Temporary test identities/debug tokens were removed. A live browser generation check with Google sign-in remains for PR review; the earlier pre-enforcement fictional smoke test is historical evidence only. CI does not use live accounts or inference.

## Photo storage and summaries

Run `nix develop -c node scripts/configure_storage.mjs preview` (and `production`) with the administrative Firebase login. It enables the Storage APIs, provisions the default `{projectId}.firebasestorage.app` bucket in `australia-southeast1` if absent, configures GET CORS for Pages/local development, and checks for public IAM grants. Existing billing linkage is used; this script does not link billing or add public access. [Firebase default bucket API](https://firebase.google.com/docs/reference/rest/storage/rest/v1alpha/projects.defaultBucket/create), [authenticated browser file downloads](https://firebase.google.com/docs/storage/web/download-files#download_data_directly_from_the_sdk).

The app derives the default bucket name from its configured project ID. No secret or extra user API key is needed. `storage.rules` restricts object access to the same Google-authenticated owner under `users/{uid}/v1/{photoId}`, permits creation only when the object does not exist, accepts JPEG up to 10 MB, and denies overwrites. The browser strips metadata by re-encoding before upload; Rules enforce type/size/ownership, not semantic image contents. The gateway’s existing Auth, App Check and request quota also apply to photo summaries. [Gemini inline image input](https://firebase.google.com/docs/ai-logic/analyze-images?api=dev).

Storage and updated Firestore Rules must be deployed with `nix develop -c npx firebase deploy --only firestore,storage --project <projectId>` before the frontend writes photo events. Older clients cannot understand those new events and must refresh to this app version. PR #9’s backfill preview remains unchanged; photo testing should use the attachment PR’s preview. Preview accounts share the preview backend across PRs.

On 2026-10-15 both `{projectId}.firebasestorage.app` buckets were provisioned and read back in `AUSTRALIA-SOUTHEAST1`, with no public bucket IAM grants. The compatible Firestore Rules/indexes and private Storage Rules were successfully deployed to both projects before frontend publication. Emulator coverage validates private reads, denied unauthenticated/cross-user access, immutable upload retries, MIME/size limits and photo event consistency. Live Google-signed-in Gemini image processing remains a review check; automated provider responses are fictional.

## Reflection prompt editing update (2026-10-21)

Firestore Rules/indexes deployed successfully to preview and production for ReflectionWritten schema 5 (manual source text or an existing prompt reference) and entry-scoped PromptRequested schema 2. Older event schemas remain accepted. No model, billing, key, App Check or Storage configuration changed. Projection version 5 rebuilds prior checkpoints from the same event stream; use the updated app for accounts containing these new events. Daily AI selection and editor options are separate. AI response retries acknowledge only an identical server-confirmed event, including a concurrent stale-control observation.

## Editable reflection dates (2026-10-22)

Firestore Rules/indexes were deployed successfully to both preview and production for ReflectionWritten schema 6. It permits explicit entry-date replacement with expected-revision checks while preserving legacy schemas and original server save timestamps. The updated app is required to read schema 6 events; existing compatible clients can still read older streams. No Auth, App Check, AI, billing or Storage configuration changed.

## Alternate journal import (2026-10-25)

Compatible Firestore Rules/indexes and Storage Rules deployed successfully to both `gratitude-drbrrl-dev` and `gratitude-drbrrl` after emulator verification. The changes add exact import source-event shapes and atomic per-source receipt references, retain provenance pointers across schema-6 edits, and validate optional immutable import integrity metadata on Storage creates. No Auth, AI, billing, project, bucket, index layout or Cloud Functions change was required; no private journal data was uploaded or migrated.

Deploy both rule sets before publishing this client: `nix develop -c npx firebase deploy --only firestore,storage --project <projectId> --non-interactive`. Updated app versions are required to read new import events. Older event schemas and existing photo uploads retain their original semantics. The owner imports the actual archive through **Settings → Import journal** after deployment and explicitly confirms the destination account. Preview imports use the separate development project and do not migrate production data.

## Gemini instruction template compatibility — 2026-10-27

The instruction-only deployment introduced request tag `gratitude-v2` while retaining `gratitude-v1`, the five-entry limit, ownership, consent checks and the immutable stream/control contract. The subsequent twenty-reflection request deployment is recorded below; the legacy five-entry schemas remain supported.

After twenty emulator integration cases passed, `firestore:rules` was deployed to `gratitude-drbrrl-dev` and `gratitude-drbrrl` with the authenticated CLI. Both active Firestore rulesets were read back through the Rules API and exactly matched local `firestore.rules`, SHA-256 `8022f938bf71a6c11a8f646c74dec6a9f5314be37503726899620d22e8a378d8`. Compilation succeeded with an existing ternary-type warning on the unchanged photo/import rule at line 180. No index, Storage rule, account, journal data, model configuration or resource was changed.

The new instruction reaches the PR preview through its Pages build, and production frontend after merge. New clients read both template tags; clients that only understand `gratitude-v1` must refresh when they encounter a `gratitude-v2` request in their stream. Previously saved responses are never regenerated. Verification used fictional emulator data and intercepted provider responses, with no live Gemini inference or private journal access.

## Twenty-reflection requests (2026-10-27)

Firestore Rules supporting daily/editor `PromptRequested` schemas 3/4 were deployed to **both** `gratitude-drbrrl-dev` and `gratitude-drbrrl` after authenticated emulator tests, including twenty sources plus twenty feedback IDs. Both deployed sources were read back and matched the repository (SHA-256 `e71b1258d98dfc637cd38f8adaee91be93cc72fb92d6f4a9da99a89e072912e3`). Legacy schemas 1/2 retain their original five-source array bounds; new schemas use unique-ID maps of decimal revision strings and capture `mixed-v1`, reference day, timezone and a literal selection seed. Rules enforce shape/consent; client transactions also verify source revisions.

No new Firebase service, index, model configuration, secret, data migration or background job is needed. Projection version 7 rebuilds older disposable checkpoints from recorded events without inference. The frontend follows the ordinary PR preview/main deployment pipeline. Tabs that cannot read the new request versions must refresh after the updated frontend is published. Gemini-curated monthly notes remain deferred.

## Optional LM Studio provider (2026-10-27)

Compatible Firestore Rules were deployed to both `gratitude-drbrrl-dev` and `gratitude-drbrrl`. Active sources were read back through the Rules API and exactly matched `firestore.rules`, SHA-256 `9b7d21800312598ee9d7cebe26c60d3c602733444ff2b1756f5d85aba7fc9ccb`. This adds `AIChoicesConfirmed` schema 2, local daily/editor `PromptRequested` schemas 5/6 and local `PhotoSummaryRequested` schema 2. Legacy events remain accepted. Provider claims must match the canonical account choice in both client transactions and Rules. Photo consent remains independent of the prompt-enabled switch. No new service, index, Storage Rule, secret or billing change is needed.

Projection version 9 rebuilds older disposable checkpoints from the event stream without inference. Older clients must refresh before reading the new event versions. Saved responses remain immutable. The frontend is published through the normal preview/main pipeline. See [LM Studio setup](LM_STUDIO_SETUP.md) for browser connection and private HTTPS instructions; local addresses and API tokens never enter Firebase events.

Optional **Account token sync** uses a mutable owner-only `users/{uid}/privateSettings/lmStudio` record for a bounded token, its HTTPS (or loopback) origin, model and server update timestamp. The exact-document Rules allow only a Google-authenticated owner and deny collection listing; the journal event schemas do not accept credentials. Both projects have the compatible Rules deployed. See [credential handling and revocation](LM_STUDIO_SETUP.md) for the account-storage tradeoff and cross-device setup.
