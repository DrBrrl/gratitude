# AI connections

Open **Settings → AI settings → AI model**, or the AI step in onboarding. Connections and sharing choices have explicit saves. Testing reads model metadata; it never generates a prompt, sends reflections or downloads a model.

## Choose a service

| Choice | Where inference happens | Credentials |
| --- | --- | --- |
| Gemini | The existing Firebase AI Logic gateway | Managed by this deployment |
| LM Studio | Your configured private server | Optional dedicated LM Studio token; see [LM Studio setup](LM_STUDIO_SETUP.md) |
| Ollama | Your configured private native Ollama server | Usually none; optional authentication must be enforced by your proxy |
| Verified compatible local server | Your explicitly verified chat-completions server | Optional server/proxy token; requires the metadata contract below |
| My Gemini API key | Google, through Gratitude’s authenticated Firebase relay | Your own write-only, encrypted account key |

There is no automatic fallback between services. Existing backup prompts remain available when a model is unreachable. Prompts and photos can use the same connection or separately saved services/models. Backup preferences independently select a service and use its saved prompt/backup connection; named general-purpose profiles and more cloud vendors remain future work.

## Native Ollama

1. Run a current Ollama server with a model already available. Gratitude does not install or download models.
2. Allow the app’s browser origin with `OLLAMA_ORIGINS=https://drbrrl.github.io`, then restart the Ollama server. See [Ollama’s origin configuration](https://docs.ollama.com/faq).
3. Use a private HTTPS address for access from hosted Firefox and other devices. Keep the server behind your private network. If the computer already uses Tailscale Serve for LM Studio, preserve that route and use another host or an unused HTTPS port for Ollama.
4. Choose **Ollama**, enter the server origin and press **Test connection**. The default loopback address is `http://127.0.0.1:11434`; another device needs the model computer’s reachable HTTPS address.
5. Choose a discovered model and **Save model settings**. Models with unknown/forced thinking cannot be selected. Photo descriptions need advertised vision support. A successful metadata test does not prove sufficient RAM, context or successful inference.

Discovery uses native `/api/tags`, `/api/ps` and `/api/show`. Generation uses non-streaming `/api/chat`, native `think: false` where explicitly supported, and disables silent context truncation/shifting. Unknown thinking controls and cloud-routed Ollama models are unavailable rather than treated as local, non-thinking inference. See [the native API contract](https://docs.ollama.com/api/chat) and [Ollama’s current thinking metadata](https://github.com/ollama/ollama/blob/main/types/model/thinking.go).

Native Ollama does not enforce a placeholder OpenAI API key. Leave **Proxy authentication token** blank unless your proxy actually checks it. An optional **Remember connection in my account** saves the bound service, HTTPS/loopback server, model and optional token to the private account record. Tokens otherwise remain in this browser tab; no credential enters events or exports.

## Bounded compatibility mode

This is an explicit text-only contract, not a claim that every server exposing `/v1` works. Its metadata endpoint must return verified capabilities:

```json
{"data":[{"id":"your-model-id","capabilities":{"completion":true,"thinking":false}}]}
```

The operator must configure and verify a non-thinking text model before declaring these fields. Plain `/v1/models` listings without these declarations remain unavailable. The adapter sends standard, non-streaming `/v1/chat/completions` requests without LM Studio-specific options, accepts one complete assistant answer with `finish_reason: "stop"`, and rejects tool calls, blank/truncated text and visible reasoning markers. It never sends photos. No blanket vLLM, llama.cpp or LocalAI support is claimed; a dedicated verified adapter can be added for their differing metadata and reasoning controls.

Use an origin, optionally ending in `/v1`. Arbitrary API paths, embedded credentials, query strings and fragments are rejected rather than silently stripped.

## Your own Gemini key

1. Create a key in your own [Google AI Studio project](https://aistudio.google.com/api-keys). Review [Google’s key restrictions](https://ai.google.dev/gemini-api/docs/api-key), quota, billing and [data-use terms](https://ai.google.dev/gemini-api/terms). A Firebase web configuration key is not an inference key.
2. Choose **My Gemini API key** and enter the key in the private password field. **Test cloud connection** lists that key’s supported Gemini models without inference or storage.
3. Select a model. Personal context and photos are disabled until you explicitly acknowledge your project’s applicable terms. A personal key does not establish a paid tier; existing journal, feedback and questionnaire sharing switches still apply independently.
4. **Save private cloud connection** stores the key through the trusted relay and selects this connection. The password field clears. Other signed-in devices restore the model and permissions without receiving the key.
5. Generate a prompt normally. Gemini uses its model’s thinking defaults; only complete final text is returned and saved. Local-service thinking-off controls are separate.

Changing a model, key or terms acknowledgement creates a new opaque revision. Replaced/deleted connections and changed source permissions invalidate pending requests. **Remove saved cloud key** removes the relay’s encrypted copy and disables future use without switching providers. It can invalidate a pending result but cannot undo a request already sent to Google. Revoke the key with Google to disable other copies too.

The browser holds a newly typed key only while editing, then sends it over authenticated HTTPS to this deployment’s fixed Firebase relay. It is never stored in local/session storage, journal events, checkpoints, exports, Pages build variables or public artifacts. The relay uses AES-256-GCM with owner/project/connection/revision authentication; its encryption keyring lives in Secret Manager. Firebase administrators and relay operators can access decrypted data; this is not end-to-end encryption. Google receives the selected context or image, without Firebase credentials. Local-server URLs never become relay/authentication destinations.

## Relay operation

The relay runs in the existing Firebase project in `australia-southeast1`, with a dedicated `gratitude-ai-relay` service account. It verifies Google sign-in, disabled/revoked accounts and credential ownership; accepts only Google’s fixed native Gemini host; rejects redirects; bounds input/model/output sizes; and exposes safe errors rather than provider diagnostics. CORS allows the deployed GitHub Pages origin. A separate deployment must explicitly configure its own trusted app origin and Firebase project.

Configuration uses at most two 256 MiB instances, zero minimum instances and eight concurrent calls per instance. Per account, inference is limited to one active call, five relay operations per minute while generating, ninety per hour and four hundred per day. Metadata operations allow fifteen per minute within the same hourly/daily totals. Deletion can interrupt an active inference. A source request is dispatched at most once; an interrupted/lost result requires a new request rather than repeating potentially billable inference. Automatic cloud refills retain the existing pacing and opt-in.

Normal Cloud Functions, Firestore, Secret Manager and Google inference usage charges apply. The encryption keyring is separate from the repository Gemini secret and the Web Push signing key. Do not rotate it by discarding old key versions: retain old entries for decryption, introduce a new active version, then migrate ciphertext before retiring an old key. Revoking a personal connection deletes its encrypted document; historical journal events retain only opaque references and accepted final answers.

After backend tests, an administrator provisions each environment using:

```sh
nix develop -c npm ci --prefix functions
nix develop -c node scripts/configure_ai_relay.mjs preview
nix develop -c npx firebase deploy --project gratitude-drbrrl-dev --only firestore,functions:gratitude-push:personalGemini --non-interactive
```

Use `production` and `gratitude-drbrrl` for the production environment. This targets the new callable only and preserves the existing hug notification sender. [FIREBASE_SETUP.md](FIREBASE_SETUP.md) records actual deployment status; the commands above are reproducible setup instructions, not evidence that a deployment occurred.

The emulator function port is `15001`. Local Functions can use a private `functions/.secret.local` containing a disposable `GRATITUDE_AI_KEYRING` JSON keyring; that file is ignored by Git. Automated browser tests intercept the callable boundary using fictional replies. Relay integration tests exercise the real Firestore emulator with injected fictional Google responses; CI makes no paid requests.
