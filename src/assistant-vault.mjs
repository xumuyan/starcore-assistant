import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync, renameSync, chmodSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

// Automatic unlock is deliberately scoped to this OS account. The local master
// key avoids recurring Keychain dialogs, but is not protection from this user.
export class LocalVault {
  constructor(root) {
    this.root = root; mkdirSync(root, { recursive: true, mode: 0o700 }); chmodSync(root, 0o700);
    const path = join(root, 'master.key');
    if (!existsSync(path)) {
      if (['credentials.bin', 'preferences.bin'].some(name => existsSync(join(root, name)))) throw new Error('本地解密密钥缺失，请恢复原 master.key；未覆盖加密数据');
      try { writeFileSync(path, randomBytes(32), { mode: 0o600, flag: 'wx' }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    }
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid()) throw new Error('本地密钥文件状态异常');
    chmodSync(path, 0o600); this.key = readFileSync(path);
    if (this.key.length !== 32) throw new Error('本地密钥格式无效');
  }
  seal(value, purpose) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(`jarvis/v1/${purpose}`));
    const content = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value));
    return Buffer.concat([Buffer.from('JRV1'), iv, cipher.update(content), cipher.final(), cipher.getAuthTag()]);
  }
  open(data, purpose) {
    data = Buffer.from(data);
    if (data.length < 32 || data.subarray(0, 4).toString() !== 'JRV1') throw new Error('加密数据格式无效');
    const decipher = createDecipheriv('aes-256-gcm', this.key, data.subarray(4, 16));
    decipher.setAAD(Buffer.from(`jarvis/v1/${purpose}`)); decipher.setAuthTag(data.subarray(-16));
    try { return Buffer.concat([decipher.update(data.subarray(16, -16)), decipher.final()]); }
    catch { throw new Error('加密数据校验失败；未覆盖原数据'); }
  }
  protectLegacyFile(path) {
    const stat = lstatSync(path); if (!stat.isFile() || stat.isSymbolicLink()) return;
    const original = readFileSync(path), sealed = this.seal(original, 'legacy');
    const temp = path + '.sealed.tmp', target = path + '.sealed';
    writeFileSync(temp, sealed, { mode: 0o600 });
    if (!this.open(readFileSync(temp), 'legacy').equals(original)) throw new Error('旧文件加密读回失败');
    renameSync(temp, target); chmodSync(target, 0o600); unlinkSync(path);
  }
  protectLegacy() {
    for (const name of ['history.json', 'settings.json']) {
      const path = join(this.root, name); if (existsSync(path)) this.protectLegacyFile(path);
    }
    const visit = path => {
      if (!existsSync(path) || !lstatSync(path).isDirectory() || lstatSync(path).isSymbolicLink()) return;
      chmodSync(path, 0o700);
      for (const entry of readdirSync(path, { withFileTypes: true })) {
        const file = join(path, entry.name);
        if (entry.isDirectory()) visit(file);
        else if (entry.isFile() && entry.name.endsWith('.json')) this.protectLegacyFile(file);
      }
    };
    visit(join(this.root, 'backups'));
  }
}
