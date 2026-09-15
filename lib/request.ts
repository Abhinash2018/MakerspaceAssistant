export function response(data:unknown,status=200){return Response.json(data,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}})}
export async function readBody(req:Request,limit:number){
 const origin=req.headers.get("origin");
 if(!origin || origin!==new URL(req.url).origin) throw new Error("Invalid request origin");
 if(!req.headers.get("content-type")?.includes("application/json")) throw new Error("Expected JSON");
 if(Number(req.headers.get("content-length")||0)>limit)throw new Error("Request too large");
 const reader=req.body?.getReader();if(!reader)throw new Error("Missing request");let size=0;const parts:Uint8Array[]=[];
 while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new Error("Request too large")}parts.push(value)}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length}
 const parsed=JSON.parse(new TextDecoder().decode(bytes));if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw new Error("Expected an object");return parsed;
}
