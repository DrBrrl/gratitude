# AI connections and personal API keys

This is a proposal for review, except for the LM Studio model picker and independent prompt/photo connections described below. Additional services, named connection profiles and personal cloud keys are not implemented by this PR. Prompt/photo task slots and the explicit shared-model option are implemented. No relay, billing configuration or new cloud resources are provisioned.

## Starting point

Gratitude currently supports managed Gemini through Firebase AI Logic and a direct browser connection to LM Studio. AI sharing choices and provider selection follow the account. An LM Studio connection stays on the device unless the user explicitly remembers its bound server/model/token in private account settings. [LM_STUDIO_SETUP.md](LM_STUDIO_SETUP.md) documents those controls and their trust boundary.

The current adapter discovers models using LM Studio’s native `GET /api/v1/models`, then generates using `POST /v1/chat/completions`. A server exposing chat completions alone cannot use that discovery code. Provider choices, request schemas, backup refill choices and Firestore Rules currently enumerate Gemini and LM Studio; adding a dropdown option alone would leave persistence and replay incomplete. Evidence: `src/lib/ai/lm-studio.ts`, `src/lib/domain.ts`, `src/lib/firebase/model-credential.ts` and `firestore.rules`.

The model picker in this PR uses the existing **Test connection** action to fetch that instance’s catalogue without inference. When there is a choice, **Model API identifier** becomes a select showing available identifiers and whether they are loaded. Loaded instance aliases are included; embeddings and malformed identifiers are excluded. Models advertising reasoning without an off option remain visible but disabled. The current unavailable identifier is retained until the user chooses a replacement. **Enter an identifier manually…** retains manual configuration. Choosing a model updates capability feedback, and **Save model settings** remains the explicit save action. Changing the server/token clears the discovered choices; failed discovery cannot leave another server’s catalogue selectable. Discovery never downloads or loads a model.

## Implemented prompt/photo choices

**Settings → AI settings → Photo description model** defaults to **Same as prompt model**. This reuses the prompt service, computer, model and token. Choose **Gemini** for an independent managed photo service, or **Separate LM Studio connection** for a different server/model/token. Its picker and optional account token sync are independent of the prompt connection. Save the photo choice explicitly. A prompt-only text model can coexist with a vision model on another laptop; either server can fail without calling the other as a fallback.

`AIChoicesConfirmed` schema 4 records the literal photo choice (`prompt`, `gemini` or `lm-studio`) while retaining prompt consent and backup choices. Older choices retain shared-model behaviour. New photo requests use schema 3 to capture the selected provider/model and source choices ID; older photo schemas remain replayable. Transactions, Rules and replay reject wrong-provider or stale-choice requests and late responses after a settings change. Projection version 10 rebuilds older caches without inference.

The photo slot has its own device scope and optional owner-only `users/{uid}/privateSettings/lmStudioPhotos` credential record. The existing `lmStudio` record remains the prompt/local-backup slot. Forgetting either token leaves the other intact. Existing independent backup-provider selection remains; a separate named backup host/profile is still proposed. Saved model changes on an already remembered, unchanged server/token update that account connection’s model; a new server/token still requires explicit **Remember token in my account**.

## Connection experience

Keep **Settings → AI settings → AI model** as the entry point. Introduce named connections such as “Laptop”, “Other laptop”, “Ollama at home” and “My Gemini key”. Each connection has an explicit service, destination, model and credentials. An identifier such as `google/gemma-4-31b` names a model within a server; it does not identify the server, its protocol or its capabilities.

Proposed flow:

1. **Add connection** → choose the service and a name.
2. For a local service, enter its reachable server URL and any required token. For a supported cloud service, follow its official key-creation link and enter the key through the selected secure route.
3. **Test connection** checks authentication and model metadata. It sends no journal text and performs no inference. Report reachability, model availability and supported tasks separately. A successful list request does not prove generation, billing or sufficient context capacity.
4. Pick a discovered model, review text/photo/non-thinking support, and save. A manual identifier remains available where discovery is limited. Unknown capabilities stay unknown until an adapter-specific check establishes them.
5. Assign connections independently to **Reflection prompts**, **Photo descriptions** and **Backup prompts**. Each choice includes both a model and the computer/service hosting it; two tasks can use different models on one server or different servers entirely. Text-only prompt choices keep photo attachment/manual summaries available. Backup refill retains its existing opt-in and thirty-unused-prompt target.

