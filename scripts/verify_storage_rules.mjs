/** Compile/evaluate proposed Storage Rules with synthetic contexts; never deploy. */
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {storageRuleCases} from '../tests/fixtures/storage-rule-cases.mjs';
const target=process.argv[2];
if(!['preview','production'].includes(target))throw Error('Usage: nix develop -c node scripts/verify_storage_rules.mjs preview|production');
const config=JSON.parse(await readFile(`config/firebase-${target}.json`,'utf8'));
const require=createRequire(import.meta.url),auth=require('firebase-tools/lib/auth');
const account=auth.getGlobalDefaultAccount();
if(!account)throw Error('Firebase administrative login is missing. Run firebase login first.');
const token=await auth.getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform']);
const source=await readFile('storage.rules','utf8'),cases=storageRuleCases(`${config.projectId}.firebasestorage.app`);
const response=await fetch(`https://firebaserules.googleapis.com/v1/projects/${config.projectId}:test`,{
 method:'POST',headers:{Authorization:`Bearer ${token.access_token}`,'Content-Type':'application/json'},
 body:JSON.stringify({source:{files:[{name:'storage.rules',content:source}]},testSuite:{testCases:cases.map(({label,...test})=>test)}})});
const result=await response.json();
if(!response.ok)throw Error(`Rules evaluation failed (HTTP ${response.status}).`);
if(result.issues?.some(issue=>issue.severity==='ERROR'))throw Error('Storage Rules failed compilation.');
const failed=cases.flatMap((test,index)=>result.testResults?.[index]?.state==='SUCCESS'?[]:[test.label]);
if(failed.length)throw Error(`Storage Rules regression checks failed: ${failed.join(', ')}`);
console.log(`${target}: ${cases.length} hosted allow/deny checks passed; SHA-256 ${createHash('sha256').update(source).digest('hex')}. No rules deployed or files uploaded.`);
