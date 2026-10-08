import { initializeAppCheck, ReCaptchaEnterpriseProvider, getToken, type AppCheck } from 'firebase/app-check';
import type { FirebaseClient } from '../firebase/client';
import { SYSTEM_PROMPT, type GeneratePrompt } from './context';

export const personalContextAvailable = import.meta.env.VITE_AI_DATA_MODE === 'paid' || (import.meta.env.VITE_FIREBASE_EMULATORS === 'true' && import.meta.env.VITE_AI_DATA_MODE !== 'generic');
export const aiAvailable = import.meta.env.VITE_FIREBASE_EMULATORS === 'true' || !!import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY;
const appChecks = new WeakMap<FirebaseClient['app'], AppCheck>();

/** Firebase AI Logic's managed gateway keeps the Gemini key on Google's backend.
 * Use its wire response: Firebase JS 12.19 drops modelVersion during SDK mapping.
 * Auth/App Check still use the supported Firebase SDKs. No global fetch patching.
 */
export function geminiGenerator(client: FirebaseClient): GeneratePrompt {
  return async context => {
    if (!aiAvailable || !client.auth.currentUser) throw new Error('AI prompts are not available.');
    const headers: Record<string, string> = { 'Content-Type': 'application/json',
      'x-goog-api-key': client.app.options.apiKey!, Authorization: `Firebase ${await client.auth.currentUser.getIdToken()}` };
    if (!client.emulators) {
      let check = appChecks.get(client.app);
      if (!check) {
        check = initializeAppCheck(client.app, { provider: new ReCaptchaEnterpriseProvider(import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY), isTokenAutoRefreshEnabled: true });
        appChecks.set(client.app, check);
      }
      headers['X-Firebase-AppCheck'] = (await getToken(check)).token;
    }
    // Tests intercept this same HTTP boundary using fictional provider responses.
    const response = await fetch(`https://firebasevertexai.googleapis.com/v1beta/projects/${client.projectId}/models/gemini-3.6-flash:generateContent`, {
      method: 'POST', headers, signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] }, contents: [{ role: 'user', parts: [{ text: context }] }],
        generationConfig: { maxOutputTokens: 2048, candidateCount: 1 } })
    });
    if (!response.ok) throw new Error('unavailable'); // Never persist provider error bodies or credentials.
    const data = await response.json();
    const candidate = data.candidates?.[0];
    if (!candidate || candidate.finishReason !== 'STOP') throw new Error('blocked');
    const parts = candidate.content?.parts;
    if (!Array.isArray(parts) || parts.some(part => !part.thought && typeof part.text !== 'string')) throw new Error('invalid-response');
    const text = parts.filter(part => !part.thought).map(part => part.text).join('');
    if (!text.trim() || text.length > 600 || typeof data.modelVersion !== 'string' || !data.modelVersion.trim() || data.modelVersion.length > 100) throw new Error('invalid-response');
    return { text, model: data.modelVersion, finishReason: 'STOP' };
  };
}
