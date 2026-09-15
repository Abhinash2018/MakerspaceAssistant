import {getDatabase,getPhotos} from "@/db";
import {readBody,response} from "@/lib/request";
export async function POST(req:Request){
 let body;try{body=await readBody(req,600000)}catch{return response({error:"Invalid check-in request. Please try again."},400)}
 const {id,name,netid,photo,photoConsent}=body;
 if(typeof id!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)||typeof name!=="string"||name.trim().length<2||name.length>100||/[\u0000-\u001f]/.test(name)||typeof netid!=="string"||!/^[a-z][a-z0-9]{2,19}$/.test(netid)||typeof photoConsent!=="boolean")return response({error:"Please review your name and NetID."},400);
 if((photo&&photoConsent!==true)||(!photo&&photoConsent))return response({error:"A photo requires your explicit consent."},400);
 let bytes:Uint8Array|null=null;
 if(photo){if(typeof photo!=="string"||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(photo))return response({error:"Invalid photo. Please take it again."},400);try{bytes=Uint8Array.from(atob(photo.split(",")[1]),c=>c.charCodeAt(0))}catch{return response({error:"Invalid photo."},400)}if(bytes.length<100||bytes.length>400000||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)return response({error:"Photo could not be read. Please retake it."},400)}
 try{
 const db=getDatabase();const existing=await db.prepare("SELECT id FROM visits WHERE id = ?").bind(id).first();if(existing)return response({ok:true});
 // Unique upload keys prevent a concurrent retry from overwriting a saved photo.
 const photoKey=bytes?`visits/${id}/${crypto.randomUUID()}.jpg`:null;
 if(bytes&&photoKey)await getPhotos().put(photoKey,bytes,{httpMetadata:{contentType:"image/jpeg",cacheControl:"no-store"}});
 try{const result=await db.prepare("INSERT INTO visits (id, full_name, net_id, photo_key, photo_consent, consent_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING").bind(id,name.trim(),netid,photoKey,photoConsent?1:0,"photo-consent-v1",new Date().toISOString()).run();if(!result.meta.changes&&photoKey)await getPhotos().delete(photoKey)}catch(e){if(photoKey)await getPhotos().delete(photoKey).catch(()=>{});throw e}
 return response({ok:true});
 }catch{return response({error:"Your check-in could not be saved. Your details are still here; please try again or contact Makerspace staff."},503)}
}
