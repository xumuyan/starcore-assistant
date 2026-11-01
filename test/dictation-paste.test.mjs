import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

test('native target policy and clipboard transactions preserve focus boundaries and concurrent copies', {skip:process.platform!=='darwin'},()=>{
  const root=fileURLToPath(new URL('../',import.meta.url)),dir=mkdtempSync(join(tmpdir(),'dictation-paste-test-'));
  try{
    const binary=join(dir,'check');
    const built=spawnSync('swiftc',['-swift-version','5','-framework','AppKit',join(root,'client/DictationPaste.swift'),join(root,'test/fixtures/dictation-paste.swift'),'-o',binary],{encoding:'utf8',timeout:120000});
    assert.equal(built.status,0,built.stderr);
    const checked=spawnSync(binary,[],{encoding:'utf8',timeout:10000});
    assert.equal(checked.status,0,checked.stderr);assert.match(checked.stdout,/DICTATION_PASTE_PASS/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
