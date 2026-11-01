# LM Studio

Gratitude can generate reflection prompts and photo summaries with LM Studio instead of the managed Gemini gateway. The preferred model identifier is **`google/gemma-4-31b`**. The same gratitude instruction, twenty-reflection selector, sharing switches, explicit feedback and recorded-response replay apply.

The provider choice syncs to your account. Connections use tab-only tokens by default. Optional **Account token sync** restores the saved token, server address and model on another signed-in device. A device without a working local connection reports the problem and keeps LM Studio selected. It never automatically sends a failed local request to Gemini.

Your journal, events and saved photos still sync through Firebase. Local inference does not turn Gratitude into an offline application or change where the journal is stored.

## Prepare the server

1. Open LM Studio, download/load the desired model and start the server in its Developer tab. Use the **API identifier** shown there, rather than the model’s display name.
2. Enable **Require Authentication**, create a dedicated **Gratitude** token, and enable **CORS**. Set **Allow per-request remote MCP servers** and **Allow calling servers from mcp.json** to **Deny**; Gratitude uses metadata discovery and chat inference without MCP tools. Keep the token out of the repository and chat.
3. On the computer running LM Studio, the server can be `http://127.0.0.1:8080`. The model connection test lists capabilities and the loaded context length; it makes no inference request and sends no journal text.

