import test from 'node:test';
import assert from 'node:assert/strict';
import {NextRequest} from 'next/server.js';
import {loadModule} from './helpers/module.mjs';

test('support stays publicly reachable while private studio entry still requires sign-in',async()=>{
  let authCalls=0;
  const previous={url:process.env.NEXT_PUBLIC_SUPABASE_URL,key:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY};
  process.env.NEXT_PUBLIC_SUPABASE_URL='https://isolated.supabase.co';process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='public-fixture';
  globalThis.supportAccessClient=()=>{authCalls++;return{auth:{getUser:async()=>({data:{user:null}})}};};
  try{
    const {updateSession}=await loadModule('../../src/lib/supabase/middleware.ts',{'@supabase/ssr':`export const createServerClient=(...args)=>globalThis.supportAccessClient(...args);`});
    for(const path of ['/support','/privacy']){const response=await updateSession(new NextRequest('https://robyn.test'+path));assert.equal(response.status,200);assert.equal(response.headers.get('location'),null);}
    assert.equal(authCalls,0);const privateResponse=await updateSession(new NextRequest('https://robyn.test/dashboard'));assert.equal(privateResponse.status,307);assert.equal(new URL(privateResponse.headers.get('location')).pathname,'/login');assert.equal(authCalls,1);
  }finally{delete globalThis.supportAccessClient;for(const [key,value] of [['NEXT_PUBLIC_SUPABASE_URL',previous.url],['NEXT_PUBLIC_SUPABASE_ANON_KEY',previous.key]]){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
