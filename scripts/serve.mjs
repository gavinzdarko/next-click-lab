import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
const root=resolve('fixtures');
export const server=http.createServer(async(req,res)=>{
  const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/\/$/,'/index.html'));
  if(!path.startsWith(root+sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',extname(path)==='.html'?'text/html':'text/plain');res.end(await readFile(path));}catch{res.writeHead(404).end();}
});
server.listen(4173,'127.0.0.1',()=>console.log('Fixtures: http://127.0.0.1:4173'));
