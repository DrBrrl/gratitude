import {createServer} from 'node:http';
import {test,expect as baseExpect} from '@playwright/test';
import {TestStepHelper} from '../helpers/test-step-helper';
import {startJournal} from '../helpers/journal-session';
import {aiSettings} from '../helpers/gemini';
const expect=baseExpect.configure({timeout:15000});
const SERVER='http://127.0.0.1:19234',MODEL='fictional-local:8b';

test('Ollama origin rejection explains the server fix and recovers without inference',async({page},info)=>{
 test.skip(process.env.E2E_FIREBASE!=='true','Requires Firebase emulators');test.setTimeout(300000);
 let mode:'blocked'|'readable'|'allowed'='blocked',generation=0;
 const requests:{path:string;method:string;origin:string|undefined;authorization:string|undefined;contentType:string|undefined}[]=[];
 // A real second HTTP origin exercises browser CORS, including a hidden 403.
 const server=createServer((req,res)=>{
  const path=req.url??'';requests.push({path,method:req.method??'',origin:req.headers.origin,authorization:req.headers.authorization,contentType:req.headers['content-type']});
  if(mode==='blocked'){res.writeHead(403,{'Content-Type':'text/plain'});res.end('Private origin rejection diagnostics');return;}
  res.setHeader('Access-Control-Allow-Origin',req.headers.origin??'http://127.0.0.1:4173');
  res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','content-type,authorization');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
  if(mode==='readable'){res.writeHead(403,{'Content-Type':'text/plain'});res.end('Private access rejection diagnostics');return;}
  res.setHeader('Content-Type','application/json');
  if(path==='/api/tags'){res.end(JSON.stringify({models:[{name:MODEL}]}));return;}
  if(path==='/api/ps'){res.end(JSON.stringify({models:[{name:MODEL,context_length:32768}]}));return;}
  if(path==='/api/show'){req.resume();res.end(JSON.stringify({capabilities:['completion']}));return;}
  if(path==='/api/chat')generation++;
  res.writeHead(404);res.end('{}');
 });
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(19234,'127.0.0.1',resolve);});
 try {
  const steps=new TestStepHelper(page,info,{paintStaticPage:true});
  await startJournal(page,info,steps,'ollama-access');await aiSettings(page,steps,'connections');
  await steps.action('provider','Choose a native Ollama connection',()=>page.getByLabel('AI provider',{exact:true}).selectOption('ollama'),async()=>{await expect(page.getByLabel('Proxy authentication token (optional)')).toHaveValue('');});
  await steps.action('server','Use the fictional local server',()=>page.getByLabel('Server address',{exact:true}).fill(SERVER),async()=>{await expect(page.getByLabel('Server address',{exact:true})).toHaveValue(SERVER);});
  const help=page.getByRole('region',{name:'Ollama connection help',exact:true});
  await steps.action('blocked-origin','Explain a browser-hidden 403 without claiming a token failure',()=>page.getByRole('button',{name:'Test connection',exact:true}).click(),async()=>{
   await expect(page.getByRole('alert')).toContainText('Could not reach Ollama from this browser.');await expect(help).toBeVisible();
   await expect(help.locator('pre')).toHaveText(`OLLAMA_ORIGINS='${new URL(page.url()).origin}' ollama serve`);
   await expect(help).toContainText('Ctrl+C');await expect(help).toContainText('fully quit and restart');
   await expect(page.getByRole('alert')).not.toContainText('HTTP 403');await expect(page.getByText(/Private origin rejection/)).toHaveCount(0);
   await expect(page.getByRole('button',{name:'Save model settings',exact:true})).toBeDisabled();expect(requests.at(-1)?.path).toBe('/api/tags');expect(requests.at(-1)?.method).toBe('GET');expect(generation).toBe(0);
  });
  await steps.action('visible-forbidden','Keep a readable 403 distinct from incorrect credentials',async()=>{mode='readable';await page.getByRole('button',{name:'Test connection',exact:true}).click();},async()=>{await expect(page.getByRole('alert')).toContainText('Ollama refused access (HTTP 403).');await expect(help).toBeVisible();await expect(page.getByText(/Private access rejection/)).toHaveCount(0);expect(generation).toBe(0);});
  await steps.action('retry-after-server-fix','Retry after the server allows this app’s origin',async()=>{mode='allowed';await page.getByRole('button',{name:'Test connection',exact:true}).click();},async()=>{await expect(page.getByRole('combobox',{name:'Model API identifier',exact:true})).toBeVisible();await expect(help).toHaveCount(0);await expect(page.getByRole('alert')).toContainText('The selected model is not available in Ollama.');expect(requests.some(req=>req.path==='/api/show'&&req.method==='POST'&&req.contentType==='application/json')).toBe(true);expect(generation).toBe(0);});
  await steps.action('select-model','Choose the discovered local model after access is fixed',()=>page.getByLabel('Model API identifier',{exact:true}).selectOption(MODEL),async()=>{await expect(page.getByRole('status')).toContainText('Connected to Ollama.');await expect(page.getByRole('alert')).toHaveCount(0);await expect(page.getByRole('button',{name:'Save model settings',exact:true})).toBeEnabled();expect(generation).toBe(0);});
  expect(requests.every(req=>!req.authorization)).toBe(true);expect(requests.every(req=>req.origin===new URL(page.url()).origin)).toBe(true);expect(requests.filter(req=>req.method==='GET').every(req=>!req.contentType)).toBe(true);
  steps.generateDocs('Repair Ollama browser-origin access','A real loopback HTTP server rejects the app’s origin, first without CORS response headers and then with a readable 403. The app explains the exact origin and terminal restart command, preserves access controls and recovers through explicit Test connection after the server is fixed. Metadata GET requests omit a JSON Content-Type header, while POST metadata retains application/json. No inference or journal transmission occurs. Every user action has an unmasked zero-pixel screenshot with checks beneath the image.');
 }finally{server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});
