import http from 'node:http';
import worker from '../dist/server/index.js';
const port=Number(process.env.PORT || 8768);
http.createServer(async(req,res)=>{
 try{
  const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>16384)throw new Error('Request too large');chunks.push(chunk);}
  const options={method:req.method,headers:req.headers};if(!['GET','HEAD'].includes(req.method))options.body=Buffer.concat(chunks);
  const request=new Request(new URL(req.url,'http://127.0.0.1:'+port),options);
  const response=await worker.fetch(request,{}, {waitUntil:promise=>promise.catch(()=>{})});
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(error){console.error(error.message);res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Results temporarily unavailable'}));}
}).listen(port,'127.0.0.1',()=>console.log('Results-only preview: http://127.0.0.1:'+port));
