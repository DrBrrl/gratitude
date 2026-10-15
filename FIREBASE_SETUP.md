# Firebase setup record

The journal uses Firebase Authentication and direct Firestore browser transactions protected by Security Rules. There is no Cloud Functions dependency or billing-link prerequisite for this foundation. AI prompts use the managed Firebase AI Logic gateway; photo features remain future work.

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

The optional main-only **Deploy Firebase** workflow now deploys only Firestore rules/indexes after emulator tests. It requires `GCP_WORKLOAD_IDENTITY_PROVIDER` and `GCP_DEPLOY_SERVICE_ACCOUNT`, which are not yet provisioned; this does not block the application. Current deployments use the authenticated CLI. There are no Functions runtime resources, Node 22 dependency tree or Secret Manager bindings to maintain.

Storage access remains denied; no photo bucket is needed by the foundation. Storage provisioning, retention and photo costs belong to their feature increment. GitHub Pages previews share an origin with production: separate Firebase projects and namespaced local caches are not isolation against hostile scripts on that origin.

## AI deployment and privacy

Run `nix develop -c node scripts/configure_ai.mjs preview` (or `production`) using an administrative Firebase login to reproduce the setup. It provisions AI Logic, enables App Check/reCAPTCHA APIs, registers a domain-restricted score-based reCAPTCHA Enterprise key, enforces App Check for `firebaseml.googleapis.com` (the App Check service identifier for AI Logic), requires Firebase Auth at the AI gateway and sets a 5 requests/minute/user limit. Both projects use one-hour App Check session tokens; replay protection for App Check tokens is not enabled. Event replay is a separate application concern and never calls Gemini.

Public App Check keys allow `drbrrl.github.io` only. They do not authorize journal access. For local live AI, use a private, temporary App Check debug token following [Firebase's instructions](https://firebase.google.com/docs/ai-logic/app-check); never commit or deploy that token. Normal development and CI use emulators and intercepted fictional model responses. Neither setup nor the app accesses the private repository Gemini secret, deploys Functions or links a billing account.

Both deployment configs select paid mode following the verified billing activation. User sharing remains off by default; saved choices determine which journal entries, feedback and preferences may inform a request. The optional `aiDataMode: "generic"` configuration sends a fixed instruction only and excludes those sources. Use that mode for unbilled environments because Gemini’s [unpaid-service terms](https://ai.google.dev/gemini-api/terms) prohibit personal/confidential input and allow product-improvement use and human review. The gateway’s [5 RPM/user quota](https://firebase.google.com/docs/ai-logic/quotas) is additional to model/project quotas; it is not a daily spending cap. No billing account is linked by this setup.

Firebase JS 12.19 maps Gemini responses without `modelVersion`. The application calls the same managed gateway over HTTP and uses Firebase SDKs for Auth/App Check so events can store the provider-reported model version. The Gemini Developer API route is `/v1beta/projects/PROJECT/models/MODEL:generateContent`; it is different from the location/publisher route for Vertex. Provider failures are recorded as sanitized categories, not raw error bodies. The adapter consumes visible text only, excluding thought parts.

### Verification for the AI increment

The updated Firestore rules/indexes were deployed to both projects on 2026-10-08 after emulator verification. App Check enforcement, domain registration, Auth requirement and reduced quotas were read back. Administrative-token generation attempts are rejected by the auth-enforced gateway; they are not evidence of a successful signed-in user request. Temporary test identities/debug tokens were removed. A live browser generation check with Google sign-in remains for PR review; the earlier pre-enforcement fictional smoke test is historical evidence only. CI does not use live accounts or inference.
