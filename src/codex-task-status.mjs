import {DatabaseSync} from 'node:sqlite';
import {openSync,closeSync,readSync,statSync} from 'node:fs';
import {basename} from 'node:path';
import {execFileSync} from 'node:child_process';
import {redact} from './store.mjs';
const LIMIT=512*1024;
const INITIAL_LIMIT=32*1024*1024;
export function desktopSession(processes){
  const starts=[];
  for(const line of processes.split('\n')){
    const match=line.match(/^\s*(\w{3}\s+\w{3}\s+\d+\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+(.+)$/);
    if(!match)continue;
    const command=match[2].trim();
    if(!command.endsWith('/Codex.app/Contents/MacOS/Codex') && !command.endsWith('/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex'))continue;
    const time=Date.parse(match[1]);if(Number.isFinite(time))starts.push(time);
  }
  return {alive:starts.length>0,startedAt:starts.length?Math.min(...starts):Infinity};
}
function desktopAlive(){
  try{return desktopSession(execFileSync('/bin/ps',['-axo','lstart=,comm='],{encoding:'utf8',timeout:1500,maxBuffer:4*1024*1024,env:{...process.env,LC_ALL:'C'}}));}
  catch{return {alive:false};}
}
const states={task_started:'running',task_complete:'completed',turn_aborted:'cancelled',task_failed:'failed'};
// Read metadata and bounded event records only; no writes, transcript text in snapshots,
// remote notification enqueueing or assumptions based on a file merely changing.
export class CodexTaskStatus{
  constructor(database,{desktopAlive:alive=desktopAlive}={}){this.database=database;this.alive=alive;this.cache=new Map();this.minimumStart=0;}
  read(row){
    try{
      const stat=statSync(row.rollout_path);let state=this.cache.get(row.id);
      if(!state||state.path!==row.rollout_path||state.ino!==stat.ino||state.offset>stat.size)state={path:row.rollout_path,ino:stat.ino,offset:0,status:'unknown',updatedAt:null};
      if(stat.size>state.offset){
        const from=Math.max(state.offset,stat.size-(state.offset===0?INITIAL_LIMIT:LIMIT)),fd=openSync(row.rollout_path,'r');let data;
        try{const buffer=Buffer.alloc(stat.size-from);const count=readSync(fd,buffer,0,buffer.length,from);data=buffer.subarray(0,count);}finally{closeSync(fd);}
        let first=0;if(from>state.offset){state.status='unknown';state.updatedAt=null;first=data.indexOf(10)+1;}
        const end=data.lastIndexOf(10);
        if(end>=first){
          for(const line of data.subarray(first,end).toString('utf8').split('\n')){
            let record;try{record=JSON.parse(line);}catch{continue;}
            const status=record.type==='event_msg'&&states[record.payload?.type];
            if(!status||!Number.isFinite(Date.parse(record.timestamp)))continue;
            state.status=record.payload?.error?'failed':status;state.updatedAt=record.timestamp;
          }
          state.offset=from+end+1;
        }
      }
      this.cache.set(row.id,state);return state;
    }catch{this.cache.delete(row.id);return {status:'unknown',updatedAt:null};}
  }
  snapshot(){
    const checkedAt=new Date().toISOString();let db;
    try{
      db=new DatabaseSync(this.database,{readOnly:true});
      const rows=db.prepare('SELECT id,title,cwd,source,rollout_path FROM threads WHERE archived=0 ORDER BY updated_at DESC').all().filter(row=>!String(row.source).includes('subagent'));
      const session=this.alive();const online=typeof session==='boolean'?session:session.alive;
      if(!online)this.minimumStart=Date.now();
      const minimum=Math.max(this.minimumStart,typeof session==='object'?(session.startedAt??0):0);const keep=new Set(rows.map(r=>r.id));for(const id of this.cache.keys())if(!keep.has(id))this.cache.delete(id);
      const tasks=rows.map(row=>{const state=this.read(row);return {id:row.id,project:redact(basename(row.cwd||'')||'未命名项目'),title:redact(String(row.title||'未命名聊天')).slice(0,300),status:state.status==='running'&&(!online||Date.parse(state.updatedAt)<minimum)?'unknown':state.status,updatedAt:state.updatedAt};});
      return {type:'tasks',available:online,tasks,checkedAt,...(!online?{error:'Codex 未运行，进行中的状态无法确认'}:{})};
    }catch{return {type:'tasks',available:false,tasks:[],checkedAt,error:'无法读取 Codex 任务状态'};}
    finally{db?.close();}
  }
  close(){this.cache.clear();}
}
