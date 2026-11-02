import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {assistantDefaults} from '../src/assistant-core.mjs';

// Exercise the actual settings script with a minimal DOM, without WebKit,
// permissions, credentials, persisted preferences or external connections.
function settingsPage(){
  const listeners = new Map(), intervals = [];
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
    body:element(),querySelector:()=>null,querySelectorAll:()=>[],addEventListener(name,fn){const rows=listeners.get(name)||[];rows.push(fn);listeners.set(name,rows);},dispatchEvent(event){for(const fn of listeners.get(event.type)||[])fn(event);}};
  const window={webkit:{messageHandlers:{assistant:{postMessage:event=>sent.push(event)}}}};
  const context=vm.createContext({window,document,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},Event:class{},setTimeout:()=>1,clearTimeout(){},setInterval:(fn,ms)=>{intervals.push({fn,ms});return 1;},Date});
  vm.runInContext(readFileSync(new URL('../client/hud/app.js',import.meta.url),'utf8'),
    context);
  vm.runInContext(readFileSync(new URL('../client/hud/moss.js',import.meta.url),'utf8'),context);
  window.receive({type:'configured',settings:{...assistantDefaults},hasGateway:false,hasDeepSeek:false,hasFish:false});
  return {elements,sent,receive:window.receive,navigate:window.mossNavigate,intervals};
}

test('MOSS navigation keeps full chat and composer visible and validates page names',()=>{
 const p=settingsPage(),get=id=>p.elements.get(id);
 assert.equal(get('page-tasks').hidden,false);assert.equal(get('page-chat').hidden,true);
 p.navigate('chat');assert.equal(get('page-chat').hidden,false);assert.equal(get('composer-panel').hidden,false);assert.equal(get('history-panel').hidden,false);
 p.navigate('settings');assert.equal(get('settings-overlay').hidden,false);assert.equal(get('page-chat').hidden,true);
 p.receive({type:'navigate',page:'chat'});assert.equal(get('page-chat').hidden,false);
 p.navigate('__proto__');assert.equal(get('page-chat').hidden,false);
 assert.ok(p.intervals.some(i=>i.ms===3000));
});
test('tasks render plaintext and pin explicit target across later snapshots',()=>{
 const p=settingsPage(),get=id=>p.elements.get(id);
 const tasks=[{id:'a',project:'<img src=x>',title:'<script>bad()</script>',status:'running',updatedAt:'2026-11-02T00:00:00Z'},{id:'b',project:'Other',title:'Done',status:'completed',updatedAt:''}];
 p.receive({type:'tasks',available:true,tasks,checkedAt:'2026-11-02T00:00:00Z'});
 assert.equal(get('tasks-list').children.length,2);assert.equal(get('tasks-running').textContent,'1');
 const card=get('tasks-list').children[0];assert.equal(card.children[1].textContent,tasks[0].title);assert.equal(card.children[1].innerHTML,undefined);
 card.children[2].children[1].onclick();
 assert.equal(p.sent.at(-1).action,'save');assert.equal(p.sent.at(-1).settings.target,'a');assert.equal(get('target-project').textContent,tasks[0].project);
 p.receive({type:'snapshot',snapshot:{remoteThreadId:'b'}});assert.equal(get('target-project').textContent,tasks[0].project);
 p.receive({type:'tasks',available:false,tasks,checkedAt:''});assert.equal(get('tasks-running').textContent,'0');assert.match(get('tasks-status').textContent,/不可用/);
 assert.equal(get('tasks-list').children[0].children[0].children[1].textContent,'未知');
});
test('no target remains explicit when latest reminder changes',()=>{
 const p=settingsPage();p.receive({type:'targets',targets:[{id:'latest',project:'Latest',title:'Changed'}],latestId:'latest'});
 assert.equal(p.elements.get('target-mode').textContent,'未选择目标');
 assert.equal(p.elements.get('target-project').textContent,'请选择目标聊天');
});
