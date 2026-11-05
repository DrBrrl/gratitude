import {parseAction, type Action, type SourceAction} from './domain.ts';

/** Device-only selection provenance; never part of a journal event or export. */
export type ReflectionDraft = Action & {selectedPromptId?: string; saveDay?: string; saveAttempted?: boolean};

export function draftSaveActions(draft: ReflectionDraft): {reflection: Action; acceptance: SourceAction | null} {
  const reflection = parseAction({eventId:draft.eventId,type:draft.type,schemaVersion:draft.schemaVersion,payload:draft.payload}) as Action;
  const acceptance = draft.selectedPromptId && draft.saveDay ? parseAction({
    eventId:`a_${draft.saveDay}_${draft.selectedPromptId}`,type:'PromptAccepted',schemaVersion:1,
    payload:{promptId:draft.selectedPromptId,day:draft.saveDay}
  }) : null;
  return {reflection,acceptance};
}

/** Append idempotently in this order. Keep the pending draft until both succeed. */
export async function commitDraft(draft: ReflectionDraft, append: (action: SourceAction) => Promise<unknown>) {
  const {reflection,acceptance} = draftSaveActions(draft);
  await append(reflection);
  if (acceptance) await append(acceptance);
}
