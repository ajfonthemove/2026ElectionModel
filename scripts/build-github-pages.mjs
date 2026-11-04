import {cp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {resolve, join} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const output=join(root,'dist');
// One source normalizer serves both fixture tests and browser requests.
await cp(join(root,'site-worker/index.js'),join(root,'site/cnn-results.js'));
await rm(output,{recursive:true,force:true});
await mkdir(output,{recursive:true});
await cp(join(root,'site'),output,{recursive:true,filter:source=>!source.endsWith('.test.mjs')});
await writeFile(join(output,'.nojekyll'),'');
const html=await readFile(join(output,'index.html'),'utf8');
if(/(?:src|href)=["']\/(?!\/)/.test(html))throw new Error('GitHub Pages requires project-relative asset paths');
console.log('GitHub Pages static build: dist/');
