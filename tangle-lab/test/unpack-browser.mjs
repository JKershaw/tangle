import {createReadStream,createWriteStream} from 'node:fs';
import {mkdtemp,chmod} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import {createBrotliDecompress} from 'node:zlib';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=await mkdtemp(join(tmpdir(),'tangle-browser-runtime-'));
const base='node_modules/@sparticuz/chromium/bin/';
await pipeline(createReadStream(base+'chromium.br'),createBrotliDecompress(),createWriteStream(dir+'/chromium'));
await chmod(dir+'/chromium',0o755);
for(const name of ['fonts','swiftshader']){
  const tar=spawn('tar',['--no-same-owner','-xf','-','-C',dir],{stdio:['pipe','inherit','inherit']});
  const done=new Promise((resolve,reject)=>tar.on('exit',code=>code===0?resolve():reject(new Error('tar exit '+code))));
  await pipeline(createReadStream(base+name+'.tar.br'),createBrotliDecompress(),tar.stdin);await done;
}
console.log(dir+'/chromium');
