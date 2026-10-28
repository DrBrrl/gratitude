/// <reference lib="webworker" />
import {build,files,prerendered,version} from '$service-worker';
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
  for(const key of await caches.keys())if(key.startsWith(prefix)&&key!==cacheName)await caches.delete(key);
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
    const response=await fetch(request);if(response.ok)await cache.put(key,response.clone());return response;
  })());
});
