import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {mkdir} from 'node:fs/promises';
const require=createRequire(import.meta.url);
let playwright;
try { playwright=require('playwright'); }
catch {
  if(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES)playwright=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
  else throw new Error('Install browser-test dependencies: npm install --no-save playwright@1.62.1, then npx playwright install chromium.');
}
export const artifactURL=new URL('../../tangle-pocket-lab.html',import.meta.url).href;
const previewDirectory=new URL('../../previews/',import.meta.url);
await mkdir(previewDirectory,{recursive:true});
export const outputPath=name=>fileURLToPath(new URL(name,previewDirectory));
export function launchBrowser(){
  const options={headless:true};
  if(process.env.TANGLE_BROWSER_EXECUTABLE)options.executablePath=process.env.TANGLE_BROWSER_EXECUTABLE;
  if(process.env.TANGLE_BROWSER_PROXY)options.proxy={server:process.env.TANGLE_BROWSER_PROXY};
  return playwright.chromium.launch(options);
}
