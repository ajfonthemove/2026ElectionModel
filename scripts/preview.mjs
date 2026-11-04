import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';

const root=resolve(import.meta.dirname,'../dist');
const base='/2026ElectionModel/';
const port=Number(process.env.PORT || 8769);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
http.createServer(async(req,res)=>{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  try{
    const url=new URL(req.url,'http://127.0.0.1');
    if(url.pathname==='/' || url.pathname===base.slice(0,-1)){res.writeHead(302,{Location:base});res.end();return;}
    if(!url.pathname.startsWith(base))throw new Error('Not found');
    const name=decodeURIComponent(url.pathname.slice(base.length)) || 'index.html';
    const path=resolve(root,name);
    if(!path.startsWith(root+sep))throw new Error('Not found');
    const body=await readFile(path);
    res.writeHead(200,{'Content-Type':types[extname(path)] || 'application/octet-stream','X-Content-Type-Options':'nosniff'});
    res.end(req.method==='HEAD'?undefined:body);
  }catch{res.writeHead(404);res.end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log('GitHub Pages preview: http://127.0.0.1:'+port+base));
