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
| Firebase activation | `projects:addfirebase gratitude-drbrrl` returns HTTP 403 `PERMISSION_DENIED` |
| Firebase web app, Google provider, database, functions, deployment identity | Not yet provisioned |

Do not create another Cloud project. Firebase documents unaccepted Firebase terms as one possible cause of this 403, alongside missing permissions. The owner has been asked to open the [Firebase console](https://console.firebase.google.com/), choose **Add Firebase to Google Cloud project**, select `gratitude-drbrrl`, and review any terms/setup prompt. This is a possible cause, not a confirmed diagnosis. [Official troubleshooting](https://firebase.google.com/docs/projects/use-firebase-with-existing-cloud-project)

`.firebaserc` records the actual Cloud project. Emulator scripts explicitly target `demo-gratitude`, so the default alias cannot direct tests at live data.

## Complete live provisioning

After resolving the activation error:

```sh
nix develop
npx firebase projects:addfirebase gratitude-drbrrl
npx firebase apps:create WEB Gratitude --project gratitude-drbrrl
npx firebase apps:list --project gratitude-drbrrl
```

If activation was completed in the console, skip `projects:addfirebase`. Obtain public web configuration with `firebase apps:sdkconfig WEB <app-id> --project gratitude-drbrrl`; use the names in `.env.example` for a local live build. Never copy administrative credentials into Vite configuration.

Enable Google authentication and authorize `drbrrl.github.io` (plus localhost for local live testing). Create the default Firestore database in Sydney (`australia-southeast1`); the callable function targets the same region. Identify the owner's billing account before linking it; Functions deployment requires the supported billing plan. Test real Google sign-in on supported mobile browsers before release. [Functions setup](https://firebase.google.com/docs/functions/get-started)

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
