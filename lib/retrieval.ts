import corpus from "@/data/knowledge.json";
export type Chunk={title:string;file:string;page:number;text:string};
const stop=new Set("a an and are as at be by can do does for from how i in is it me my of on or our the this to use using want what when where which with would you your makerspace ingram hall please about tell get need".split(" "));
function terms(s:string){return (s.toLowerCase().match(/[a-z0-9]+/g)||[]).filter(w=>w.length>1&&!stop.has(w)).map(w=>w.length>5&&w.endsWith("ing")?w.slice(0,-3):w.length>3&&w.endsWith("s")?w.slice(0,-1):w)}
function expand(q:string){let query=q;
 if(/\b(ppe|wear|clothes|shoes|glasses|dress)\b/i.test(q))query+=" personal protective equipment safety glasses industrial";
 if(/\b(access|enter|entry|register|onboard|new user)\b/i.test(q))query+=" access initial training participation agreement";
 if(/\b(cost|price|rates?|pay|charges?)\b/i.test(q))query+=" rates billing invoice";
 if(/\b3d\b/i.test(q))query+=" FFF print";
 if(/\b(fom|account)\b/i.test(q))query+=" FOM account";
 return [...new Set(terms(query))];
}
const docs=(corpus as Chunk[]).map(c=>{const ts=terms(c.text);const counts=new Map<string,number>();ts.forEach(t=>counts.set(t,(counts.get(t)||0)+1));return {c,counts,length:ts.length,title:terms(c.title)}});
const avg=docs.reduce((n,d)=>n+d.length,0)/Math.max(docs.length,1);
const df=new Map<string,number>();docs.forEach(d=>d.counts.forEach((_,t)=>df.set(t,(df.get(t)||0)+1)));
export function retrieve(question:string):Chunk[]{
 const qs=expand(question);if(!qs.length)return [];
 const scored=docs.map(d=>{let score=0,hits=0;for(const t of qs){const f=d.counts.get(t)||0;if(f){hits++;const idf=Math.log(1+(docs.length-(df.get(t)||0)+.5)/((df.get(t)||0)+.5));score+=idf*f*2.2/(f+1.2*(.25+.75*d.length/avg));}if(d.title.includes(t))score+=.9;}
 score*=.4+.6*hits/qs.length;
 if(/\b(cost|price|rates?|charges?)\b/i.test(question)&&d.c.title.includes("Rates"))score+=d.c.page===1?15:12;
 if(/\b(ppe|wear|clothes|shoes|food|drink|safety)\b/i.test(question)&&d.c.title==="Ingram Hall Makerspace Policies and Procedures")score+=4;
 if(/\b(access|enter|entry|register|onboard)\b/i.test(question)&&d.c.title==="New User SOP")score+=4;
 if(/\bfom\b/i.test(question)&&!/equipment|print|research|profile|invoice|reservation/i.test(question)&&d.c.title==="FOM Requesting Access to New Equipment"&&d.c.page===2)score+=7;
 return{...d,score,hits}}).filter(d=>(d.hits>=Math.min(2,qs.length)||(d.hits>0&&d.c.title.includes("Rates")&&/\b(cost|price|rates?|charges?)\b/i.test(question)))&&d.score>1.1).sort((a,b)=>b.score-a.score);
 return scored.slice(0,5).map(d=>d.c);
}
export function extractAnswer(chunks:Chunk[],question:string){
 if(!chunks.length)return "I couldn’t find that in the supplied Makerspace documents. Please check with Makerspace staff.";
 const text=chunks[0].text, q=expand(question);let excerpt=text;
 if(text.length>1800){
 const sections=text.split(/(?=•)|(?<=[.!?])\s+(?=[A-Z])/).filter(t=>t.trim());
 const scored=sections.map((t,i)=>({i,score:q.reduce((n,w)=>n+(terms(t).includes(w)?1:0),0)})).sort((a,b)=>b.score-a.score);
 const index=scored[0]?.i||0;excerpt=sections.slice(index, index+5).join(" ");
 }
 excerpt=excerpt.trim();if(excerpt.length>1800)excerpt=excerpt.slice(0,1800)+"…";
 return "AI answers aren’t connected yet. Here is a matching passage from the supplied document:\n\n"+excerpt;
}
