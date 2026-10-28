import {availableBackups,BACKUP_MINIMUM,BACKUP_LEASE_MS,CLOUD_REFILL_INTERVAL} from '../backup-prompts.ts';
import type {Projection} from '../domain.ts';
export type RefillInput={state:Projection;ready:boolean;online:boolean;visible:boolean;busy:boolean;removed?:string[];pendingPrompt?:string};
/** Open-app scheduler only. No inference from replay or a snapshot listener. */
export class BackupRefiller {
  private running=false;
  private next=0;
  private failures=0;
  private duplicates=0;
  status='';
  reset(){this.next=0;this.failures=0;this.duplicates=0;this.status='';}
  private generate:()=>Promise<void>;
  private now:()=>number;
  constructor(generate:()=>Promise<void>,now=()=>Date.now()){this.generate=generate;this.now=now;}
  async tick(input:RefillInput,latest:()=>Projection) {
    const {state}=input,choices=state.ai.choices;
    if(this.running||this.failures>=3||this.duplicates>=3||this.now()<this.next||!input.ready||!input.online||!input.visible||input.busy||!choices.enabled||!choices.backupEnabled)return;
    const count=availableBackups(state,input.removed,input.pendingPrompt).length;
    if(count>=BACKUP_MINIMUM){this.status=`${count} backups ready.`;return;}
    const pending=state.ai.control.requestId;
    // The server independently enforces a three-minute claim; a live foreground request wins.
    if(pending && this.now()-Date.parse(state.ai.requestedAt[pending]??'')<BACKUP_LEASE_MS){this.status='Waiting for the current prompt request.';return;}
    if(choices.backupProvider==='gemini' && Object.values(state.ai.requests).some(r=>!('provider' in r.payload) && this.now()-Date.parse(state.ai.requestedAt[r.eventId])<CLOUD_REFILL_INTERVAL))return;
    this.running=true;this.status=`Preparing a backup with ${choices.backupProvider==='lm-studio'?'LM Studio':'Gemini'}…`;
    try{
      await this.generate();
      const after=availableBackups(latest(),input.removed,input.pendingPrompt).length;
      if(after<=count)this.duplicates++;else this.duplicates=0;
      this.failures=0;this.status=this.duplicates>=3?'Refill paused: the model repeated existing prompts. Retry when you are ready.':`${after} backups ready.`;
    }catch{this.failures++;this.status=this.failures>=3?'Refill paused. Check the selected model connection, then retry.':'Backup refill is waiting for the selected AI. Your saved prompts are ready to use.';}
    finally{this.running=false;this.next=this.now()+(this.failures?Math.min(30*60_000,60_000*5**(this.failures-1)):choices.backupProvider==='gemini'?CLOUD_REFILL_INTERVAL:3000);}
  }
}
