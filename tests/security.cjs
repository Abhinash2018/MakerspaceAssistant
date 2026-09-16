// In-memory SQLite integration checks run the actual TypeScript route implementations.
const { DatabaseSync } = require('node:sqlite');
const ts = require('typescript'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), assert = require('node:assert/strict');
const sql = new DatabaseSync(':memory:');
for (const name of fs.readdirSync('drizzle').filter(n => n.endsWith('.sql')).sort()) sql.exec(fs.readFileSync('drizzle/' + name, 'utf8'));
const env = { STAFF_ACCESS_KEY: 's'.repeat(43), DATA_ENCRYPTION_KEY: 'e'.repeat(43), MAINTENANCE_KEY: 'm'.repeat(43), FACE_ENABLED: 'true', FACE_SERVICE_URL: 'https://face.example', FACE_SERVICE_KEY: 'f'.repeat(43) };
const unit = Array(128).fill(0.1); unit[0] = 0.5;
const samples = direction => [0, direction === 'left' ? .18 : -.18, .02].map((yaw,i)=>({vector:[...unit],yaw,time:1000+i*2000}));
const objects = new Map(); let deletionFails = false;
const db = { prepare(query) { return { bind(...args) { return {
  async first() { return sql.prepare(query).get(...args) || null; },
  async all() { return { results: sql.prepare(query).all(...args) }; },
  async run() { return { meta: sql.prepare(query).run(...args) }; }
}; }, async first(){return sql.prepare(query).get()||null;} }; }, async batch(statements) { sql.exec('BEGIN'); try { const result=[]; for(const stmt of statements) result.push(await stmt.run()); sql.exec('COMMIT'); return result; } catch(e){sql.exec('ROLLBACK');throw e;} } };
const bucket = { async put(key, bytes) { objects.set(key,{key,bytes,uploaded:new Date()}); }, async delete(key) { if(deletionFails) throw Error('storage unavailable'); objects.delete(key); }, async list(){return {objects:[...objects.values()],truncated:false};} };
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if(cache.has(file)) return cache.get(file);
  const exports={};cache.set(file,exports);
  const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  function requireLocal(name) {
    if(name==='cloudflare:workers') return {env};
    if(name==='@/db') return {getDatabase:()=>db,getPhotos:()=>bucket};
    if(name.endsWith('.json')) return JSON.parse(fs.readFileSync(name.replace(/^@\//,''),'utf8'));
    const base=name.startsWith('@/')?name.slice(2):path.resolve(path.dirname(file),name);
    return load(fs.existsSync(base+'.ts')?base+'.ts':path.join(base,'index.ts'));
  }
  vm.runInNewContext(source,{exports,require:requireLocal,Response,Request,TextDecoder,TextEncoder,Uint8Array,crypto,atob,btoa,URL,AbortSignal,console,fetch:async(url,options)=>{assert.equal(new URL(url).host,'face.example');assert.equal(options.headers.Authorization,'Bearer '+env.FACE_SERVICE_KEY);return Response.json({vector:unit,model:'sface-2021dec',motionPassed:true});}},{filename:file});
  return exports;
}
const routes={};for(const name of ['session','pair','verification','checkin','face/challenge','face/checkin','enrollment/revoke','maintenance','ask'])routes[name]=load('app/api/'+name+'/route.ts');
function req(route,body,session,method='POST',origin='https://kiosk.example'){
 return new Request('https://kiosk.example/api/'+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...(session?{Cookie:session.cookie,'X-CSRF-Token':session.csrf}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
}
async function call(route,body,session){const r=await routes[route].POST(req(route,body,session));return {status:r.status,body:await r.json(),headers:r.headers};}
async function login(body){const r=await call('session',body);assert.equal(r.status,200,JSON.stringify(r.body));return{cookie:r.headers.get('Set-Cookie').split(';')[0],csrf:r.body.csrf};}
async function grant(staff,kiosk){const issued=await call('verification',{name:'Test Student',netid:'test123',attested:true},staff);assert.equal(issued.status,200);const redeemed=await call('verification',{code:issued.body.code},kiosk);assert.equal(redeemed.status,200);return redeemed.body.grantId;}
(async()=>{
 for(const r of ['pair','verification','checkin','face/challenge','face/checkin','enrollment/revoke','maintenance','ask'])assert.equal((await call(r,{})).status,401,r);
 assert.equal((await call('session',{role:'staff',key:'wrong'})).status,401);
 const staff=await login({role:'staff',key:env.STAFF_ACCESS_KEY});
 const kiosk=await login({role:'kiosk'});
 assert.equal((await routes.session.POST(req('session',{role:'kiosk'},undefined,'POST','https://evil.example'))).status,403,'session origin required');
 const sessionInfo=await routes.session.GET(req('session',undefined,kiosk,'GET'));
 assert.equal((await sessionInfo.json()).role,'kiosk');
 assert.equal((await call('enrollment/revoke',{netid:'test123',attested:true},kiosk)).status,403,'automatic sessions cannot administer');
 assert.equal((await call('pair',{},kiosk)).status,403);
 assert.equal((await call('pair',{}, {...staff,csrf:'forged'})).status,403);
 assert.equal((await routes.pair.POST(req('pair',{},staff,'POST','https://evil.example'))).status,403);
 const id=crypto.randomUUID();const base={id,photo:null,photoConsent:false,faceConsent:false,name:'Test Student',netid:'test123'};
 assert.equal((await call('checkin',{...base,name:''},kiosk)).status,400);
 assert.equal((await call('checkin',{...base,netid:'student@example.com'},kiosk)).status,400);
 assert.equal((await call('checkin',{...base,photo:'image'},kiosk)).status,400);
 assert.equal((await call('checkin',base,kiosk)).status,200,'student needs no staff grant');
 const visit=sql.prepare('SELECT * FROM visits WHERE id=?').get(id);assert.equal(visit.net_id,'test123');assert.equal(visit.method,'self-reported');assert(visit.expires_at>Date.now());
 assert.equal((await call('checkin',base,kiosk)).status,200,'retry idempotent');assert.equal(sql.prepare('SELECT count(*) AS n FROM visits').get().n,1);
 sql.exec('DELETE FROM rate_limits');
 const challenge=await call('face/challenge',{purpose:'enroll',consent:true},kiosk);
 const raw=Buffer.alloc(180);raw[0]=255;raw[1]=216;raw[2]=255;const photo='data:image/jpeg;base64,'+raw.toString('base64');
 const enrollment={id:crypto.randomUUID(),name:"Test Student",netid:"test123",photo,photoConsent:true,faceConsent:true,faceConsentVersion:'face-video-opt-in-v2-90days',challengeId:challenge.body.id,model:'faceapi-resnet128-v1',samples:samples(challenge.body.direction)};
 assert.equal((await call('checkin',{...enrollment,faceConsentVersion:'old'},kiosk)).status,400);
 assert.equal((await call('checkin',{...enrollment,samples:samples(challenge.body.direction).map(s=>({...s,yaw:0}))},kiosk)).status,400,'static pose rejected');
 const enrolled=await call('checkin',enrollment,kiosk);assert.equal(enrolled.status,200,JSON.stringify(enrolled.body));
 assert.equal(sql.prepare('SELECT count(*) AS n FROM face_profiles').get().n,1);assert.equal(objects.size,1);
 const profile=sql.prepare('SELECT * FROM face_profiles').get();assert(!profile.payload.includes('test123'));
 const collisionChallenge=await call('face/challenge',{purpose:'enroll',consent:true},kiosk);
 const collision=await call('checkin',{...enrollment,id:crypto.randomUUID(),name:'Other Student',challengeId:collisionChallenge.body.id,samples:samples(collisionChallenge.body.direction)},kiosk);
 assert.equal(collision.status,409,'self-reported NetID cannot replace enrollment');
 assert.equal(sql.prepare('SELECT payload FROM face_profiles').get().payload,profile.payload);
 const ch2=await call('face/challenge',{purpose:'checkin',consent:true},kiosk);
 sql.prepare('UPDATE visits SET created_at=? WHERE profile_id=?').run(new Date(Date.now()-180000).toISOString(),profile.id);
 const faceBody={id:crypto.randomUUID(),consent:true,model:'faceapi-resnet128-v1',samples:samples(ch2.body.direction),challengeId:ch2.body.id};
 assert.equal((await call('face/checkin',faceBody,kiosk)).status,200);
 assert.equal((await call('face/checkin',{...faceBody,id:crypto.randomUUID()},kiosk)).status,400,'challenge replay');
 const match=load('lib/security/face.ts');assert.equal(match.chooseMatch([{score:.49,value:'a'}]),null);assert.equal(match.chooseMatch([{score:.8,value:'a'},{score:.75,value:'b'}]),null);assert.equal(match.chooseMatch([{score:.8,value:'a'},{score:.6,value:'b'}]),'a');
 const contract=load('lib/face-contract.ts');assert.equal(contract.scanValid(samples('left'),'right'),false);assert.equal(contract.scanValid(samples('left'),'left'),true);assert.equal(contract.validVector(Array(128).fill(0)),false);
 const ciphertext=await load('lib/security/crypto.ts').seal({secret:'value'},'one');await assert.rejects(()=>load('lib/security/crypto.ts').unseal(ciphertext,'different'));
 assert.equal((await call('enrollment/revoke',{netid:'test123',attested:true},staff)).status,200);assert.equal(sql.prepare('SELECT count(*) AS n FROM face_profiles').get().n,0);
 const cleanup=load('lib/security/retention.ts');sql.exec('UPDATE visits SET expires_at=1');deletionFails=true;await assert.rejects(()=>cleanup.purgeExpired());assert(sql.prepare('SELECT count(*) AS n FROM visits WHERE photo_key IS NOT NULL').get().n>0,'retry photo deletion');deletionFails=false;await cleanup.purgeExpired();assert.equal(objects.size,0);assert.equal(sql.prepare('SELECT count(*) AS n FROM visits').get().n,0);
 sql.exec('DELETE FROM rate_limits');const auth=load('lib/security/auth.ts');await auth.rateLimit('test',2);await auth.rateLimit('test',2);await assert.rejects(()=>auth.rateLimit('test',2),e=>e.status===429);
 sql.exec('UPDATE sessions SET expires_at=1');assert.equal((await call('ask',{question:'PPE'},kiosk)).status,401);
 const renewed=await login({role:'kiosk'});
 assert.equal((await call('checkin',{...base,id:crypto.randomUUID()},renewed)).status,200,'expired browser can restart without a pairing code');
 console.log('PASS: route authentication, roles, CSRF, automatic kiosk sessions, self-service identity validation, enrollment overwrite prevention, consent, retries, encrypted profiles, face challenge replay, ambiguous matches, revocation, deletion failures and retry, rate limits, session expiry.');
})().catch(e=>{console.error(e);process.exitCode=1;});
