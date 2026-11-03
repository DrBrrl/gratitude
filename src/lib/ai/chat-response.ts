/** Only complete final text is accepted; reasoning and tool outputs are never journal data. */
export function finalText(text:unknown,model:unknown,max:number) {
  if(typeof text!=='string'||!text.trim()||text.length>max||/<\/?think>|<\|channel[>|]|<\|turn[>|]|<channel\|>|<turn\|>/i.test(text)||typeof model!=='string'||!model.trim()||model.length>100) throw new Error('invalid-response');
  return {text,model,finishReason:'STOP' as const};
}
export function parseChatResponse(data:any,max:number) {
  const choice=data?.choices?.[0],message=choice?.message;
  if(!Array.isArray(data?.choices)||data.choices.length!==1||choice.finish_reason!=='stop'||message?.role!=='assistant'||message.tool_calls?.length) throw new Error('invalid-response');
  return finalText(message.content,data.model,max);
}
