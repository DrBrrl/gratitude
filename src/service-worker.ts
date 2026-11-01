/// <reference lib="webworker" />
import {build,files,prerendered,version} from '$service-worker';
import {isAppWindow} from './lib/push/protocol';
const worker=self as unknown as ServiceWorkerGlobalScope;
// Scope-specific names isolate production and every PR preview on the same origin.
const prefix=`gratitude-shell:${worker.registration.scope}:`;
const cacheName=prefix+version;
const urls=[...new Set([...build,...files,...prerendered])].map(path=>new URL(path,worker.location.origin).href);
const assets=new Set(urls);
const immutablePath=new URL('_app/immutable/',worker.registration.scope).pathname;
worker.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(cacheName);await cache.addAll(urls.map(url=>new Request(url,{cache:'reload'})));
  // Existing tabs keep their worker until closed. No forced refresh can interrupt a draft.
})()));
worker.addEventListener('activate',event=>event.waitUntil((async()=>{
  // Explicit notification opt-in can activate an update while an old tab has a draft.
  // Keep its public immutable modules available until an activation with no open app tabs.
  const windows=await worker.clients.matchAll({type:'window',includeUncontrolled:true});
  if(!windows.some(client=>isAppWindow(client.url,worker.registration.scope)))for(const key of await caches.keys())if(key.startsWith(prefix)&&key!==cacheName)await caches.delete(key);
  await worker.clients.claim();
})()));
worker.addEventListener('fetch',event=>{
  const request=event.request;if(request.method!=='GET')return;
  const url=new URL(request.url);if(url.origin!==worker.location.origin||!url.href.startsWith(worker.registration.scope))return;
  // Cache public app pages and immutable build assets, including those from an
  // online update while its new worker is waiting. Never cache account/API data.
  const key=request.mode==='navigate'?url.origin+url.pathname:url.href;
  if(!assets.has(key)&&!url.pathname.startsWith(immutablePath))return;
  event.respondWith((async()=>{
    const cache=await caches.open(cacheName);
    if(request.mode==='navigate'){
      try {const response=await fetch(request);if(response.ok){await cache.put(key,response.clone());return response;}}catch{/* Use the installed shell offline. */}
    }
    const cached=await cache.match(key);if(cached)return cached;
    if(url.pathname.startsWith(immutablePath))for(const name of await caches.keys())if(name.startsWith(prefix)&&name!==cacheName){const previous=await (await caches.open(name)).match(key);if(previous)return previous;}
    const response=await fetch(request);if(response.ok)await cache.put(key,response.clone());return response;
  })());
});

// Web Push is independent of open tabs and uses the same deployment-scoped worker.
import {receiveHugPush,openHugNotification} from './lib/push/worker';
worker.addEventListener('push',event=>{let value:unknown;try{value=event.data?.json();}catch{return;}event.waitUntil(receiveHugPush(worker.registration,value));});
worker.addEventListener('notificationclick',event=>event.waitUntil(openHugNotification(worker,event.notification)));

worker.addEventListener('message',event=>{
  if(event.data?.type==='ACTIVATE_HUG_WORKER')event.waitUntil(worker.skipWaiting());
  if(event.data?.type==='HUG_PUSH_CAPABILITIES')event.ports[0]?.postMessage({supported:true});
});
