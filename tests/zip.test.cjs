const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../zip.js'), 'utf8');
const ctx = {TextEncoder, Blob, Uint8Array, Uint32Array, Date};
ctx.globalThis = ctx;
vm.runInNewContext(source, ctx);

async function main(){
  const archive = ctx.GNSZip.makeZip([
    {name:'hello.txt', data:'Hello world'},
    {name:'resume.md', data:'# Title\n\nBody content\n'}
  ], new Date(2026, 9, 7, 12, 20, 0));
  assert.equal(archive.type, 'application/zip');
  assert.ok(archive.size > 100);
  
  const samplePath = path.join(__dirname, 'sample.zip');
  fs.writeFileSync(samplePath, Buffer.from(await archive.arrayBuffer()));
  assert.ok(fs.existsSync(samplePath));
  fs.unlinkSync(samplePath);
  console.log('ZIP builder test: PASS');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
