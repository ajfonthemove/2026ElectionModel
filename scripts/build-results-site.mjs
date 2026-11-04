import { readFile, readdir, mkdir, writeFile, stat } from 'node:fs/promises';
import { resolve, relative, join, extname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
const root = resolve(import.meta.dirname, '..');
const publicRoot = join(root, 'site');
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.txt':'text/plain; charset=utf-8','.md':'text/plain; charset=utf-8'};
const assets = {};
let uncompressedBytes = 0;
async function visit(directory) {
 for (const entry of await readdir(directory, {withFileTypes:true})) {
  const path = join(directory,entry.name);
  if(entry.isDirectory()){await visit(path);continue;}
  if(!entry.isFile()) throw new Error('Public assets must be regular files');
  const key = '/'+relative(publicRoot,path).split('\\').join('/');
  if(!mime[extname(path)] && !entry.name.includes('LICENSE')) throw new Error('Unexpected public asset type: '+key);
  const bytes=await readFile(path);
  uncompressedBytes += bytes.length;
  if(bytes.length>8*1024*1024)throw new Error('Asset exceeds bound');
  assets[key]={body:gzipSync(bytes,{level:9,mtime:0}).toString('base64'),mime:mime[extname(path)]||'text/plain; charset=utf-8',etag:'"'+createHash('sha256').update(bytes).digest('hex')+'"'};
 }
}
await visit(publicRoot);
if(!assets['/index.html'])throw new Error('Public results page is missing');
const manifest=JSON.parse(await readFile(join(root,'.openai/hosting.json'),'utf8'));
if(!manifest.project_id || manifest.static)throw new Error('Expected Worker hosting manifest');
let backend=await readFile(join(root,'site-worker/index.js'),'utf8');
if((backend.match(/export\s+default\s+/g)||[]).length!==1)throw new Error('Worker needs one default export');
backend=backend.replace(/export\s+default\s+/,'const RESULTS_WORKER = ');
const suffix=`\nconst EMBEDDED_ASSETS=${JSON.stringify(assets)};
const assetCache=new Map();
async function staticAsset(request){
 const path=new URL(request.url).pathname;const asset=EMBEDDED_ASSETS[path==='/'?'/index.html':path];
 if(!asset)return new Response('Not found',{status:404});
 const headers={'Content-Type':asset.mime,'ETag':asset.etag,'Cache-Control':path==='/'||path.endsWith('.html')?'no-cache':'public, max-age=300','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
 if(request.headers.get('If-None-Match')===asset.etag)return new Response(null,{status:304,headers});
 if(request.method==='HEAD')return new Response(null,{headers});
 let bytes=assetCache.get(path);if(!bytes){const compressed=Uint8Array.from(atob(asset.body),c=>c.charCodeAt(0));bytes=await new Response(new Response(compressed).body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();assetCache.set(path,bytes);}
 return new Response(bytes.slice(0),{headers});
}
export default {async fetch(request,env={},ctx){return RESULTS_WORKER.fetch(request,{...env,ASSETS:{fetch:staticAsset}},ctx);}};
`;
const output=join(root,'dist');await mkdir(join(output,'server'),{recursive:true});await mkdir(join(output,'.openai'),{recursive:true});
await writeFile(join(output,'server/index.js'),backend+suffix);
await writeFile(join(output,'.openai/hosting.json'),JSON.stringify(manifest,null,2)+'\n');
const size=(await stat(join(output,'server/index.js'))).size;
console.log(JSON.stringify({assets:Object.keys(assets).length,worker_bytes:size,static_uncompressed_bytes:uncompressedBytes,project_id:manifest.project_id}));
