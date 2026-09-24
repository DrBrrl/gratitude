# Firebase setup record

The journal uses Firebase Authentication and direct Firestore browser transactions protected by Security Rules. There is no Cloud Functions dependency or billing-link prerequisite for this foundation. AI and photo features remain future work with their own service/usage requirements.

## Provisioned resources

Verified on 2026-09-24:

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

The Pages build runs `scripts/configure_firebase_build.py` to select preview configuration for PRs and production configuration for main. It supplies the four `VITE_FIREBASE_*` values used by the client. The emulator CI job uses only `demo-gratitude` and never publishes its build. The Firebase API keys in these files are public web configuration, not privileged credentials. Auth and Security Rules enforce data access.

The private repository `GEMINI_API_KEY` is unused. It is never supplied to Pages or embedded in frontend configuration. Firebase AI Logic is the proposed later AI integration; response events will preserve historical output without rerunning inference on replay.

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

Storage access remains denied; no photo bucket is needed by the foundation. Storage provisioning, retention, App Check, AI quotas and future service costs belong to their feature increments. GitHub Pages previews share an origin with production: separate Firebase projects and namespaced local caches are not isolation against hostile scripts on that origin.
