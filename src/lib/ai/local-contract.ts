export const DEFAULT_LOCAL_MODEL = 'google/gemma-4-31b';
/** Literal user-selected destination/model; credentials and addresses stay on this device. */
export type LocalModelTarget = { provider: 'lm-studio'; model: string; thinking: false };
export function validLocalTarget(value: {provider?:unknown;model?:unknown;thinking?:unknown}) {
  return value.provider==='lm-studio' && value.thinking===false && typeof value.model==='string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:/@+-]{0,79}$/.test(value.model);
}
export type SummaryOutput = {text:string;model:string;finishReason:'STOP'};
export type GenerateSummary = (()=>Promise<SummaryOutput>) & {target?:LocalModelTarget};
