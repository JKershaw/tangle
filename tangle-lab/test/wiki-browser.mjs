import assert from 'node:assert/strict';
import {launchBrowser,artifactURL,outputPath} from './browser-support.mjs';
const browser=await launchBrowser();
try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  page.on('dialog',d=>d.accept());
  await page.goto(artifactURL);
  await page.click('#liveMode');
  const requests=[];page.on('request',r=>{if(r.url().startsWith('https:'))requests.push(r.url());});
  await page.click('#testWiki');
  await page.waitForFunction(()=>/Success:|Failed:/.test(document.getElementById('wikiTestStatus').textContent),{},{timeout:50000});
  console.log('LIVE:',await page.locator('#wikiTestStatus').textContent());
  console.log('Requests:',requests.length);
  assert.ok(requests.every(u=>new URL(u).hostname==='en.wikipedia.org'));
  assert.equal(await page.locator('.graph-node').count(),1);
  // Repeat with controlled responses to verify the integrated tool independent of network availability.
  await page.route('https://en.wikipedia.org/**',route=>route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:route.request().url().includes('/w/api.php')?JSON.stringify({query:{search:[{title:'Water cycle',snippet:'A cycle.'}]}}):JSON.stringify({extract:'A test article summary.',revision:'123456789'})}));
  await page.click('#testWiki');
  await page.waitForFunction(()=>document.getElementById('wikiTestStatus').textContent.startsWith('Success:'),{},{timeout:10000});
  assert.match(await page.locator('#wikiTestStatus').textContent(),/article summary/);
  console.log('PASS: Wikipedia tool wired from file://; restricted requests, summary parsing, no graph contamination.');
  await page.screenshot({path:outputPath('tangle-live-settings.png'),fullPage:true});
}finally{await browser.close();}
