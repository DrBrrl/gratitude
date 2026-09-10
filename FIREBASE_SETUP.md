# Firebase setup record

The selected backend is Firebase Authentication (Google provider), Cloud Firestore, Cloud Storage and Cloud Functions. The SvelteKit frontend remains on GitHub Pages. This record separates external provisioning from the application implementation described in [MVP_DESIGN.md](MVP_DESIGN.md).

## Verified access and resources

| Item | Status |
| --- | --- |
| GitHub repository | `DrBrrl/gratitude` |
| Repository Actions secret `GEMINI_API_KEY` | Its name is present; its value was not read or printed |
| Firebase CLI | `15.30.0` runs in `nix develop` |
| Firebase administrative login | Missing when checked; `projects:list` returned “Failed to authenticate, have you run firebase login?” |
| Firebase project | Creation of `gratitude-drbrrl` was attempted and rejected for missing authentication; no project was created |
| Firestore, Google provider, Storage, Functions, deployment identity | Not yet provisioned |

Proposed globally unique project ID: `gratitude-drbrrl`, display name `Gratitude`. Verify availability when creating it; do not treat this proposed identifier as a registered project. Proposed regional resources use Sydney (`australia-southeast1`) where supported, matching the project's initial Australian development context.

## Resume authorized provisioning

In the repository terminal, authenticate the Google account that should own the project:

```sh
nix develop
npx --yes firebase-tools@15.30.0 login
npx --yes firebase-tools@15.30.0 projects:list
npx --yes firebase-tools@15.30.0 projects:create gratitude-drbrrl --display-name Gratitude
```

Project creation is already requested by the user. After successful creation, record the returned project ID/number and create the Firebase web app. Commit `.firebaserc` and public application configuration only after the real identifiers are known. The [Firebase CLI reference](https://firebase.google.com/docs/cli) documents project creation and application registration.

Complete the Google provider configuration, authorized domain `drbrrl.github.io`, Firestore database/rules, private Storage bucket, service identities, and functions during the backend foundation increment. Verify OAuth behaviour on mobile before release. New Storage provisioning requires the applicable billing plan; Functions deployment also needs its supported billing setup. Identify the owner's billing account before linking it rather than assuming one from unrelated projects. [Storage billing requirements](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024), [Functions setup](https://firebase.google.com/docs/functions/get-started)

## Gemini secret and deployment

The existing GitHub secret supplies the **backend**, never the browser. A trusted main-branch deployment job should map `secrets.GEMINI_API_KEY` into a private environment variable, pass it to Secret Manager through stdin without echoing it, and deploy only functions that explicitly bind that secret. Use Google Workload Identity Federation for deployment authorization, with repository/branch restrictions; the Gemini API key itself is not a Firebase administrative credential.

No workflow in this design revision reads or transfers the key. Runtime secret provisioning, IAM binding, model configuration and a fictional-input Gemini smoke test remain implementation work. Public PR preview builds receive neither production deployment credentials nor the Gemini key. Existing Pages CI continues to build the scaffold.
