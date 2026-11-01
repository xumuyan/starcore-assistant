import {DictationService} from './assistant-dictation.mjs';

// An additive protocol gate. False means run the original host switch unchanged.
export class AssistantDictationHost {
  constructor({assistant,asr,emit,fetchRequest,prepareASR}) {
    this.emit=emit;
    this.dictation=new DictationService({asr,emit,fetchRequest,prepareASR,
      getSettings:()=>assistant.config,getKeys:()=>assistant.keys,
      isBlocked:()=>!!(assistant.busy||assistant.asrBusy||assistant.playing)});
  }
  get active(){return this.dictation.active;}
  cancel(){this.dictation.cancel();}
  handle(event){
    if(!event||typeof event!=='object')return false;
    switch(event.type){
      case 'dictationPrepare':return this.dictation.begin(event.id).then(()=>true);
      case 'dictationChunk':return this.dictation.append(event).then(()=>true);
      case 'dictationFinish':return this.dictation.finish(event).then(()=>true);
      case 'dictationCancel':this.dictation.cancel(event.id);return true;
    }
    if(['configure','cancel','sleep','clear','listen'].includes(event.type)){
      this.dictation.cancel();return false;
    }
    if(this.active){
      if(event.type==='audio')return true; // Late wake-mode audio must not share ASR.
      if(['text','activate','previewVoice'].includes(event.type)){
        this.emit({type:'error',message:'正在语音输入，请结束或取消后再试'});return true;
      }
    }
    return false;
  }
}
