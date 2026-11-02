import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {assistantDefaults} from '../src/assistant-core.mjs';

// Exercise the actual settings script with a minimal DOM, without WebKit,
// permissions, credentials, persisted preferences or external connections.
function settingsPage(){
  const listeners = new Map(), intervals = [], timeouts = [];
  const elements=new Map(), sent=[];
  function element(type=''){
    return {type,value:'',checked:false,hidden:true,children:[],dataset:{},style:{},
      classList:{toggle(){}},cloneNode(){return element();},setAttribute(){},getAttribute(){return null;},focus(){},remove(){},
      replaceChildren(...items){this.children=items;},append(...items){this.children.push(...items);},
      querySelector(){return element();},querySelectorAll(){return [];},addEventListener(){}};
  }
  const html=readFileSync(new URL('../client/hud/index.html',import.meta.url),'utf8');
  for(const tag of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) elements.set(tag[1],element(tag[0].match(/type="([^"]+)"/)?.[1]));
  const document={getElementById:id=>elements.get(id),createElement:()=>element(),createTextNode:text=>({textContent:text}),
    body:element(),querySelector:()=>null,querySelectorAll:()=>[],addEventListener(name,fn){const rows=listeners.get(name)||[];rows.push(fn);listeners.set(name,rows);},dispatchEvent(event){for(const fn of listeners.get(event.type)||[])fn(event);}};
  const window={webkit:{messageHandlers:{assistant:{postMessage:event=>sent.push(event)}}}};
  const context=vm.createContext({window,document,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},Event:class{},setTimeout:(fn,ms)=>{timeouts.push({fn,ms});return 1;},clearTimeout(){},setInterval:(fn,ms)=>{intervals.push({fn,ms});return 1;},Date});
  vm.runInContext(readFileSync(new URL('../client/hud/app.js',import.meta.url),'utf8'),
    context);
  vm.runInContext(readFileSync(new URL('../client/hud/moss.js',import.meta.url),'utf8'),context);
  window.receive({type:'configured',settings:{...assistantDefaults},hasGateway:false,hasDeepSeek:false,hasFish:false});
  return {elements,sent,receive:window.receive,navigate:window.mossNavigate,intervals,timeouts};
}

test('MOSS navigation keeps full chat and composer visible and validates page names',()=>{
 const p=settingsPage(),get=id=>p.elements.get(id);
 assert.equal(get('page-tasks').hidden,true);assert.equal(get('page-chat').hidden,false);assert.equal(get('composer-panel').hidden,false);assert.equal(get('history-panel').hidden,false);
 p.navigate('tasks');assert.equal(get('page-tasks').hidden,false);
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
 assert.equal(get('tasks-list').children.length,2);assert.equal(get('tasks-running').textContent,'1');assert.match(get('chat-task-status').textContent,/1.*运行/);
 get('chat-task-status').onclick();assert.equal(get('page-tasks').hidden,false);
 const card=get('tasks-list').children[0];assert.equal(card.children[1].textContent,tasks[0].title);assert.equal(card.children[1].innerHTML,undefined);
 card.children[2].children[1].onclick();
 assert.equal(p.sent.at(-1).action,'save');assert.equal(p.sent.at(-1).settings.target,'a');assert.equal(get('target-project').textContent,tasks[0].project);
 p.receive({type:'snapshot',snapshot:{remoteThreadId:'b'}});assert.equal(get('target-project').textContent,tasks[0].project);
 p.receive({type:'tasks',available:false,tasks,checkedAt:''});assert.equal(get('tasks-running').textContent,'0');assert.match(get('tasks-status').textContent,/不可用/);
 assert.equal(get('tasks-list').children[0].children[0].children[1].textContent,'未知');assert.match(get('chat-task-status').textContent,/未确认/);
 p.receive({type:'tasks',available:true,tasks:[{id:'unknown',status:'unknown'}],checkedAt:''});assert.match(get('chat-task-status').textContent,/未确认/);
});
test('no target remains explicit when latest reminder changes',()=>{
 const p=settingsPage();p.receive({type:'targets',targets:[{id:'latest',project:'Latest',title:'Changed'}],latestId:'latest'});
 assert.equal(p.elements.get('target-mode').textContent,'未选择目标');
 assert.equal(p.elements.get('target-project').textContent,'请选择目标聊天');
});

