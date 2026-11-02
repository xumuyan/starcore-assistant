import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {assistantDefaults} from '../src/assistant-core.mjs';

// Exercise the actual settings script with a minimal DOM, without WebKit,
// permissions, credentials, persisted preferences or external connections.
function settingsPage(){
  const elements=new Map(), sent=[];
  function element(type=''){
    return {type,value:'',checked:false,hidden:true,children:[],dataset:{},style:{},
      classList:{toggle(){}},cloneNode(){return element();},setAttribute(){},getAttribute(){return null;},focus(){},
      replaceChildren(...items){this.children=items;},append(...items){this.children.push(...items);},
      querySelector(){return element();},querySelectorAll(){return [];},addEventListener(){}};
  }
  const html=readFileSync(new URL('../client/hud/index.html',import.meta.url),'utf8');
  for(const tag of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) elements.set(tag[1],element(tag[0].match(/type="([^"]+)"/)?.[1]));
  const document={getElementById:id=>elements.get(id),createElement:()=>element(),createTextNode:text=>({textContent:text}),
    body:element(),querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},dispatchEvent(){}};
  const window={webkit:{messageHandlers:{assistant:{postMessage:event=>sent.push(event)}}}};
  vm.runInNewContext(readFileSync(new URL('../client/hud/app.js',import.meta.url),'utf8'),
    {window,document,CustomEvent:class{},Event:class{},setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,Date});
  window.receive({type:'configured',settings:{...assistantDefaults},hasGateway:false,hasDeepSeek:false,hasFish:false});
  return {elements,sent,receive:window.receive};
}

test('dictation settings retain old values and save independent opt-in fields',()=>{
  const p=settingsPage(), get=id=>p.elements.get(id);
  assert.equal(get('set-dictationEnabled').checked,false);
  assert.equal(get('set-dictationPolish').checked,false);
  assert.equal(get('set-dictationHotkey').value,'right-option');
  get('set-dictationEnabled').checked=true;get('set-dictationHotkey').value='right-control';
  get('settings-form').onsubmit({preventDefault(){}});
  const saved=p.sent.at(-1);
  assert.equal(saved.action,'save');assert.equal(saved.settings.dictationEnabled,true);
  assert.equal(saved.settings.dictationHotkey,'right-control');assert.equal(saved.settings.dictationPolish,false);
  for(const key of ['name','wakeWord','autoListen','polishEnabled','target','voice']) assert.equal(saved.settings[key],assistantDefaults[key]);
});

test('permission buttons request only their explicit scope and render status as text',()=>{
  const p=settingsPage();
  for(const kind of ['input','accessibility','microphone']){
    p.elements.get('dictation-'+kind).onclick();
    assert.equal(p.sent.at(-1).action,'dictationPermission');assert.equal(p.sent.at(-1).kind,kind);
  }
  p.elements.get('dictation-refresh').onclick();assert.equal(p.sent.at(-1).action,'dictationRefresh');
  p.receive({type:'dictationStatus',enabled:true,monitoring:false,inputMonitoring:false,accessibility:true,microphone:true,detail:'<b>tap failed</b>'});
  const status=p.elements.get('dictation-status');
  assert.match(status.textContent,/尚未就绪/);assert.match(status.textContent,/输入监控待授权/);
  assert.match(status.textContent,/<b>tap failed<\/b>/);assert.equal(status.innerHTML,undefined);
});


test('permissions have vertical individual red/green states and recover when access changes',()=>{
  const p=settingsPage(), get=id=>p.elements.get(id);
  for(const granted of [false,true,false]){
    p.receive({type:'dictationStatus',enabled:false,inputMonitoring:granted,accessibility:granted,microphone:granted});
    for(const kind of ['input','accessibility','microphone']){
      assert.equal(get('permission-'+kind+'-row').dataset.state,granted?'granted':'missing');
      assert.equal(get('permission-'+kind+'-status').textContent,granted?'✓ 已允许':'！未允许');
    }
    assert.equal(get('dictation-input-help').hidden,granted);
  }
  get('dictation-preview').onclick();assert.equal(p.sent.at(-1).action,'dictationShowPanel');
  get('dictation-reveal').onclick();assert.equal(p.sent.at(-1).action,'dictationRevealApp');
  assert.equal(p.sent.filter(e=>e.action==='save').length,0,'preview never enables input');
  const css=readFileSync(new URL('../client/hud/panels.css',import.meta.url),'utf8');
  assert.match(css,/#dictation-settings \.dictation-permissions\{[^}]*flex-direction:column/);
  assert.match(css,/data-state="granted"[^}]*color:#147345/);
  assert.match(css,/\.dictation-permission span\{[^}]*color:#b32e40/);
});
