import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=name=>readFileSync(resolve(root,name),'utf8');
const files=['README.md','AGENTS.md','operatelog.md','PLAN.md','docs/superpowers/specs/2026-11-01-global-dictation-design.md','docs/verification/2026-11-01-dictation-integration.md','docs/superpowers/specs/2026-11-02-moss-design.md','docs/verification/2026-11-02-moss.md','docs/troubleshooting/macos-permissions.md','design-qa.md'];

test('root project rules keep all five traceability requirements and existing behavior',()=>{
  const rules=read('AGENTS.md');
  assert.equal((rules.match(/^[1-5]\. /gm)||[]).length,5);
  for(const requirement of [/保留原有功能行为/,/Git commit/,/编写或更新相关测试/,/operatelog\.md/,/PLAN\.md/,/git push/,/Asia\/Shanghai/,/禁止记录密码、令牌和原始抓包载荷/])assert.match(rules,requirement);
});

test('every completed plan checkbox names evidence and unresolved scope stays explicit',()=>{
  const plan=read('PLAN.md');
  assert.match(plan,/解除条件/);
  assert.match(plan,/未勾选项均未验收完成/);
  const tasks=plan.split('\n').filter(line=>/^- \[[ x]\]/.test(line));
  assert.ok(tasks.length>=30,'keep implementation and acceptance steps actionable');
  for(const line of tasks.filter(line=>line.startsWith('- [x]')))assert.match(line,/证据：\s*\S.{5,}/,'completed steps require nonempty evidence, not a placeholder label');
});

test('each operation entry records time, changes, difficulties, resolution, verification and commit',()=>{
  const entries=read('operatelog.md').split(/^## /m).slice(1).filter(entry=>/^SC-\d{8}-(?:H)?\d{3}\b/.test(entry));
  assert.ok(entries.length>=3);
  const ids=entries.map(entry=>entry.match(/^SC-\d{8}-(?:H)?\d{3}/)[0]);
  assert.equal(ids.length,new Set(ids).size);
  for(const entry of entries){
    for(const field of ['北京时间','修改或新增','遇到的难题','处理方式','验证结果','遗留问题','对应 Git 提交'])assert.ok(entry.includes('- '+field+'：'),`${ids[entries.indexOf(entry)]}: missing ${field}`);
    assert.match(entry,/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \+08:00/);
  }
});

test('project governance links resolve without exposing private paths or credential values',()=>{
  for(const file of files){
    const content=read(file);assert.ok(content.trim().length>100);
    assert.doesNotMatch(content,/\/Users\/|\/var\/folders\/|\b(?:ghp_|gho_|github_pat_|sk-)[A-Za-z0-9_-]{16,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/);
    for(const match of content.matchAll(/\]\(([^)]+)\)/g)){
      const target=match[1];if(/^(https?:|#)/.test(target))continue;
      assert.ok(existsSync(resolve(dirname(resolve(root,file)),target.split('#')[0])),`${file}: broken link ${target}`);
    }
  }
});


test('package and native version metadata agree with the current changelog',()=>{
  const pkg=JSON.parse(read('package.json')),lock=JSON.parse(read('package-lock.json'));
  assert.equal(lock.version,pkg.version);assert.equal(lock.packages[''].version,pkg.version);
  const build=read('client/build.py');
  assert.equal(build.match(/'CFBundleShortVersionString': '([^']+)'/)[1],pkg.version);
  const buildNumber=build.match(/'CFBundleVersion': '(\d+)'/)[1];
  assert.ok(read('CHANGELOG.md').includes('## '+pkg.version+' —'));
  assert.ok(read('CHANGELOG.md').includes('build '+buildNumber));
});