test('sending preserves the draft on error, prevents double submit and only clears accepted unchanged text',()=>{
 const p=settingsPage(),get=id=>p.elements.get(id);get('input').value='请解释这个问题';get('input').oninput();get('send').onclick();get('send').onclick();
 assert.equal(p.sent.filter(e=>e.action==='text').length,1);assert.equal(get('input').value,'请解释这个问题');
 p.receive({type:'error',message:'暂时不可用'});assert.equal(get('input').value,'请解释这个问题');assert.equal(get('send').disabled,false);
 get('send').onclick();p.receive({type:'message',role:'user',content:'请解释这个问题'});assert.equal(get('input').value,'');
 get('input').value='第一条';get('send').onclick();get('input').value='正在编辑下一条';p.receive({type:'message',role:'user',content:'第一条'});assert.equal(get('input').value,'正在编辑下一条');
});
test('Codex button states the action and missing target never loses a draft',()=>{
 const p=settingsPage(),get=id=>p.elements.get(id);get('mode-codex').onclick();get('input').value='修复表单';get('send').onclick();
 assert.equal(p.sent.filter(e=>e.action==='text').length,0);assert.equal(get('input').value,'修复表单');assert.match(get('toast').textContent,/选择/);assert.match(get('send').textContent,/Codex/);
});
test('task polling retains existing cards and filtering shows only matching project/status',()=>{
 const p=settingsPage(),get=id=>p.elements.get(id);const tasks=[{id:'a',title:'修复登录',project:'网站',status:'running'},{id:'b',title:'优化布局',project:'桌面',status:'completed'}];
 p.receive({type:'tasks',available:true,tasks,checkedAt:'2026-11-02T00:00:00Z'});const first=get('tasks-list').children[0];
 p.receive({type:'tasks',available:true,tasks,checkedAt:'2026-11-02T00:00:03Z'});assert.equal(get('tasks-list').children[0],first);
 get('task-search').value='网站';get('task-search').oninput();assert.equal(get('tasks-list').children.length,1);assert.equal(get('tasks-list').children[0].children[1].textContent,'修复登录');
 get('task-filter').value='completed';get('task-filter').onchange();assert.equal(get('tasks-list').children.length,0);assert.equal(get('tasks-empty').hidden,false);
});
test('history search is optional and closing a search returns to recent messages',()=>{
 const p=settingsPage(),get=id=>p.elements.get(id);assert.equal(get('history-search-row').hidden,true);get('history-search-toggle').onclick();assert.equal(get('history-search-row').hidden,false);
 get('history-search').value='表单';get('history-search-toggle').onclick();assert.equal(get('history-search-row').hidden,true);assert.equal(get('history-search').value,'');assert.equal(p.sent.at(-1).action,'historyPage');
 get('history-back-latest').onclick();assert.equal(p.sent.at(-1).action,'historyPage');
});

test('incoming assistant messages do not pull the reader away from older conversation',()=>{
 const p=settingsPage(),log=p.elements.get('messages');log.scrollHeight=2000;log.clientHeight=400;log.scrollTop=10;
 p.receive({type:'message',role:'assistant',content:'新回复'});assert.equal(log.scrollTop,10);
 log.scrollTop=1590;p.receive({type:'message',role:'assistant',content:'继续回复'});assert.equal(log.scrollTop,2000);
});

test('missing input acknowledgement keeps draft and never auto retries',()=>{
 const p=settingsPage(),get=id=>p.elements.get(id);get('input').value='待确认的草稿';get('send').onclick();
 p.timeouts.find(t=>t.ms===15000).fn();assert.equal(get('input').value,'待确认的草稿');assert.equal(get('send').disabled,false);assert.equal(p.sent.filter(e=>e.action==='text').length,1);assert.match(get('toast').textContent,/未自动重发/);
});