Profiles can be account-synchronized independently of secrets; synchronizing a private destination/name requires explicit consent too. Active connection selection normally follows the account, with an explicit **Use on this device** override for a host another device cannot reach. The UI shows an override and offers restoring the account choice. A missing/deleted/inaccessible connection asks for another choice and never silently switches providers. Switching a laptop URL must clear a token that belongs to the previous destination.

For example, prompts can use “Writing laptop · small text model” while photo descriptions use “Photo laptop · vision model”. Photo descriptions must discover and validate the photo connection’s model and send the image to that destination only. The prompt connection need not support vision. An offline photo computer must not stop reflection-prompt generation on another computer, and a prompt-model change must not overwrite a separately chosen photo model. The same separation applies when one task uses managed Gemini and another uses a local service.

Show a service/server/model summary beside each task selector, with **Use prompt connection** as an explicit sharing option for photos or backups. Migration preserves today’s behaviour by initially assigning prompt and photo tasks to the existing selected connection and retaining the existing backup preference. Resolve a shared connection once at request creation; a subsequent settings change cannot reroute an already captured photo or prompt. Removing a profile must identify all tasks that use it and ask for replacement selections rather than choose a provider silently. A second signed-in device restores task selections independently from any opt-in credentials; unavailable credentials get a task-specific setup message.

Model lists and capability observations are disposable, scoped to connection revision, service and model. Refresh on explicit connection testing and validate again before generation. A loaded marker is an observation, not a guarantee that the model will remain loaded. Never silently substitute an available model for the selected one.

## Services and adapters

Separate the product’s service name, protocol adapter, transport route and chosen model. Share context construction and response recording while adapting discovery, payloads and final-response validation per service.

| Service | Suggested transport and adapter | Scope |
| --- | --- | --- |
| Managed Gemini | Existing Firebase AI Logic gateway | Preserve current implementation and default |
| LM Studio | Browser to private HTTPS/loopback; native discovery and chat completions | Preserve current inference and add the implemented model picker |
| Ollama | Browser to private HTTPS/loopback; native model metadata/chat adapter | First proposed additional local service |
| Other OpenAI-compatible local server | Browser to an explicitly configured server; a versioned chat-completions adapter | Candidate opt-in compatibility mode; verify each supported server/model |
| Personal Gemini key | Trusted relay to Google’s native Gemini API | First proposed personal cloud service |
| Other personal cloud key | Trusted relay with a dedicated provider adapter | Select the next provider after confirming demand and its API/terms |

