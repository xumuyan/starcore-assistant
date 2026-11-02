import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

test('pet remains a lazy presentation of the shared bridge without permissions or persistence',()=>{
  const source=readFileSync(new URL('../client/MossPet.swift',import.meta.url),'utf8');
  assert.match(source,/nonactivatingPanel/);
  assert.match(source,/override var canBecomeKey: Bool \{ false \}/);
  assert.doesNotMatch(source,/URLSession|UserDefaults|AVAudio|AXUI|CGEvent|write\(to:/);
});

test('native pet model rejects historical completion and stays inert when disabled',{skip:process.platform!=='darwin'},()=>{
  const root=fileURLToPath(new URL('../',import.meta.url)),dir=mkdtempSync(join(tmpdir(),'moss-pet-test-'));
  try {
    const binary=join(dir,'check');
    const built=spawnSync('swiftc',['-swift-version','5','-framework','AppKit',join(root,'client/MossPet.swift'),join(root,'test/fixtures/moss-pet.swift'),'-o',binary],{encoding:'utf8',timeout:120000});
    assert.equal(built.status,0,built.stderr);
    const checked=spawnSync(binary,[],{encoding:'utf8',timeout:10000});
    assert.equal(checked.status,0,checked.stderr); assert.match(checked.stdout,/MOSS_PET_PASS/);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
