# Firebase setup record

The journal uses Firebase Authentication and direct Firestore browser transactions protected by Security Rules. There is no Cloud Functions dependency or billing-link prerequisite for this foundation. AI prompts use the managed Firebase AI Logic gateway; photo features remain future work.

## Provisioned resources

Core resources verified on 2026-09-24; AI configuration updated on 2026-10-08:

| Resource | Production | PR previews |
| --- | --- | --- |
| Firebase project | `gratitude-drbrrl` | `gratitude-drbrrl-dev` |
| Project number | `696882301155` | `959183629113` |
| Web app ID | `1:696882301155:web:3fdeda713681e3ed685dd6` | `1:959183629113:web:33d4c1d0ab65759fe796e8` |
| Public configuration | `config/firebase-production.json` | `config/firebase-preview.json` |
| Google provider | Enabled, OAuth client configured | Enabled, OAuth client configured |
| Firestore | `(default)`, Native/Standard, Sydney `australia-southeast1` | Same |
| Rules/indexes | Repository configuration deployed | Repository configuration deployed |

Both projects authorize their own `firebaseapp.com` and `web.app` domains, `drbrrl.github.io`, and `localhost`. The owner accepted Firebase terms, resolving the original activation 403. No billing account was linked by this work. Preview journals live in the development project and are separate from production; use test reflections there. PRs share that development project.

## Frontend configuration and deployment

The Pages build runs `scripts/configure_firebase_build.py` to select preview configuration for PRs and production configuration for main. It supplies the Firebase app settings, public App Check site key and AI data mode used by the client. The emulator CI job uses only `demo-gratitude` and never publishes its build. The Firebase API keys in these files are public web configuration, not privileged credentials. Auth and Security Rules enforce data access.

The private repository `GEMINI_API_KEY` is unused. It is never supplied to Pages or embedded in frontend configuration. Firebase AI Logic is provisioned in both projects for `gemini-3.6-flash`. Live sites currently use `aiDataMode: "generic"`: no journal text, guidance or feedback reaches Gemini. Exact visible responses and actual provider model versions become events; replay never runs inference.

For local live testing, copy the four values from the chosen public configuration into `.env.local` using `.env.example` as a template. Prefer emulators for automated tests. Real Google account completion and supported mobile-browser sign-in should be checked by the owner; automated emulator tests cover sign-in, save/edit, cross-device reads, isolation and recovery.

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

Gemini’s [unpaid-service terms](https://ai.google.dev/gemini-api/terms) prohibit personal/confidential input and allow product-improvement use and human review. Therefore live generation sends a fixed generic instruction only. Personalization remains gated until the relevant project has active billing and its config is deliberately changed to `aiDataMode: "paid"`. User sharing remains off by default even in paid mode. The gateway’s [5 RPM/user quota](https://firebase.google.com/docs/ai-logic/quotas) is additional to model/project quotas; it is not a daily spending cap. No billing account is linked by this setup.

Firebase JS 12.19 maps Gemini responses without `modelVersion`. The application calls the same managed gateway over HTTP and uses Firebase SDKs for Auth/App Check so events can store the provider-reported model version. The Gemini Developer API route is `/v1beta/projects/PROJECT/models/MODEL:generateContent`; it is different from the location/publisher route for Vertex. Provider failures are recorded as sanitized categories, not raw error bodies. The adapter consumes visible text only, excluding thought parts.

### Verification for the AI increment

The updated Firestore rules/indexes were deployed to both projects on 2026-10-08 after emulator verification. App Check enforcement, domain registration, Auth requirement and reduced quotas were read back. Administrative-token generation attempts are rejected by the auth-enforced gateway; they are not evidence of a successful signed-in user request. Temporary test identities/debug tokens were removed. A live browser generation check with Google sign-in remains for PR review; the earlier pre-enforcement fictional smoke test is historical evidence only. CI does not use live accounts or inference.
