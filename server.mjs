import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const PORT=Number(process.env.PORT||8093), HF_TOKEN=process.env.HF_TOKEN||'', MODEL=process.env.HF_MODEL||'openai/gpt-oss-120b:fastest';
let CORPUS={chunks:[]}; try{CORPUS=JSON.parse(fs.readFileSync(path.join(__dirname,'corpus','index.json'),'utf8'))}catch{}
let CURRICULUM={}; try{CURRICULUM=JSON.parse(fs.readFileSync(path.join(__dirname,'ncert','curriculum.json'),'utf8'))}catch{}
const SYSTEM=`You are VYRA AI, an exceptionally capable human-like teacher and academic mentor. Give exactly as much explanation as the actual question needs.
RESPONSE CALIBRATION: Answer directly first. Simple factual questions are usually 2-5 clear sentences. Normal concepts get enough explanation in short sections/bullets. Difficult or explicitly deep questions get structured detail. Never turn a simple question into an essay or a meaningful concept into a shallow answer. Use examples, analogies, formulas and steps only when useful. Match the user's language naturally: English->English, Hindi->Hindi, Hinglish->Hinglish, mixed->natural mixed.
NCERT GROUNDED SCHOOL MODE: For Classes 9-12, use the supplied NCERT corpus as the primary source whenever relevant. Treat retrieved text as grounding evidence, not text to copy. Explain in your own words; do not reproduce long textbook passages. If the corpus lacks enough evidence for a specific edition/syllabus claim, say so instead of inventing it. For JEE/NEET, add appropriate depth only when selected.
TEACHER BEHAVIOUR: Teach WHAT, WHY, HOW and WHERE useful. Repair prerequisites when needed. Preserve conversation context and follow-ups. Use clean structure without unnecessary walls of text.`;
const CLASS_SYSTEM=`You are VYRA's senior NCERT curriculum designer and expert human classroom teacher.
Build a lesson that feels like a real teacher teaching one connected idea at a time, not an AI reading bullet points.
SOURCE DISCIPLINE: Retrieved NCERT evidence is the primary source for Class 9-12 school content. Every teaching point must be supported by the supplied evidence. Explain in your own words; never copy textbook paragraphs. Do not invent syllabus facts, chapter names, formulas, definitions, activities or examples that are not supported by the evidence. If the requested topic is outside the retrieved evidence, say that the corpus evidence is insufficient rather than fabricating NCERT content.
CURRICULUM FLOW: First identify the exact chapter and the smallest set of concepts needed. Then sequence UNIQUE concepts only: prerequisite -> core idea -> relationship/mechanism -> worked or familiar example -> application/misconception -> exam connection. Never repeat a definition, formula, analogy, bridge sentence or conclusion just because a new slide started.
NOTES: Notes must be actual NCERT-grounded concepts, not generic study advice. Use concise but meaningful left-aligned points. 5-7 points per teaching slide when the source supports that amount.
SPEECH: For EVERY point, write a separate natural spoken explanation in the speak field. It must sound like a teacher talking to a student: vary openings, connect to the previous point, explain WHY/HOW, use a concrete example only when supported or clearly label it as an illustrative example, and move the lesson forward. Do not start every point with the same phrase. Do not repeat the point verbatim. Do not use filler such as 'here is the picture', 'before memorising', 'the deeper reason', or 'quick check' on every point. A simple point can have 1-3 natural sentences; an important concept can have more.
EXAMPLE CHANGES: When an example is useful, explain the underlying rule first so the student can understand a changed example, not memorize one fixed example.
LANGUAGE: Use the selected language naturally. Hinglish should actually be Hinglish, not English with one Hindi word.
OUTPUT ONLY VALID JSON: {"chapter":"...","deck":[{"title":"...","say":"short natural transition for this slide","visual":"none","points":[["key","NCERT-grounded note","natural spoken teacher explanation"]]}],"examTitle":"PYQs + Important Questions","examQuestions":["..."]}`;
function send(res,status,data,type='application/json; charset=utf-8'){res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store'});res.end(type.startsWith('application/json')?JSON.stringify(data):data)}
function body(req){return new Promise((resolve,reject)=>{let b='';req.on('data',c=>{b+=c;if(b.length>2e6)req.destroy()});req.on('end',()=>{try{resolve(JSON.parse(b||'{}'))}catch(e){reject(e)}});req.on('error',reject)})}
function extractChatText(d){return String(d?.choices?.[0]?.message?.content||'').trim()}
function extractJSON(t){let x=String(t||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();try{return JSON.parse(x)}catch{}const a=x.indexOf('{'),b=x.lastIndexOf('}');if(a>=0&&b>a)try{return JSON.parse(x.slice(a,b+1))}catch{}throw new Error('AI returned invalid class JSON.')}
async function callHF(messages,max_tokens=3600){if(!HF_TOKEN)throw Object.assign(new Error('VYRA AI is not connected. HF_TOKEN is missing in this Termux session.'),{status:500});const r=await fetch('https://router.huggingface.co/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${HF_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({model:MODEL,messages,stream:false,max_tokens})});const d=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(d?.error?.message||d?.error||'Hugging Face AI provider returned an error.'),{status:r.status});const a=extractChatText(d);if(!a)throw Object.assign(new Error('The AI returned no text.'),{status:502});return a}
function words(s){return new Set(String(s||'').toLowerCase().replace(/[^a-z0-9\u0900-\u097F]+/gi,' ').split(/\s+/).filter(x=>x.length>2))}
function score(c,q){const qW=words(q),tW=words(`${c.chapterTitle} ${c.text}`);let n=0;for(const w of qW)if(tW.has(w))n++;const ql=String(q).toLowerCase(),tl=String(c.chapterTitle).toLowerCase();if(ql.includes(tl)||tl.includes(ql))n+=8;return n}
function chapterCatalog(level){
  const key=String(level||'').toLowerCase().replace(/\s+/g,'');
  const m=key.match(/class(9|10|11|12)/); const ck=m?`class${m[1]}`:null;
  if(!ck)return [];
  const books=CURRICULUM?.books?.[ck]||{};
  return Object.entries(books).flatMap(([subjectKey,b])=>(b.chapters||[]).map(ch=>({...ch,classKey:ck,subjectKey,subjectName:b.name})));
}
function resolveChapter(topic,level){
  const q=String(topic||'').toLowerCase();
  const chapters=chapterCatalog(level);
  let best=null,scoreBest=0;
  for(const ch of chapters){
    const title=String(ch.title||'').toLowerCase();
    const code=String(ch.code||'').toLowerCase();
    const aliases=[title, title.replace(/[^a-z0-9 ]/g,' '), code];
    let score=0;
    for(const a of aliases){
      if(!a)continue;
      if(q===a || q.includes(a)) score=Math.max(score,a.length+20);
      const toks=a.split(/[^a-z0-9]+/).filter(x=>x.length>2);
      const hits=toks.filter(t=>q.includes(t)).length;
      score=Math.max(score,hits*4);
    }
    // Natural shorthand: "light", "electricity", etc.
    const first=(title.split(/[-:]/)[0]||'').trim();
    if(first && q.trim()===first)score+=25;
    if(score>scoreBest){scoreBest=score;best=ch;}
  }
  return scoreBest>=4?best:null;
}
function retrieve(q,context={},limit=10){
  if(!CORPUS.chunks?.length)return[];
  const level=context.level||'';
  const resolved=context.chapterCode?chapterCatalog(level).find(c=>c.code===context.chapterCode):resolveChapter(context.topic||q,level);
  if(resolved){
    const same=CORPUS.chunks.filter(c=>String(c.chapter||'').toLowerCase()===String(resolved.code).toLowerCase() || String(c.chapterCode||'').toLowerCase()===String(resolved.code).toLowerCase());
    if(same.length)return same.slice(0,Math.max(limit,same.length));
  }
  const is10=String(level).toLowerCase().includes('10');
  return CORPUS.chunks.map(c=>({c,s:score(c,q)+(is10&&c.classKey==='class10'?2:0)})).filter(x=>x.s>0).sort((a,b)=>b.s-a.s).slice(0,limit).map(x=>x.c);
}
function grounding(chunks){if(!chunks.length)return'No local NCERT corpus is indexed yet. Do not pretend the answer is corpus-grounded.';return chunks.map((c,i)=>`SOURCE ${i+1}\nClass: ${c.classKey}\nSubject: ${c.subjectKey}\nChapter ${c.chapter}: ${c.chapterTitle}\nOfficial source: ${c.sourceUrl}\nEvidence:\n${c.text}`).join('\n\n---\n\n')}
function uniqueDeck(deck){
  const seen=[]; const clean=[];
  const sim=(a,b)=>{const A=words(a),B=words(b);let i=0;for(const x of A)if(B.has(x))i++;return i/Math.max(1,Math.min(A.size,B.size))};
  for(const s of deck){
    const pts=[];
    for(const p of s.points||[]){
      const a=String(p?.[0]||'').trim(), b=String(p?.[1]||'').trim(), say=String(p?.[2]||'').trim();
      const sig=a+' '+b;
      if(!a||!b||seen.some(x=>sim(x,sig)>.78))continue;
      seen.push(sig);
      pts.push([a,b,say]);
    }
    if(pts.length&&!clean.some(x=>sim(x.title,s.title)>.9))clean.push({...s,points:pts});
  }
  return clean;
}
async function chat(req,res){try{const b=await body(req),message=String(b.message||'').trim();if(!message)return send(res,400,{error:'Message is empty.'});const context=b.context||{},history=Array.isArray(b.history)?b.history.slice(-20):[],ret=retrieve(message+' '+(context.topic||''),context,8);const ctx=`Current classroom context:\n- Topic: ${context.topic||'none'}\n- Level: ${context.level||'not specified'}\n- Depth: ${context.depth||'not specified'}\n- Language: ${context.language||'English'}\n- Class active: ${context.classActive?'yes':'no'}`;const msgs=[{role:'system',content:SYSTEM+'\n\n'+ctx+'\n\nNCERT RETRIEVAL ('+ret.length+' chunks):\n'+grounding(ret)}];for(const m of history)if((m.role==='user'||m.role==='assistant')&&typeof m.content==='string')msgs.push({role:m.role,content:m.content.slice(0,8000)});msgs.push({role:'user',content:message});const answer=await callHF(msgs,3600);send(res,200,{answer,model:MODEL,grounded:Boolean(ret.length),sources:ret.map(c=>({chapter:c.chapter,chapterTitle:c.chapterTitle,sourceUrl:c.sourceUrl}))})}catch(e){send(res,e.status||500,{error:e.message||'Server error'})}}
async function generateClass(req,res){try{
  const b=await body(req),topic=String(b.topic||'').trim()||'General Science',level=String(b.level||'Class 10'),depth=String(b.depth||'Deep'),mins=Math.max(15,Math.min(60,Number(b.mins||30))),language=String(b.language||'English');
  const chapter=resolveChapter(topic,level);
  const retrievalContext={level,topic,chapterCode:chapter?.code||''};
  const ret=retrieve(topic+' '+level,retrievalContext,20);
  const plan=mins<=15?{slides:7,points:3,mode:'RAPID REVISION',words:1700}:mins<=30?{slides:9,points:4,mode:'COMPLETE REVISION + UNDERSTANDING',words:3000}:mins<=45?{slides:11,points:4,mode:'DETAILED TEACHING',words:4300}:{slides:14,points:4,mode:'FULL DETAILED CLASS',words:6000};
  const chapterInstruction=chapter?`EXACT NCERT CHAPTER: Class ${chapter.classKey.replace('class','')} ${chapter.subjectName}, Chapter ${chapter.number}: ${chapter.title} (${chapter.code}).\nThis chapter is the student's requested topic. Cover the chapter's actual NCERT concepts, not generic prerequisites.`:`No exact chapter was resolved. Stay strictly inside the retrieved evidence.`;
  const prompt=`Build a complete live classroom lesson for a real student.\n\nSTUDENT INPUT\nTopic: ${topic}\nSelected level: ${level}\nDepth: ${depth}\nDuration: ${mins} minutes\nLanguage: ${language}\nTeaching mode: ${plan.mode}\nTarget teaching slides: ${plan.slides}\nTarget points per slide: about ${plan.points}\nTarget total spoken words: about ${plan.words}\n\n${chapterInstruction}\n\nNCERT CORPUS EVIDENCE\n${grounding(ret)}\n\nNON-NEGOTIABLE LESSON RULES\n1. For a chapter request, this is a RAPID REVISION or full class of the requested chapter. Do NOT replace the chapter with generic learning advice or a different concept.\n2. For 15 minutes, compress the whole requested chapter/topic into its highest-yield NCERT concepts: definitions, laws/rules, diagrams or ray cases when supported, formulae, sign conventions, relationships, standard cases, common misconceptions and exam-useful facts. Do not spend several slides on one generic 'big idea'.\n3. Longer durations must expand coverage and explanation, not repeat the same points.\n4. Every note must be traceable to the supplied NCERT evidence. If a detail is absent, omit it. Never invent an NCERT fact.\n5. Sequence concepts according to the chapter, not according to a generic AI teaching template.\n6. Each concept may appear ONCE. Do not restate the same concept as a new slide title, summary, bridge or conclusion.\n7. Notes must contain actual subject content. Never use filler such as 'build the idea', 'understand the mechanism', 'keep this in mind', or 'this is important' as a substitute for teaching.\n8. SPEECH is a real teacher's explanation. It must add useful information, sound conversational, and vary naturally. Never begin every point with the same phrase. Never read the note verbatim. Do not append generic transition sentences after every point.\n9. If an example changes, explain the underlying rule so the student can solve the changed example.\n10. 15-minute classes should feel like a genuine rapid revision, not a teaser.\n11. Final exam slide: exactly 3-4 original PYQ-style/important questions based only on covered NCERT concepts. Do not claim they are historical PYQs unless verified in the corpus.\n12. Output valid JSON only. No markdown in JSON strings.`;
  const raw=await callHF([{role:'system',content:CLASS_SYSTEM},{role:'user',content:prompt}],Math.max(7000,plan.words+1800));
  const obj=extractJSON(raw);
  let deck=Array.isArray(obj.deck)?obj.deck.map((s,i)=>({title:String(s?.title||`Concept ${i+1}`),say:String(s?.say||''),visual:String(s?.visual||'none'),points:Array.isArray(s?.points)?s.points.map(p=>Array.isArray(p)?[String(p[0]||''),String(p[1]||''),String(p[2]||'')]:[String(p?.title||p?.key||''),String(p?.detail||p?.explanation||''),String(p?.speak||p?.speech||'')]).filter(p=>p[0]&&p[1]):[]})).filter(s=>s.points.length):[];
  deck=uniqueDeck(deck);
  const qs=Array.isArray(obj.examQuestions)?obj.examQuestions.map(x=>String(x).trim()).filter(Boolean).slice(0,4):[];
  if(qs.length)deck.push({title:String(obj.examTitle||'Rapid Revision · Exam Check'),say:'Let us finish by checking the concepts we just covered.',visual:'none',points:qs.map((q,i)=>[`Question ${i+1}`,q])});
  if(!deck.length)throw Object.assign(new Error('No usable class was generated.'),{status:502});
  send(res,200,{deck,model:MODEL,grounded:Boolean(ret.length),chapter:chapter?{code:chapter.code,title:chapter.title,number:chapter.number}:null,sources:ret.map(c=>({chapter:c.chapter,chapterTitle:c.chapterTitle,sourceUrl:c.sourceUrl}))});
}catch(e){send(res,e.status||500,{error:e.message||'Could not generate the class.'})}}
const server=http.createServer(async(req,res)=>{try{if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type'});return res.end()}if(req.method==='POST'&&req.url==='/api/chat')return chat(req,res);if(req.method==='POST'&&req.url==='/api/class')return generateClass(req,res);if(req.method==='GET'&&req.url==='/api/corpus-status')return send(res,200,{indexedChunks:CORPUS.chunks?.length||0,generatedAt:CORPUS.generatedAt||null,source:CORPUS.source||null});if(req.method==='GET'&&(req.url==='/'||req.url==='/index.html'))return send(res,200,fs.readFileSync(path.join(__dirname,'index.html'),'utf8'),'text/html; charset=utf-8');if(req.method==='GET'&&req.url==='/manifest.webmanifest')return send(res,200,fs.readFileSync(path.join(__dirname,'manifest.webmanifest'),'utf8'),'application/manifest+json; charset=utf-8');if(req.method==='GET'&&req.url==='/sw.js')return send(res,200,fs.readFileSync(path.join(__dirname,'sw.js'),'utf8'),'application/javascript; charset=utf-8');if(req.method==='GET'&&req.url.startsWith('/icons/')){const f=path.join(__dirname,req.url.split('/').filter(Boolean).join('/'));if(fs.existsSync(f))return send(res,200,fs.readFileSync(f),req.url.endsWith('.png')?'image/png':'application/octet-stream');}if(req.method==='GET'&&req.url==='/health')return send(res,200,{ok:true,model:MODEL,aiConnected:Boolean(HF_TOKEN),corpusChunks:CORPUS.chunks?.length||0});send(res,404,{error:'Not found'})}catch(e){console.error(e);send(res,500,{error:e.message||'Server error'})}});server.listen(PORT,()=>console.log(`VYRA AI Classroom running at http://localhost:${PORT}`));
