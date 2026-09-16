// Run the shipped browser runtime and actual model weights without a camera or student data.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const dir=path.resolve('public/face-models');
const provenance=JSON.parse(fs.readFileSync(path.join(dir,'provenance.json')));
for(const [name,hash] of Object.entries(provenance.sha256)) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,name))).digest('hex'),hash,name);
const sandbox={console,TextEncoder,TextDecoder,URL,Response,setTimeout,clearTimeout,performance,fetch:async url=>new Response(fs.readFileSync(path.join(dir,new URL(url).pathname.split('/').pop())))};
sandbox.self=sandbox;sandbox.window=sandbox;vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.join(dir,'face-api.js'),'utf8'),sandbox);
(async()=>{
 const f=sandbox.faceapi;
 f.tf.setPlatform('test',{fetch:sandbox.fetch,now:()=>performance.now(),encode:x=>new TextEncoder().encode(x),decode:x=>new TextDecoder().decode(x)});
 f.env.setEnv({Canvas:class{},Image:class{},ImageData:class{},Video:class{},fetch:sandbox.fetch});
 await f.tf.setBackend('cpu');await f.tf.ready();
 for(const [name,net] of [['tiny_face_detector',f.nets.tinyFaceDetector],['face_landmark_68',f.nets.faceLandmark68Net],['face_recognition',f.nets.faceRecognitionNet]]){
  const manifest=JSON.parse(fs.readFileSync(path.join(dir,name+'_model-weights_manifest.json')));
  const weights=await f.tf.io.loadWeights(manifest,'https://fixtures/');net.loadFromWeightMap(weights);
 }
 const blank=f.tf.zeros([240,320,3]);
 const faces=await f.detectAllFaces(blank,new f.TinyFaceDetectorOptions({inputSize:320})).withFaceLandmarks().withFaceDescriptors();
 assert.equal(faces.length,0,'blank image must not enroll');blank.dispose();
 const crop=f.tf.zeros([150,150,3]);const vector=await f.computeFaceDescriptor(crop);assert.equal(vector.length,128);assert(Array.from(vector).every(Number.isFinite));crop.dispose();
 console.log('PASS: shipped asset checksums, three model loads, blank-image rejection, recognition inference.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
