import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

test('native dictation controller coordinates independent input without changing prior wake state', {skip:process.platform!=='darwin'},()=>{
  const root=fileURLToPath(new URL('../',import.meta.url)),dir=mkdtempSync(join(tmpdir(),'dictation-controller-test-'));
  try{
    const binary=join(dir,'check');
    const sources=['DictationAudio','DictationRecorder','DictationHotkey','DictationPaste','DictationPanel','DictationController'].map(n=>join(root,`client/${n}.swift`));
    const built=spawnSync('swiftc',['-swift-version','5','-framework','AppKit','-framework','AVFoundation',...sources,join(root,'test/fixtures/dictation-controller.swift'),'-o',binary],{encoding:'utf8',timeout:120000});
    assert.equal(built.status,0,built.stderr);
    const checked=spawnSync(binary,[],{encoding:'utf8',timeout:10000});
    assert.equal(checked.status,0,checked.stderr);assert.match(checked.stdout,/DICTATION_CONTROLLER_PASS/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
