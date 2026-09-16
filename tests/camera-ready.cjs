const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), assert = require('node:assert/strict');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/camera-ready.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, {exports:exportsObject,Date,setTimeout,DOMException});
(async()=>{
 const {waitForCamera} = exportsObject;
 let preview = null, resolved = false;
 const pending = waitForCamera(()=>preview,()=>true).then(v=>{resolved=true;return v;});
 preview = {readyState:1,videoWidth:0,videoHeight:0};
 await new Promise(r=>setTimeout(r,60));assert.equal(resolved,false,'mounting a video is not enough to scan');
 preview = {readyState:2,videoWidth:640,videoHeight:480};assert.equal(await pending,preview,'starts when the first frame is ready');
 let active=true;const cancelled=waitForCamera(()=>null,()=>active);active=false;await assert.rejects(cancelled,e=>e.name==='AbortError','cancel stops camera startup');
 await assert.rejects(waitForCamera(()=>null,()=>true,0),/camera could not start/,'camera failure is bounded');
 console.log('PASS: video startup readiness, cancellation, and timeout.');
})().catch(e=>{console.error(e);process.exitCode=1;});
