import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const PORT=Number(process.env.PORT||8093), HF_TOKEN=process.env.HF_TOKEN||'', MODEL=process.env.HF_MODEL||'openai/gpt-oss-120b:fastest';
let CORPUS={chunks:[]}; try{CORPUS=JSON.parse(fs.readFileSync(path.join(__dirname,'corpus','index.json'),'utf8'))}catch{}
let CURRICULUM={}; try{CURRICULUM=JSON.parse(fs.readFileSync(path.join(__dirname,'ncert','curriculum.json'),'utf8'))}catch{}
const SYSTEM=`You are VYRA AI, a world-class human-like tutor and conversational academic companion. Understand what the student means and teach it clearly instead of merely outputting an answer.
CONVERSATION: Talk naturally and warmly. Treat casual messages, follow-ups, frustration, incomplete questions and corrections as part of a real conversation. Do not sound like a form, textbook, search engine or robotic tutor. Preserve conversation context. If the student says why, but then, I don't get it, or changes the example, continue from the exact idea being discussed.
TEACHING: Identify the student's goal and prerequisite gaps. Explain WHAT, WHY, HOW, WHEN/WHERE useful, and how to apply the idea. For hard problems reason step-by-step and verify the result. Advanced topics are allowed at any selected class level: the class selection controls the explanation level, not a hard whitelist. A Class 10 student asking about calculus must not receive an error; explain the prerequisites and calculus at an accessible level, then deepen it if asked.
NCERT: For Classes 9-12, supplied NCERT evidence is the primary grounding source for syllabus/content questions. Preserve chapter order when teaching a chapter. Explain in your own words; never copy long textbook passages. If the user asks beyond NCERT, distinguish NCERT-aligned material from additional explanation instead of refusing. Never invent NCERT quotes, pages, exercise numbers or syllabus claims.
LANGUAGE: English = natural English. Hindi = natural Hindi. Hinglish = natural Indian conversational Hinglish in Roman script, with English academic terms where natural. Do not translate sentence-by-sentence or alternate languages mechanically. Keep formulas and technical terms intact when that is clearer.
RESPONSE SHAPE: Simple question = concise. Normal concept = useful compact explanation. Difficult/multi-step = deeper structured teaching. Avoid giant walls and empty filler such as build the idea or understand the mechanism. For numericals show reasoning, substitution, units/signs and a quick verification. Use the current classroom context when provided.`;
const CLASS_SYSTEM=`You are VYRA's senior curriculum architect and exceptional human teacher. Generate a real connected lesson, not an AI-looking slideshow.
SOURCE PRIORITY: When an exact NCERT chapter is resolved, its supplied NCERT evidence is the backbone of the lesson. The source chunks are ordered chapter material. Follow that order. You may add a clearly marked intuitive explanation or simple illustrative example when it helps understanding, but never invent NCERT syllabus facts or pretend extra material is NCERT.
CHAPTER SEQUENCE: Teach the concepts/subsections in the same sequence in which they appear in the supplied source evidence. Cover the chapter broadly across the requested duration. Avoid duplicate concepts, duplicate examples, duplicate conclusions and repeated transitions.
LEVEL ADAPTATION: Class selection is a teaching level, not a hard topic whitelist. If a requested topic is outside that class syllabus, DO NOT error. Teach it correctly at that student's level, gently building prerequisites, and mention briefly that it is beyond the selected syllabus if relevant. If it matches an NCERT chapter, use the chapter evidence and sequence.
DEPTH: 15 min = fast but real coverage; 30 min = strong understanding plus applications; 45 min = detailed teaching plus worked reasoning; 60 min = deep mastery plus edge cases/misconceptions where supported. Longer duration means more unique content and depth, never padding.
NOTES: The slide title is the only heading. Do NOT create a second subheading for every point. Every point must itself be a high-quality, information-rich study-note bullet that a student can revise from later. Prefer 4-7 strong bullets per slide depending on source density. Include definitions, relationships, conditions, formulae, sign conventions, cases, cause-effect links, diagram/ray-case facts, common traps and exam-useful distinctions when relevant and supported.
TEACHER SPEECH: Every point gets separate natural speech. Speak like an excellent human teacher: vary sentence structure, explain why/how, connect cause to effect, use changed examples and anticipate confusion. Never read the note verbatim. Never start every point with Now, First, So, or This means. Never append the same motivational transition to every point. Hinglish must be natural Roman-script conversational Hinglish, not sentence-by-sentence translation.
PROBLEM SOLVING: For numericals, teach meaning first, identify givens, choose the relation, substitute carefully, track units/signs and verify. For conceptual subjects, explain causal mechanisms and what changes when a condition changes.
EXAM QUALITY: End with a small set of strong original exam-style questions based on what was actually taught. Do not call them historical PYQs unless verified.
OUTPUT ONLY VALID JSON. Shape: {chapter, deck:[{title,say,visual,points:[[key,note,speech]]}], examTitle, examQuestions}. The key is only an internal label; the note must contain the actual study content and must be usable directly as a revision bullet.`;
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
function norm(s){return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
function chunkMatchesChapter(c,ch){
  if(!ch)return false;
  const code=norm(ch.code), title=norm(ch.title);
  const fields=[c.chapter,c.chapterCode,c.chapterTitle,c.title,c.sourceUrl,c.file,c.id].map(norm);
  return fields.some(f=>f===code||f.includes(code)) || fields.some(f=>title && (f===title||f.includes(title)||title.includes(f))) || fields.some(f=>{const a=title.split(' ').filter(x=>x.length>3);const hits=a.filter(x=>f.includes(x)).length;return a.length>=2&&hits>=Math.min(3,a.length)});
}
function retrieve(q,context={},limit=10){
  if(!CORPUS.chunks?.length)return[];
  const level=context.level||'';
  const resolved=context.chapterCode?chapterCatalog(level).find(c=>c.code===context.chapterCode):resolveChapter(context.topic||q,level);
  if(resolved){
    const same=CORPUS.chunks.filter(c=>chunkMatchesChapter(c,resolved));
    if(same.length){
      return same.map((c,i)=>({...c,__order:Number(c.order??c.chunkIndex??c.index??i)})).sort((a,b)=>a.__order-b.__order).map(({__order,...c})=>c).slice(0,Math.max(limit,same.length));
    }
  }
  const is10=String(level).toLowerCase().includes('10');
  return CORPUS.chunks.map((c,i)=>({c,s:score(c,q)+(is10&&c.classKey==='class10'?2:0),i})).filter(x=>x.s>0).sort((a,b)=>b.s-a.s||a.i-b.i).slice(0,limit).map(x=>x.c);
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
  const plan=mins<=15?{slides:6,points:5,mode:'RAPID COMPLETE REVISION'}:mins<=30?{slides:9,points:5,mode:'COMPLETE UNDERSTANDING'}:mins<=45?{slides:11,points:6,mode:'DETAILED TEACHING'}:{slides:14,points:6,mode:'DEEP MASTERY'};
  const chapterInstruction=chapter?`EXACT CURRICULUM MATCH: Class ${chapter.classKey.replace('class','')} ${chapter.subjectName}, Chapter ${chapter.number}: ${chapter.title} (${chapter.code}). The lesson MUST follow the source sequence for this chapter.`:`NO EXACT CHAPTER MATCH: This is not a reason to fail. Teach the requested topic at the selected level using general subject knowledge. If it is outside the selected syllabus, state that briefly in the spoken explanation, but still teach the concept correctly. Do not fabricate an NCERT chapter.`;
  const prompt=`Build a complete live class for a real student.

Topic: ${topic}
Selected level: ${level}
Depth: ${depth}
Duration: ${mins} minutes
Language: ${language}
Mode: ${plan.mode}
Target slides: ${plan.slides}
Target bullets per slide: ${plan.points}

${chapterInstruction}

ORDERED NCERT EVIDENCE (use this order when an exact chapter matched)
${grounding(ret)}

NON-NEGOTIABLE RULES
1. Teach the actual requested topic, never generic advice.
2. If an exact chapter matched, follow the NCERT source order from first concept to last concept; do not jump around.
3. Do not repeat the same concept, definition, formula, example, analogy or conclusion.
4. The slide title is the only heading. Each point is a complete high-quality revision note. Do not make a tiny subheading plus a one-line explanation.
5. Notes must be information-dense enough to support serious revision: include the actual relationships, conditions, formula meanings, cases, cause-effect links and common traps supported by the source.
6. Speech must teach beyond the note: explain WHY/HOW, use natural conversation, and handle changed examples. Never read the note verbatim.
7. For Hinglish, write speech in natural Roman Hinglish as a human Indian teacher would actually speak. Do not write half Hindi and half English by mechanical translation.
8. If the topic is outside the selected class, do not throw an error. Adapt the prerequisites and difficulty to that class.
9. Duration changes coverage/depth, not filler.
10. Final questions must test concepts actually taught.
11. Output JSON only.`;
  const raw=await callHF([{role:'system',content:CLASS_SYSTEM},{role:'user',content:prompt}],Math.max(7500,mins*120));
  const obj=extractJSON(raw);
  let deck=Array.isArray(obj.deck)?obj.deck.map((s,i)=>({title:String(s?.title||`Concept ${i+1}`),say:String(s?.say||''),visual:String(s?.visual||'none'),points:Array.isArray(s?.points)?s.points.map(p=>Array.isArray(p)?[String(p[0]||''),String(p[1]||''),String(p[2]||'')]:[String(p?.title||p?.key||''),String(p?.detail||p?.note||p?.explanation||''),String(p?.speak||p?.speech||'')]).filter(p=>p[1]):[]})).filter(s=>s.points.length):[];
  deck=uniqueDeck(deck);
  const qs=Array.isArray(obj.examQuestions)?obj.examQuestions.map(x=>String(x).trim()).filter(Boolean).slice(0,4):[];
  if(qs.length)deck.push({title:String(obj.examTitle||'Exam Check'),say:'Let us finish by checking what you can actually apply.',visual:'none',points:qs.map((q,i)=>[`Question ${i+1}`,q,''])});
  if(!deck.length)throw Object.assign(new Error('No usable class was generated.'),{status:502});
  send(res,200,{deck,model:MODEL,grounded:Boolean(ret.length),chapter:chapter?{code:chapter.code,title:chapter.title,number:chapter.number}:null,sources:ret.map(c=>({chapter:c.chapter,chapterTitle:c.chapterTitle,sourceUrl:c.sourceUrl}))});
}catch(e){send(res,e.status||500,{error:e.message||'Could not generate the class.'})}}
const server=http.createServer(async(req,res)=>{try{if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type'});return res.end()}if(req.method==='POST'&&req.url==='/api/chat')return chat(req,res);if(req.method==='POST'&&req.url==='/api/class')return generateClass(req,res);if(req.method==='GET'&&req.url==='/api/corpus-status')return send(res,200,{indexedChunks:CORPUS.chunks?.length||0,generatedAt:CORPUS.generatedAt||null,source:CORPUS.source||null});if(req.method==='GET'&&(req.url==='/'||req.url==='/index.html'))return send(res,200,fs.readFileSync(path.join(__dirname,'index.html'),'utf8'),'text/html; charset=utf-8');if(req.method==='GET'&&req.url==='/manifest.webmanifest')return send(res,200,fs.readFileSync(path.join(__dirname,'manifest.webmanifest'),'utf8'),'application/manifest+json; charset=utf-8');if(req.method==='GET'&&req.url==='/sw.js')return send(res,200,fs.readFileSync(path.join(__dirname,'sw.js'),'utf8'),'application/javascript; charset=utf-8');if(req.method==='GET'&&req.url.startsWith('/icons/')){const f=path.join(__dirname,req.url.split('/').filter(Boolean).join('/'));if(fs.existsSync(f))return send(res,200,fs.readFileSync(f),req.url.endsWith('.png')?'image/png':'application/octet-stream');}if(req.method==='GET'&&req.url==='/health')return send(res,200,{ok:true,model:MODEL,aiConnected:Boolean(HF_TOKEN),corpusChunks:CORPUS.chunks?.length||0});send(res,404,{error:'Not found'})}catch(e){console.error(e);send(res,500,{error:e.message||'Server error'})}});server.listen(PORT,()=>console.log(`VYRA AI Classroom running at http://localhost:${PORT}`));
