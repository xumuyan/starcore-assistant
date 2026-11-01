import test from 'node:test';
import assert from 'node:assert/strict';
import {AssistantDictationHost} from '../src/assistant-dictation-host.mjs';
import {assistantDefaults} from '../src/assistant-core.mjs';

const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const pcm=()=>{const data=Buffer.alloc(1600*4);for(let i=0;i<data.length;i+=4)data.writeFloatLE(.1,i);return data.toString('base64');};
function fixture(enabled=true){
  const events=[];let loads=0;
  const assistant={config:{...assistantDefaults,dictationEnabled:enabled},keys:{},busy:false,asrBusy:false,playing:false};
  const host=new AssistantDictationHost({assistant,asr:{transcribe:async()=> '让 Codex 也只是输入文字'},emit:e=>events.push(e),prepareASR:async()=>{loads++;},fetchRequest:()=>assert.fail('cloud call')});
  return {host,assistant,events,loads:()=>loads};
}
test('inactive dictation router passes original messages through unchanged',async()=>{
  const h=fixture(false);
  for(const type of ['configure','listen','audio','text','activate','cancel','sleep','clear','historyPage','latest','previewVoice','targets','playbackEnded'])assert.equal(await h.host.handle({type}),false,type);
  assert.equal(h.events.length,0);assert.equal(h.loads(),0);
});
test('standalone host protocol produces text without assistant/TTS/Codex messages',async()=>{
  const h=fixture();assert.equal(await h.host.handle({type:'dictationPrepare',id}),true);
  assert.ok(h.events.some(e=>e.type==='dictationReady'));
  await h.host.handle({type:'dictationChunk',id,index:0,audio:pcm()});
  await h.host.handle({type:'dictationFinish',id,count:1});
  assert.equal(h.events.at(-1).type,'dictationResult');assert.match(h.events.at(-1).text,/只是输入文字/);
  assert.ok(h.events.every(e=>e.type.startsWith('dictation')));assert.equal(h.host.active,false);
});
test('original voice/audio work is gated only while a dictation session owns the model',async()=>{
  const h=fixture();await h.host.handle({type:'dictationPrepare',id});
  assert.equal(await h.host.handle({type:'audio'}),true);
  for(const type of ['text','activate','previewVoice'])assert.equal(await h.host.handle({type}),true);
  assert.equal(h.events.filter(e=>e.type==='error').length,3);
  assert.equal(await h.host.handle({type:'historyPage'}),false);
  assert.equal(await h.host.handle({type:'dictationCancel',id}),true);
  assert.equal(await h.host.handle({type:'text'}),false);
});
test('original configuration, stop, clear and sleep can cancel dictation before normal handling',async()=>{
  for(const type of ['configure','cancel','sleep','clear','listen']){
    const h=fixture();await h.host.handle({type:'dictationPrepare',id});
    assert.equal(await h.host.handle({type}),false);assert.equal(h.host.active,false,type);
  }
});
test('preparing checks the original assistant busy, playback and ASR states',async()=>{
  for(const key of ['busy','asrBusy','playing']){
    const h=fixture();h.assistant[key]=true;await h.host.handle({type:'dictationPrepare',id});
    assert.equal(h.host.active,false);assert.equal(h.loads(),0);assert.equal(h.events.at(-1).type,'dictationError');
  }
});
test('disabled global dictation never loads ASR or registers a session',async()=>{
  const h=fixture(false);await h.host.handle({type:'dictationPrepare',id});assert.equal(h.loads(),0);assert.equal(h.host.active,false);
});
test('original text and audio claim ownership synchronously before a following prepare',async()=>{
  for(const type of ['text','audio']){
    const h=fixture();
    const decision=h.host.handle({type});
    assert.equal(decision,false,'original pass-through must not yield to the next stdin event');
    h.assistant[type==='text'?'busy':'asrBusy']=true; // original handler starts in the same call stack
    await h.host.handle({type:'dictationPrepare',id});
    assert.equal(h.host.active,false);assert.equal(h.loads(),0);
    assert.equal(h.events.at(-1).type,'dictationError');
  }
});
