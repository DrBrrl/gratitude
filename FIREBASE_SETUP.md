# Firebase setup record

The backend uses Firebase Authentication (Google), Cloud Firestore and Cloud Functions. Storage is reserved for the photo increment. The frontend remains on GitHub Pages.

## Verified resources and current blocker

Checked on 2026-09-24:

| Item | Status |
| --- | --- |
| GitHub repository | `DrBrrl/gratitude`, PR #4 |
| Repository secret `GEMINI_API_KEY` | Name verified; value not read or printed; not used by this foundation |
| Firebase CLI | Locked through `package-lock.json`; administrative login completed |
| Google Cloud project | **Created:** `gratitude-drbrrl`, number `696882301155`, display name `Gratitude`, lifecycle `ACTIVE` |
| Administrative permissions | Current account has `roles/owner`; required project/update/service-enable permissions verified |
| Firebase Management API | Enabled successfully through `gcloud services enable firebase.googleapis.com --project=gratitude-drbrrl` |
| Firebase activation | **Succeeded** after the owner accepted Firebase terms |
| Firebase web app | `Gratitude`, app ID `1:696882301155:web:3fdeda713681e3ed685dd6`, state `ACTIVE` |
| Google authentication | Enabled; OAuth client configured; authorized domains verified: `gratitude-drbrrl.firebaseapp.com`, `gratitude-drbrrl.web.app`, `drbrrl.github.io`, `localhost` |
| Firestore | `(default)`, Native mode, Standard edition, Sydney `australia-southeast1`; repository rules and indexes deployed successfully |
| Billing | Not linked (`billingEnabled: false`); current account lists no accessible billing accounts |
| Functions and deployment identity | Not yet deployed/provisioned; Functions needs billing |

The previous activation 403 was resolved after the owner accepted Firebase terms: the next `projects:addfirebase` call succeeded. No replacement project was needed. The web app, Google provider and Firestore database have now been provisioned and verified. No journal data was written during setup.

The remaining deployment prerequisite is billing. The owner has been asked to [link their intended billing account](https://console.cloud.google.com/billing/linkedaccount?project=gratitude-drbrrl). Do not infer a billing account from another project. A real mobile Google sign-in and deployed callable test remain outstanding.

`.firebaserc` records the actual Cloud project. Emulator scripts explicitly target `demo-gratitude`, so the default alias cannot direct tests at live data.

## Complete live provisioning

The project, web app and database already exist; do not repeat their creation. Obtain the public web configuration when needed:

```sh
nix develop -c npx firebase apps:sdkconfig WEB '1:696882301155:web:3fdeda713681e3ed685dd6' --project gratitude-drbrrl
```

Use the names in `.env.example` for a local live build. Never copy administrative credentials into Vite configuration. Keep the hosted application unconfigured until the callable backend is deployed. Functions targets the same Sydney region as Firestore and requires a supported billing plan. [Functions setup](https://firebase.google.com/docs/functions/get-started)

Google sign-in was provisioned with `firebase deploy --only auth` using a temporary auth configuration: display name `Gratitude`, the owning account as support email, and the Pages origin as an additional redirect URI. Firebase automatically adds its own auth handler URI; specifying it again caused a duplicate-redirect error, resolved by omitting that duplicate. The temporary file was removed. The owner’s email and OAuth client secret were not committed. Authorized domains were then read, extended and verified through the Identity Toolkit API.

Install dependencies in both root and `functions/`, validate with `npm run test:firebase:all`, then deploy:

```sh
nix develop .#firebase -c npx firebase deploy --project gratitude-drbrrl --only firestore,functions
```

Do not provision a public photo bucket. `storage.rules` denies all access; a private upload/summary flow and bucket provisioning belong to the photo increment.

## Backend deployment identity

`.github/workflows/firebase-deploy.yml` is a manual, main-only workflow. It runs emulator tests before requesting Google credentials and deploys only Firestore rules/indexes and Functions. It is not operational until the resources, billing and identity are configured.

Create a dedicated deploy service account and Workload Identity Federation provider restricted to this repository and `refs/heads/main`, with the `firebase-production` GitHub environment. Grant the deployment account only the product deployment permissions it needs, including permission to act as the selected Functions runtime account; do not use Owner. Set environment/repository variables `GCP_WORKLOAD_IDENTITY_PROVIDER` and `GCP_DEPLOY_SERVICE_ACCOUNT` to those real identities. No long-lived service-account key is required. Verify IAM and a real deployment when provisioned; emulator success cannot validate cloud IAM.

The Pages workflow deliberately has no live Firebase configuration yet. Hosted PR previews show the setup-unavailable state; the generated emulator walkthroughs demonstrate the implemented journal. Before enabling a live preview, provision a separate development backend. Production app configuration must be supplied only to main builds. Both configurations are public identifiers, but sharing production auth on unreviewed previews is inappropriate. GitHub Pages previews share an origin, so path-scoped local cache names are not a security boundary.

## Gemini

The existing GitHub secret belongs to backend Secret Manager bindings, never the Pages bundle. This foundation makes no Gemini requests and no workflow reads or transfers the key. A later trusted backend deployment should provision the secret through stdin without echoing it, bind it only to Gemini functions, and record AI responses as events. Replay will read those events without contacting Gemini.
