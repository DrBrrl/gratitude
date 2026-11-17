import type {AIChoices} from '../domain.ts';
/** Resolve a literal task choice at use time; old explicit choices stay explicit. */
export const backupProvider=(choices:Pick<AIChoices,'provider'|'backupProvider'>)=>choices.backupProvider==='prompt'?choices.provider:choices.backupProvider??'lm-studio';
export const backupConnectionId=(choices:Pick<AIChoices,'backupProvider'|'backupConnectionId'|'promptConnectionId'>)=>choices.backupProvider==='prompt'?choices.promptConnectionId:choices.backupConnectionId;
