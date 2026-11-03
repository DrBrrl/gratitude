/** Operational destinations and literal selections. Secrets never enter source events. */
export type LocalService = 'lm-studio' | 'ollama' | 'openai-compatible';
export type AIProvider = 'gemini' | LocalService | 'personal-gemini';
export type ExternalProvider = Exclude<AIProvider, 'gemini' | 'lm-studio'>;
export type ConnectionBinding = { connectionId: string; connectionRevision: string };
export type ExternalTarget = ConnectionBinding & {model:string} & ({provider:'ollama'|'openai-compatible';thinking:false}|{provider:'personal-gemini';thinking:'provider-default'});
export type ModelConnection = { provider: AIProvider; baseUrl: string; model: string; token: string; allowPersonal?:boolean } & Partial<ConnectionBinding>;
export const PROVIDERS: AIProvider[] = ['gemini', 'lm-studio', 'ollama', 'openai-compatible', 'personal-gemini'];
export const providerName = (provider: AIProvider) => ({gemini:'Gemini', 'lm-studio':'LM Studio', ollama:'Ollama', 'openai-compatible':'Compatible local server', 'personal-gemini':'My Gemini key'})[provider];
export const isLocalService = (provider: AIProvider): provider is LocalService => ['lm-studio','ollama','openai-compatible'].includes(provider);
export const isExternalProvider = (provider: AIProvider): provider is ExternalProvider => ['ollama','openai-compatible','personal-gemini'].includes(provider);
export const validModel = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:/@+-]{0,79}$/.test(value);
export const validConnectionId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
export function validExternalTarget(value: Record<string,unknown>) {
  return typeof value.provider==='string' && ['ollama','openai-compatible','personal-gemini'].includes(value.provider) && value.thinking===(value.provider==='personal-gemini'?'provider-default':false) && validModel(value.model)
    && validConnectionId(value.connectionId) && validConnectionId(value.connectionRevision);
}
export function externalTarget(connection: ModelConnection): ExternalTarget {
  const target = {provider:connection.provider,model:connection.model,thinking:connection.provider==='personal-gemini'?'provider-default':false,connectionId:connection.connectionId,connectionRevision:connection.connectionRevision};
  if(!validExternalTarget(target)) throw new Error('Save this model connection before generating.');
  return target as ExternalTarget;
}
