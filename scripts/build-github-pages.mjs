import {cp, mkdir, readdir, readFile, rm, writeFile} from 'node:fs/promises';
import {resolve, join, relative} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..');
const output=join(root,'dist');
// One source normalizer serves both fixture tests and browser requests.
await cp(join(root,'site-worker/index.js'),join(root,'site/cnn-results.js'));
await rm(output,{recursive:true,force:true});
await mkdir(output,{recursive:true});
await cp(join(root,'site'),output,{recursive:true,filter:source=>!source.endsWith('.test.mjs')});
await writeFile(join(output,'.nojekyll'),'');
// Give every local module the same content-derived version. A changed child
// module must invalidate its unchanged parents in returning visitors' caches.
async function filesIn(directory){
  const entries=await readdir(directory,{withFileTypes:true});
  const groups=await Promise.all(entries.map(entry=>entry.isDirectory()?filesIn(join(directory,entry.name)):[join(directory,entry.name)]));
  return groups.flat().sort();
}
const files=await filesIn(output);
const hash=createHash('sha256');
for(const file of files){hash.update(relative(output,file)+'\0');hash.update(await readFile(file));hash.update('\0');}
const version=hash.digest('hex').slice(0,16);
for(const file of files){
  if(!/\.(?:js|html)$/.test(file))continue;
  const original=await readFile(file,'utf8');
  const versioned=original.replace(/(['"])(\.{1,2}\/[^'"\s?]+\.(?:js|css|json|svg))\1/g,(_,quote,path)=>`${quote}${path}?v=${version}${quote}`);
  await writeFile(file,versioned);
}
await writeFile(join(output,'release.json'),JSON.stringify({version})+'\n');
const html=await readFile(join(output,'index.html'),'utf8');
if(/(?:src|href)=["']\/(?!\/)/.test(html))throw new Error('GitHub Pages requires project-relative asset paths');
console.log('GitHub Pages static build: dist/ · '+version);