Ollama documents only a subset of OpenAI compatibility. Its native chat API has its own thinking control and metadata contract; do not send LM Studio’s `chat_template_kwargs` blindly. Its local API does not enforce the placeholder OpenAI-client API key, so secure network access independently and do not present that field as authentication. Hosted browser access also requires an allowed app origin. See [OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility), [chat and thinking controls](https://docs.ollama.com/api/chat), and [origin/network configuration](https://docs.ollama.com/faq).

vLLM is a candidate for the compatibility adapter, subject to fixture and real-server verification; its [server documentation](https://github.com/vllm-project/vllm/blob/main/docs/serving/online_serving/openai_compatible_server.md) describes chat-template requirements. Other servers, including llama.cpp and LocalAI, are candidates rather than a blanket support promise. A service exposing an OpenAI-shaped endpoint can still differ in discovery, auth, reasoning controls, vision and finish reasons.

Adapters must reject incomplete/blank/oversized/tool-call output and visible reasoning/control markers. Preserve exact valid final text and the reported model; never store a separate reasoning field. Maintain existing prompt/summary bounds. Preserve the user’s non-thinking preference using documented model-specific controls; a model that cannot meet it is unavailable rather than silently overridden. Unsupported photos fail before image transmission. No tools, remote MCP, model-management calls or automatic downloads are part of connection testing or generation.

Initially accept a server origin, matching the existing LM Studio form; normalize its optional `/v1` suffix consistently. Prefix-mounted services require a separately designed base-path field and matching credential binding. Reject embedded credentials, query secrets and unsupported schemes. Do not silently discard an arbitrary path and send a token to an unintended endpoint.

## Personal keys and hosting

A person can create their own Gemini key through [Google AI Studio](https://aistudio.google.com/api-keys), associated with their own project and its billing/quota. Follow the provider’s current [key restrictions and security guidance](https://ai.google.dev/gemini-api/docs/api-key). A Firebase web configuration key is not a substitute for that inference credential. The existing managed Gemini connection remains available without asking every user to obtain a key.

GitHub Pages serves a static SPA; it cannot keep a production cloud credential secret in a build variable or perform protected server-side calls. Google recommends a backend proxy for production client applications. Recommended proposal: an **optional authenticated relay** for user-owned cloud keys. This adds infrastructure, deployment, operational cost and an administrator trust boundary; it is a review decision, not an assumption that Cloud Functions must be introduced. A person hosting their own Gratitude can instead run the same relay under their own control. The hosting guide would document the relay URL, deployment, key onboarding, rotation, deletion and expected costs.

The browser sends a newly entered key once over HTTPS to its chosen trusted relay, which stores it in an owner-scoped encrypted secret store with narrowly scoped service access. Subsequent requests use an opaque credential reference; the key is write-only through the app API and is never returned to a second device. Cross-device use authenticates as the same owner. A self-hosted deployment can provision its own key as a server secret instead. Neither approach embeds a developer inference key in Pages, `VITE_*`, source files or public CI artifacts. A password field alone does not make a long-lived cloud key safe to retain in browser storage.

Pin the trusted relay origin in deployment configuration; a user-editable local-server URL must never become a destination for Firebase credentials. A self-hosted relay explicitly configures and verifies its own accepted Firebase project/audience. The relay must authenticate the owner, authorize ownership of each credential reference, restrict allowed app origins, enforce request size/task/model/concurrency limits, and redact content and credentials from logs. App Check can supplement authentication on supported deployments. Route only to explicitly supported provider hosts: it must not become an arbitrary URL proxy, and must reject redirects and private/loopback destinations. It cannot reach a user’s private tailnet by default; local inference continues directly from the browser. Provider tokens go only to their bound destination. Never forward Firebase credentials to a local server or provider; the app authenticates to the relay separately.

Deleting a connection deletes its relay secret and prevents future requests. It cannot undo information already sent to the provider or cancel every in-flight remote computation. Explain provider-side revocation and let users replace keys. Relay/server administrators can access decrypted keys and request contents; do not claim end-to-end encryption. Existing optional LM Studio token sync remains separate and retains its documented owner-only Firestore access and revocation limitations.

## Sharing, cost and availability

Use the same logical-entry-date twenty-reflection selector, explicit prompt/feedback pairs and sharing switches for every provider. Prompt JSON excludes photos, drafts and identity; image summaries send only the selected normalized photo and the visible-content instruction. Gemini-curated user notes remain deferred. Provider-specific output adaptation must not quietly expand input sharing.

Changing the destination/provider requires reviewing its data handling. A personal key does not prove paid-tier terms, and the managed site’s `aiDataMode: paid` does not apply to a different account/provider. Record the user’s explicit acknowledgement of the destination’s current terms; default unfamiliar cloud connections to generic prompts until approved personalization is permitted. Show terms and the selected destination before sending photo data. A settings declaration or successful metadata request cannot attest to a provider’s actual billing tier.

Personal cloud usage is billed/quota-limited by that provider. Distinguish authentication, exhausted quota, payment eligibility, timeout and unsupported capability with safe messages and explicit retry. Never display raw provider diagnostics containing secrets or reflection excerpts. An optional **Try a sample prompt** uses fictional text, clearly authorizes a potentially billable inference, and is separate from metadata testing.

Backup refilling uses the explicitly chosen connection and existing consent, deduplication and single-refill coordination. The refill label identifies the connection and whether it is local/cloud. Do not call another provider on failure or multiply requests across signed-in devices. Existing stored backup questions remain usable without any model connection.

## Persistence and replay

Credentials are mutable operational configuration, separate from the event stream, projections, journal checkpoints and exports. Treat provider keys and local tokens as secrets; keep them out of URLs, screenshot fixtures, public caches and logs. Connection metadata needed for an operational request lives in private settings; journal exports do not become connection/credential backups.

Version user selection/request schemas to retain independent prompt/photo/backup assignments and the user-selected connection ID, provider, requested model and non-thinking preference for each request. Photo request validation must compare against the photo assignment, replacing today’s check against the single foreground provider; changing prompt settings must not authorize a photo call to the new prompt destination. Connection IDs are opaque, not encoded endpoints. Keep an immutable private connection revision for request routing while a request is active; credential replacement revokes new dispatch using an older revision. Do not log computed capability flags, loaded status, “connection healthy”, balances or model lists as journal source events. Existing events retain their interpretation; schema adapters must not reinterpret old `gemini` events as personal-key requests.

Capture the approved context and source references, target connection revision, task, model and sharing revision once before dispatch. Consent edits, account changes, deletion or manual summary/prompt changes invalidate late results using the existing request/revision guards. An explicit retry uses the captured target only if it remains authorized and configured; otherwise it requires a new reviewed request. Never resolve an old request through whichever server happens to be selected now.

AI responses remain external-input events containing exact final text and reported model against their request. Replaying or rebuilding cached projections never performs network discovery or AI calls. Model lists, availability, streaks and usage remain projections or operational caches. Full and cached replay must agree even if the original server/key no longer exists. Existing daily/editor/photo/backup events and imported entries remain compatible. Deploy new Firestore Rules/schema support before enabling new request types; keep strict provider/choice/revision checks rather than accepting arbitrary payloads.

## Proposed implementation increments

1. **Connection profiles:** generalize the implemented prompt/photo slots into named connections without copying secrets into events; add independent prompt/photo/backup assignments, explicit profile selection/device override, and task-specific credential/capability validation. Preserve existing account token sync and no-fallback behaviour.
2. **Ollama:** add a native adapter with discovery, private HTTPS/origin setup, thinking-off handling and text prompts. Add vision only after a verified capability path and photo disclosure.
3. **Compatibility mode:** verify a chosen second local server against documented discovery, final-response, reasoning and photo contracts. List tested combinations; unsupported models get a clear message.
4. **Personal Gemini keys:** choose who hosts the optional relay, agree its cost/secret-retention limits, then implement authenticated key onboarding, request dispatch, deletion and self-hosting documentation. This step requires the relay deployment decision before provisioning.
5. **Additional cloud service:** select a provider, review its terms and build its explicit adapter on the same relay contract.

Each implementation increment should demonstrate a working feature with focused unit/Rules tests and mobile/desktop E2E walkthroughs. Cover failed discovery, multiple/empty lists, unloaded models, stale responses after switching servers/accounts, credentials bound to destinations, missing profiles on another device, photo capability failure, quota errors, no fallback, independent refill and cached/full replay. In particular, test prompts on laptop A and photos on laptop B, two models on one host, a text-only prompt model plus a vision photo model, task-specific outages and restoring both selections on another device. Use fictional keys/context and intercepted provider boundaries; no live paid inference or personal journals in CI. Follow every user action with a full-page screenshot comparison, without masks and with `maxDiffPixels: 0`, `threshold: 0`; generate checks beneath each screenshot.

Open decisions for implementation review: which second local service to verify after Ollama; whether profiles should sync names/destinations by default; who operates and pays for a personal-key relay; and which cloud service follows Gemini. The model picker and independent prompt/photo slots can ship while these broader choices are reviewed.