[LM Studio server settings](https://lmstudio.ai/docs/developer/core/server/settings) describe CORS and network options; [authentication](https://lmstudio.ai/docs/developer/core/authentication) describes API tokens.

## Firefox and access from a phone

`127.0.0.1` on a phone refers to the phone, so it cannot reach the computer’s loopback server. Firefox treats loopback HTTP as a trustworthy local origin, but a hosted HTTPS app needs a suitable HTTPS connection for ordinary network addresses. See [Mozilla’s mixed-content documentation](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Mixed_content).

For devices connected to the same Tailscale network, Tailscale Serve provides a private HTTPS address and forwards requests to the computer’s loopback server:

```sh
tailscale serve --bg --https=443 http://127.0.0.1:8080
tailscale serve status
```

Follow the CLI’s account setup link if Serve/HTTPS is not enabled. Use the HTTPS origin it prints, such as `https://my-computer.my-tailnet.ts.net`, as the LM Studio server URL on both devices. Both devices need Tailscale connected, and the computer, LM Studio and its API server must remain running. Keep the API token requirement and CORS enabled in LM Studio.

Serve is available within the tailnet. This setup uses **Serve**, rather than a public Funnel endpoint. See [Tailscale’s Serve guide](https://tailscale.com/docs/features/tailscale-serve) and [CLI reference](https://tailscale.com/docs/reference/tailscale-cli/serve). If a Serve configuration already exists, review it before replacing its route; these commands assume port 443 is available for this service.

## Another model computer, including Windows 11

Run Serve on the computer that runs LM Studio. Each computer has its own Tailscale DNS name and Serve configuration; enabling it on the first computer does not configure the second. On Windows 11, open PowerShell and inspect the existing service:

```powershell
tailscale serve status
```

If no existing HTTPS port-443 route needs preserving, configure the loopback server and check the exact URL:

```powershell
tailscale serve --bg --https=443 http://127.0.0.1:8080
tailscale serve status
```

Use the HTTPS origin printed for that computer, such as `https://other-laptop.my-tailnet.ts.net`, in Gratitude. Do not append port 8080 or `/v1/chat/completions`: Serve accepts HTTPS on 443 and forwards to local port 8080. Keep LM Studio listening on loopback with authentication and CORS enabled. Both machines must be connected to the tailnet and permitted to communicate; the model laptop must stay awake with LM Studio’s server running.

If the CLI is not on PowerShell’s PATH, use `& "$env:ProgramFiles\Tailscale\tailscale.exe" serve status` and the same executable prefix for the setup command. A permission error may require an administrator PowerShell. A browser visit to the model endpoint returning “API token required” proves the route is reachable; use Gratitude’s token field for authenticated testing, not a token in the URL.

The prompt connection stores one LM Studio server/model per account/device. Photos can use a separate connection, described below. Changing its server clears the token input; enter a token issued by the new server and choose its model before saving. **Remember token in my account** replaces the existing saved connection for other devices, so choose this deliberately. [AI_PROVIDER_DESIGN.md](AI_PROVIDER_DESIGN.md) proposes named connections for switching between computers and other services.

## Configure Gratitude

1. Sign in and open **Settings → AI settings**.
2. In **AI model**, choose **LM Studio · local model**.
3. Enter this device’s server URL, `google/gemma-4-31b` (or its actual API identifier), and the API token.
4. Choose **Test connection**. It reports whether the model is available/loaded, supports photos, and its loaded context length. If the server offers multiple identifiers, **Model API identifier** becomes a picker showing loaded/available models, including loaded instance aliases. Choose a model there; models without thinking-off support are disabled. An unavailable current identifier stays selected until you explicitly replace it. **Enter an identifier manually…** returns to text input; test again to refresh the picker. Metadata discovery makes no inference request.
5. Choose **Save model settings**. This saves the provider to your account and the connection details on this device.
6. Enable **AI prompts**, choose the journal/feedback sharing you want, optionally supply preferences, then **Save AI choices**.

Generate prompts from Today or the reflection editor. Attaching a photo offers a separate disclosure before local image processing; only the normalized photo is sent for its summary. A non-vision model can still generate prompts; photos can be attached without AI and summaries can be written manually.

By default, repeat the address/token setup on another device. The address/model are stored locally for the Firebase project, application path and account. The token uses `sessionStorage`, survives a reload of the tab, and is cleared on sign-out/account switch. Closing the tab normally ends that token session.

To avoid re-entering the token, expand **Account token sync** in the local model connection and choose **Remember token in my account**. This is a separate explicit action from saving model settings and does not enable AI or change providers. It saves the token together with its server origin and model to a mutable owner-only `users/{uid}/privateSettings/lmStudio` document. Other signed-in devices restore that complete pair while connected; editing the server URL clears the password field so it cannot silently reuse the saved token at a different destination. HTTPS is required beyond loopback. Use the same reachable Tailscale HTTPS origin on computer and phone.

**Forget saved token** deletes the account record and clears restored tokens in connected tabs. An offline device or a copied token cannot be remotely erased by this action: delete the token in LM Studio to revoke it everywhere. Sign-out clears this tab's token but leaves the deliberately saved account record available for the next sign-in. Private previews and production use separate Firebase projects and do not share credentials.

Firestore encryption at rest and owner-specific Rules protect stored access, but privileged Firebase project administrators and the running application can read the token. This is not end-to-end encryption. The Firebase client uses its default memory cache; credentials never enter the journal's IndexedDB checkpoint, event stream, exports, public asset cache, build configuration or repository secrets. Use a dedicated token, deny both MCP permissions, keep Require Authentication enabled, and keep the server private through Tailscale HTTPS. Delete and replace an exposed token in LM Studio. See [token controls](https://lmstudio.ai/docs/developer/core/authentication), [Firestore access conditions](https://firebase.google.com/docs/firestore/security/rules-conditions) and [encryption at rest](https://firebase.google.com/docs/firestore/enterprise/server-side-encryption).

## Use another model or computer for photos

Open **Settings → AI settings → Photo description model**. **Same as prompt model** is the default and reuses the prompt connection’s service, server, model and token. Choose a vision-capable prompt model if you want one model to do both jobs.

Choose **Separate LM Studio connection** to give photos their own HTTPS server, token and model. Test the connection to pick a model from that server, then **Save model settings** in the **Photo model** card. The ordinary prompt connection stays unchanged. You can use different models on one computer or models on two computers. **Gemini → Save photo model** selects the managed photo service independently of the prompt provider.

Each local slot has its own optional **Account token sync**. Remember the photo token in the Photo model card to restore its bound server/model/token on another device. It uses the same owner-only protection and administrator-access limitation as the prompt token, in a separate `lmStudioPhotos` record. Forgetting it leaves the prompt token intact. If you change only the model on an already remembered connection with the same server/token, saving updates the remembered model too. Changing servers clears the token and requires explicitly remembering the new bound connection.

The selected photo destination appears in the attachment disclosure. Only the normalized image and visible-content instruction go there. It receives no reflection draft or personal prompt context. A text-only prompt model does not prevent a separate vision model from describing photos. A failed photo server never causes an image to be sent to the prompt server or Gemini. Choose **Same as prompt model → Save photo model** to return to sharing the prompt connection.

Legacy accounts keep their existing shared behaviour. New choices and requests are recorded with provider/choices revision checks; a late summary after settings change is discarded. Reloading, synchronizing or rebuilding never repeats inference. Connection secrets stay outside events and exports.

## Request behaviour

The browser calls [native model discovery](https://lmstudio.ai/docs/developer/rest/list) at `GET /api/v1/models`, then the [OpenAI-compatible chat endpoint](https://lmstudio.ai/docs/developer/openai-compat/chat-completions) at `POST /v1/chat/completions`. It sends only the LM Studio bearer token to the configured server, with cookies omitted and redirects rejected. Firebase credentials and API keys are not forwarded.

Requests are non-streaming. Thinking-capable models receive the requested setting:

```json
{
  "chat_template_kwargs": { "enable_thinking": false }
}
```

When discovery advertises an `off` reasoning option, the OpenAI-compatible request includes `"reasoning_effort": "none"` (its non-thinking value, distinct from native model discovery’s `off` option). A model advertising reasoning with no off option is rejected before inference. Non-thinking models omit those fields. The [Gemma model profile](https://lmstudio.ai/models/google/gemma-4-31b) identifies its reasoning/vision support. Server configuration ultimately determines model execution; the client also rejects incomplete outputs or visible thinking/control markers and never saves a separate reasoning field.

The exact final assistant content and reported model identifier become response events. Existing bounds remain 600 characters for a prompt and 1,000 for a photo summary. A server-reported model identifier is not an immutable model-weight digest. Replay, synchronization and recovery never call either model provider.

Daily prompt failures appear beside Today’s request controls; a recorded failure keeps a generic notice after reload, without automatically retrying.

Local inference has a 120-second timeout; discovery has a ten-second timeout. Neither is automatically retried. A full twenty-reflection context with paired prompt feedback may need a larger loaded context window: inspect the reported length and adjust the model’s load settings if needed. Gratitude does not silently truncate the assembled JSON or reduce the chosen sources to make a server accept it.

## Troubleshooting

- **401/403:** enter a valid LM Studio token on this device and check its permissions.
- **Cannot reach the server:** check its address, CORS, the browser’s network permission, computer/server availability and the HTTPS/Tailscale connection. Keep Firefox’s normal mixed-content protection enabled.
- **Model unavailable:** verify the exact API identifier; discovery accepts a model key or loaded-instance ID.
- **Thinking cannot be disabled:** select a model/runtime exposing the required off option.
- **Context or generation failure:** check the loaded context window and model availability, then explicitly retry. The current prompt or starter remains available; Gemini is not used as a fallback.
- **Photo unsupported:** use a vision-capable model or attach without AI and write the summary.

## Event and deployment compatibility

`AIChoicesConfirmed` schema 2 stores the account’s literal provider choice; schema 1 retains its Gemini meaning. Prompt request schemas 5/6 add the chosen local provider/model and `thinking: false` to the existing daily/editor request inputs. Photo-summary request schema 2 records that same target. Addresses and tokens remain outside the canonical stream. Responses retain their existing schemas and exact text.

Projection version 9 includes the provider choice and backup reserve. Older checkpoints rebuild without affecting drafts or received-result outboxes. Transactions and Rules bind new prompt/photo requests to the account’s current provider, so a stale or unconfigured device cannot claim a Gemini request for an account selecting LM Studio. Existing sharing, ownership, immutable-event and atomic-control checks remain in force. Compatible Rules must be deployed before publishing the client; older open tabs need a refresh to read the new event versions.

Scenario [025-lm-studio](tests/e2e/025-lm-studio/README.md) covers configuration, authenticated metadata, thinking-off payloads, daily/editor prompts, photos, a second device without credentials, failures and replay. Its server responses/tokens are fictional. Each action has a full-page unmasked screenshot comparison at zero pixel tolerance, with checks underneath. No private journal or live inference is needed for automated tests.

Scenario [029-account-token](tests/e2e/029-account-token/README.md) covers opt-in account storage, independent-device restoration, authenticated metadata, server-destination edits, deletion propagation and reload after forgetting. All credentials and servers are fictional. Authenticated Rules tests also reject another account, collection listing, malformed records and insecure remote origins.

If an older build produces `Invalid reasoning_effort value: off`, update/reload Gratitude after the fix is deployed. Model discovery can succeed while chat validation rejects the request before generation: native discovery's `off` setting maps to the chat endpoint's `none` value. Authentication and CORS do not need to be disabled.
