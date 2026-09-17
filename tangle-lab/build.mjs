import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const cwd=path.dirname(fileURLToPath(import.meta.url));
const out=path.resolve(cwd,'../tangle-pocket-lab.html');
const result=await build({entryPoints:[path.join(cwd,'src/main.js')],bundle:true,write:false,format:'iife',platform:'browser',target:'es2022',minify:true,legalComments:'inline',
  alias:{'@mlc-ai/web-llm':path.join(cwd,'node_modules/@mlc-ai/web-llm/lib/index.js')},logLevel:'warning'});
const css=await readFile(path.join(cwd,'src/styles.css'),'utf8');
let html=await readFile(path.join(cwd,'template.html'),'utf8');
const code=result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script');
const notices=[];
for(const [name,file] of [['Browser-agent — John Kershaw','../browser-agent-reference/LICENSE'],['WebLLM — Apache 2.0','node_modules/@mlc-ai/web-llm/LICENSE'],['loglevel','node_modules/loglevel/LICENSE-MIT']]){
  notices.push(name+'\n'+await readFile(path.join(cwd,file),'utf8'));
}
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
html=html.replace('/* APP_STYLE */',()=>css).replace('/* APP_CODE */',()=>code).replace('THIRD_PARTY_NOTICES',()=>escape(notices.join('\n\n')));
await writeFile(out,html);
console.log(out+' · '+(Buffer.byteLength(html)/1024/1024).toFixed(2)+' MiB');
