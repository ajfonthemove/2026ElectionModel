import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, cp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';

test('a changed source module invalidates the whole browser import graph', async()=>{
  const root=await mkdtemp(join(tmpdir(),'election-pages-build-'));
  try{
    await mkdir(join(root,'scripts'));await mkdir(join(root,'site'));await mkdir(join(root,'site-worker'));
    await cp(new URL('./build-github-pages.mjs',import.meta.url),join(root,'scripts/build-github-pages.mjs'));
    await writeFile(join(root,'site/index.html'),'<link href="./styles.css"><script type="module" src="./main.js"></script>');
    await writeFile(join(root,'site/main.js'),"import './results-client.js';");
    await writeFile(join(root,'site/results-client.js'),"import './cnn-results.js';");
    await writeFile(join(root,'site/styles.css'),'body{color:black}');
    await writeFile(join(root,'site/example.test.mjs'),'Must not ship');
    await writeFile(join(root,'site-worker/index.js'),'export const release=1;');
    const build=()=>execFileSync(process.execPath,['scripts/build-github-pages.mjs'],{cwd:root});
    build();const first=JSON.parse(await readFile(join(root,'dist/release.json'),'utf8')).version;
    const main=await readFile(join(root,'dist/main.js'),'utf8');
    assert.ok(main.includes(`./results-client.js?v=${first}`));
    assert.ok((await readFile(join(root,'dist/results-client.js'),'utf8')).includes(`./cnn-results.js?v=${first}`));
    assert.ok((await readFile(join(root,'dist/index.html'),'utf8')).includes(`./styles.css?v=${first}`));
    await assert.rejects(readFile(join(root,'dist/example.test.mjs')), {code:'ENOENT'});
    build();assert.equal(JSON.parse(await readFile(join(root,'dist/release.json'),'utf8')).version,first);
    await writeFile(join(root,'site-worker/index.js'),'export const release=2;');build();
    const next=JSON.parse(await readFile(join(root,'dist/release.json'),'utf8')).version;
    assert.notEqual(next,first);
    assert.ok((await readFile(join(root,'dist/main.js'),'utf8')).includes(`./results-client.js?v=${next}`));
    assert.ok((await readFile(join(root,'dist/results-client.js'),'utf8')).includes(`./cnn-results.js?v=${next}`));
  }finally{await rm(root,{recursive:true,force:true});}
});
