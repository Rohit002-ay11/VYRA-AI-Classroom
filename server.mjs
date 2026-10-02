import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const PORT=Number(process.env.PORT||8093), HF_TOKEN=process.env.HF_TOKEN||'', MODEL=process.env.HF_MODEL||'openai/gpt-oss-120b:fastest', ELEVENLABS_API_KEY=process.env.ELEVENLABS_API_KEY||'', ELEVENLABS_VOICE_ID=process.env.ELEVENLABS_VOICE_ID||'', ELEVENLABS_MODEL=process.env.ELEVENLABS_MODEL||'eleven_multilingual_v2';
let CORPUS={chunks:[]}; try{CORPUS=JSON.parse(fs.readFileSync(path.join(__dirname,'corpus','index.json'),'utf8'))}catch{}
let CURRICULUM={}; try{CURRICULUM=JSON.parse(fs.readFileSync(path.join(__dirname,'ncert','curriculum.json'),'utf8'))}catch{}
const SYSTEM=`You are VYRA AI, a world-class human-like tutor and conversational academic companion. Understand what the student means and teach it clearly instead of merely outputting an answer.
CONVERSATION: Talk naturally and warmly. Treat casual messages, follow-ups, frustration, incomplete questions and corrections as part of a real conversation. Do not sound like a form, textbook, search engine or robotic tutor. Preserve conversation context. If the student says why, but then, I don't get it, or changes the example, continue from the exact idea being discussed.
TEACHING: Identify the student's goal and prerequisite gaps. Explain WHAT, WHY, HOW, WHEN/WHERE useful, and how to apply the idea. For hard problems reason step-by-step and verify the result. Advanced topics are allowed at any selected class level: the class selection controls the explanation level, not a hard whitelist. A Class 10 student asking about calculus must not receive an error; explain the prerequisites and calculus at an accessible level, then deepen it if asked.
NCERT: For Classes 9-12, supplied NCERT evidence is the primary grounding source for syllabus/content questions. Preserve chapter order when teaching a chapter. Explain in your own words; never copy long textbook passages. If the user asks beyond NCERT, distinguish NCERT-aligned material from additional explanation instead of refusing. Never invent NCERT quotes, pages, exercise numbers or syllabus claims.
LANGUAGE: English = natural English. Hindi = natural Hindi. Hinglish = natural Indian conversational Hinglish in Roman script, with English academic terms where natural. Do not translate sentence-by-sentence or alternate languages mechanically. Keep formulas and technical terms intact when that is clearer.
RESPONSE SHAPE: Simple question = concise. Normal concept = useful compact explanation. Difficult/multi-step = deeper structured teaching. Avoid giant walls and empty filler such as build the idea or understand the mechanism. For numericals show reasoning, substitution, units/signs and a quick verification. Use the current classroom context when provided.`;
const CLASS_SYSTEM=`You are VYRA's senior curriculum architect and an exceptional human teacher. Generate a REAL CONNECTED CLASS for a student, not a slideshow that jumps straight to famous laws or keywords.

UNIVERSAL TOPIC ACCESS: VYRA class mode must accept essentially ANY educational topic the student asks for. Never reject a topic merely because it is not listed in the selected class syllabus. The selected class controls language, prerequisite assumptions, mathematical maturity, examples, note density and depth — it is NOT a topic whitelist. If a Class 10 student asks calculus, quantum physics, a university idea, a language topic, a history topic, a computer-science topic, or an everyday concept, teach it at a Class 10-accessible level and build prerequisites instead of throwing an error.

CURRICULUM COVERAGE: For Classes 9-12, when an exact NCERT/CBSE chapter is available in the supplied corpus, that evidence is the primary source and the lesson MUST follow its actual chapter/subsection sequence. If the requested chapter is not yet in the local corpus, still teach it rather than failing; use reliable general knowledge, preserve the most likely curricular progression, and do NOT falsely claim that the lesson is NCERT-grounded. Never invent chapter numbers, quotations, exercise numbers or page references.

LESSON PEDAGOGY — NEVER JUMP STRAIGHT TO A LAW/FORMULA: Before introducing a named law, formula, theorem, reaction, rule or advanced subtopic, establish what the student is looking at. The normal progression is: (1) WHAT is the topic/phenomenon? (2) WHY does it matter / where do we see it? (3) required prerequisite idea(s); (4) the basic observation or setup; (5) the first core concept; (6) then laws/relationships/formulas; (7) cases, applications and problem solving; (8) misconceptions/traps; (9) concise exam consolidation. If the source chapter begins with a technical item, add a short prerequisite bridge in your own teaching voice before that item. Do not fabricate that bridge as NCERT text.

SEQUENCE: For an exact chapter match, preserve the source order at the concept/subsection level. Do not reorder merely because a later concept is more famous. You may insert a short prerequisite explanation immediately before a source concept when necessary for understanding. Cover the chapter broadly according to duration. Each major concept should appear once.

LEVEL LADDER: Class 9 = concrete intuition, basic vocabulary, simple relationships and examples. Class 10 = strong conceptual foundation, standard formulas/cases and board-style application. Class 11 = deeper mechanisms, mathematical structure, derivations where appropriate and multi-step reasoning. Class 12 = mature conceptual treatment, derivations, assumptions, graphs, edge cases and advanced application where relevant. If a topic is outside the class, keep the same topic but adapt its prerequisites and depth to this ladder.

DURATION: 15 min = rapid but coherent chapter/topic revision, still beginning with the essential foundation. 30 min = complete understanding of the core sequence plus applications. 45 min = detailed teaching with worked reasoning and common misconceptions. 60 min = deep mastery with broader coverage, derivations/cases and stronger exam application where appropriate. Longer duration means more UNIQUE concepts and deeper reasoning, never filler or repeated explanations.

NOTES: The slide title is the ONLY heading. Never make a second mini-heading for every bullet. Every bullet must be a dense, useful study note: define the idea, state the important relationship/condition, include formula meaning, case, cause-effect or distinction when relevant. Notes should be understandable later without hearing the speech. Avoid vague lines like 'understand the concept', 'build the idea', 'connect to an example'. Avoid giant paragraphs. Prefer 4-7 strong bullets per slide, but use fewer when the concept genuinely needs space.

TEACHER SPEECH: Each point gets separate natural speech. Teach like a brilliant human Indian teacher: explain the idea before naming the rule, connect it to something familiar, then deepen it. Vary sentence structure. Anticipate the likely next confusion. Use changed examples that demonstrate the same underlying rule. Never read the note verbatim. Never start every point with the same transition. Hinglish must be natural Roman Hinglish, not mechanical sentence-by-sentence translation.

PROBLEM SOLVING: For numericals, explain what the quantities mean before choosing a formula; identify givens, unknown, governing relation, substitution, units/signs and verification. For conceptual subjects, explain cause → effect and what changes when conditions change.

EXAM: End with a small set of strong original questions based only on what was actually taught. For board classes, make the final questions useful for revision. Do not call anything a historical PYQ unless verified from supplied evidence.

OUTPUT ONLY VALID JSON. Shape: {chapter, deck:[{title,say,visual,points:[[key,note,speech]]}], examTitle, examQuestions}. The key is only an internal label; the note itself must contain the actual study content.`
function send(res,status,data,type='application/json; charset=utf-8'){res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store'});res.end(type.startsWith('application/json')?JSON.stringify(data):data)}
function body(req){return new Promise((resolve,reject)=>{let b='';req.on('data',c=>{b+=c;if(b.length>2e6)req.destroy()});req.on('end',()=>{try{resolve(JSON.parse(b||'{}'))}catch(e){reject(e)}});req.on('error',reject)})}
function extractChatText(d){return String(d?.choices?.[0]?.message?.content||'').trim()}
function extractJSON(t){let x=String(t||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();try{return JSON.parse(x)}catch{}const a=x.indexOf('{'),b=x.lastIndexOf('}');if(a>=0&&b>a)try{return JSON.parse(x.slice(a,b+1))}catch{}throw new Error('AI returned invalid class JSON.')}
async function callHF(messages,max_tokens=3600){if(!HF_TOKEN)throw Object.assign(new Error('VYRA AI is not connected. HF_TOKEN is missing in this Termux session.'),{status:500});const r=await fetch('https://router.huggingface.co/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${HF_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({model:MODEL,messages,stream:false,max_tokens})});const d=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(d?.error?.message||d?.error||'Hugging Face AI provider returned an error.'),{status:r.status});const a=extractChatText(d);if(!a)throw Object.assign(new Error('The AI returned no text.'),{status:502});return a}
function words(s){return new Set(String(s||'').toLowerCase().replace(/[^a-z0-9\u0900-\u097F]+/gi,' ').split(/\s+/).filter(x=>x.length>2))}
function score(c,q){const qW=words(q),tW=words(`${c.chapterTitle} ${c.text}`);let n=0;for(const w of qW)if(tW.has(w))n++;const ql=String(q).toLowerCase(),tl=String(c.chapterTitle).toLowerCase();if(ql.includes(tl)||tl.includes(ql))n+=8;return n}
function classKeyFromLevel(level){const m=String(level||'').toLowerCase().replace(/\s+/g,'').match(/class(9|10|11|12)/);return m?`class${m[1]}`:'';}
function chapterCatalog(level){
  const ck=classKeyFromLevel(level); if(!ck)return [];
  const out=[]; const seen=new Set();
  const books=CURRICULUM?.books?.[ck]||{};
  for(const [subjectKey,b] of Object.entries(books)) for(const ch of (b.chapters||[])){const x={...ch,classKey:ck,subjectKey,subjectName:b.name}; const id=`${ck}|${String(ch.code||ch.title).toLowerCase()}`; if(!seen.has(id)){seen.add(id);out.push(x);}}
  // If the local corpus contains chapters not yet listed in curriculum.json, make them discoverable too.
  for(const c of (CORPUS.chunks||[])){
    if(String(c.classKey||'').toLowerCase()!==ck)continue;
    const title=String(c.chapterTitle||c.chapter||'').trim(), code=String(c.chapterCode||c.chapter||'').trim();
    if(!title&&!code)continue; const id=`${ck}|${(code||title).toLowerCase()}`; if(seen.has(id))continue;
    seen.add(id); out.push({number:c.chapterNumber||c.number||'',title:title||code,code:code||title,classKey:ck,subjectKey:c.subjectKey||'general',subjectName:c.subjectName||c.subjectKey||'General'});
  }
  return out;
}
function corpusChapterCatalog(level){
  const ck=classKeyFromLevel(level); if(!ck)return []; const out=[]; const seen=new Set();
  for(const c of (CORPUS.chunks||[])){if(String(c.classKey||'').toLowerCase()!==ck)continue;const title=String(c.chapterTitle||c.chapter||'').trim(),code=String(c.chapterCode||c.chapter||'').trim();const id=`${ck}|${(code||title).toLowerCase()}`;if(!title&&!code||seen.has(id))continue;seen.add(id);out.push({number:c.chapterNumber||c.number||'',title:title||code,code:code||title,classKey:ck,subjectKey:c.subjectKey||'general',subjectName:c.subjectName||c.subjectKey||'General'});} return out;
}
function resolveChapter(topic,level){
  const q=norm(topic); const chapters=[...chapterCatalog(level),...corpusChapterCatalog(level)]; let best=null,bestScore=0;
  for(const ch of chapters){
    const title=norm(ch.title),code=norm(ch.code); if(!title&&!code)continue; let sc=0;
    if(title&&(q===title||q.includes(title)))sc=Math.max(sc,title.length+40);
    if(code&&(q===code||q.includes(code)))sc=Math.max(sc,50);
    const toks=title.split(/\s+/).filter(x=>x.length>2); const hits=toks.filter(t=>q.includes(t)).length; if(toks.length)sc=Math.max(sc,hits*5);
    const first=(title.split(/[-:]/)[0]||'').trim(); if(first&&q===first)sc+=25;
    if(sc>bestScore){bestScore=sc;best=ch;}
  } return bestScore>=5?best:null;
}
function norm(s){return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
function chunkMatchesChapter(c,ch){
  if(!ch)return false; const code=norm(ch.code),title=norm(ch.title); const fields=[c.chapter,c.chapterCode,c.chapterTitle,c.title,c.sourceUrl,c.file,c.id].map(norm);
  return fields.some(f=>code&&(f===code||f.includes(code))) || fields.some(f=>title&&(f===title||f.includes(title)||title.includes(f))) || fields.some(f=>{const a=title.split(' ').filter(x=>x.length>3);const hits=a.filter(x=>f.includes(x)).length;return a.length>=2&&hits>=Math.min(3,a.length)});
}
function retrieve(q,context={},limit=10){
  if(!CORPUS.chunks?.length)return[]; const level=context.level||''; const resolved=context.chapterCode?chapterCatalog(level).find(c=>norm(c.code)===norm(context.chapterCode)):resolveChapter(context.topic||q,level);
  if(resolved){const same=CORPUS.chunks.filter(c=>chunkMatchesChapter(c,resolved));if(same.length)return same.map((c,i)=>({...c,__order:Number(c.order??c.chunkIndex??c.index??i)})).sort((a,b)=>a.__order-b.__order).map(({__order,...c})=>c).slice(0,Math.max(limit,same.length));}
  const ck=classKeyFromLevel(level); return CORPUS.chunks.map((c,i)=>({c,s:score(c,q)+(ck&&c.classKey===ck?2:0),i})).filter(x=>x.s>0).sort((a,b)=>b.s-a.s||a.i-b.i).slice(0,limit).map(x=>x.c);
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

async function tts(req,res){
  try{
    if(!ELEVENLABS_API_KEY||!ELEVENLABS_VOICE_ID) return send(res,503,{error:'Premium neural voice is not configured.'});
    const b=await body(req);
    const text=String(b.text||'').trim();
    if(!text) return send(res,400,{error:'Text is empty.'});
    const r=await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(ELEVENLABS_VOICE_ID)}?output_format=mp3_44100_128`,{
      method:'POST',
      headers:{'xi-api-key':ELEVENLABS_API_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({text,model_id:ELEVENLABS_MODEL,voice_settings:{stability:0.48,similarity_boost:0.82,style:0.18,use_speaker_boost:true}})
    });
    if(!r.ok){const msg=await r.text(); throw Object.assign(new Error(msg||'Premium voice request failed'),{status:r.status});}
    const audio=Buffer.from(await r.arrayBuffer());
    res.writeHead(200,{'Content-Type':'audio/mpeg','Content-Length':String(audio.length),'Cache-Control':'no-store'});
    return res.end(audio);
  }catch(e){
    console.error('TTS error:',e.message);
    return send(res,e.status||500,{error:e.message||'TTS error'});
  }
}

async function generateClass(req,res){try{
  const b=await body(req),topic=String(b.topic||'').trim()||'General Learning',level=String(b.level||'Class 10'),depth=String(b.depth||'Deep'),mins=Math.max(15,Math.min(60,Number(b.mins||30))),language=String(b.language||'English');
  const chapter=resolveChapter(topic,level); const retrievalContext={level,topic,chapterCode:chapter?.code||''}; const ret=retrieve(topic+' '+level,retrievalContext,20);
  const plan=mins<=15?{slides:6,points:5,mode:'RAPID COHERENT REVISION'}:mins<=30?{slides:9,points:5,mode:'COMPLETE UNDERSTANDING'}:mins<=45?{slides:11,points:6,mode:'DETAILED TEACHING'}:{slides:14,points:6,mode:'DEEP MASTERY'};
  const chapterInstruction=chapter?`EXACT CHAPTER MATCH: ${chapter.classKey} / ${chapter.subjectName} / Chapter ${chapter.number||''}: ${chapter.title} (${chapter.code}). Follow the supplied source in order. Do not skip the opening concepts merely because a later law/formula is more famous.`:`OPEN TOPIC MODE: No exact local chapter match exists. DO NOT FAIL and DO NOT SAY THE TOPIC IS UNSUPPORTED. Teach the topic using broad subject knowledge at the selected level. If the student asks for a known NCERT/CBSE chapter that is not locally indexed, be honest that the local corpus is not available for exact source-grounding, while still teaching the material correctly.`;
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

ORDERED SOURCE EVIDENCE (when present)
${grounding(ret)}

TEACHING ARC — MANDATORY
A. ORIENTATION: Begin by telling the student what the topic is in plain language and what they are going to learn. If useful, give a tiny real-world intuition.
B. PREREQUISITES: Surface only the prerequisite ideas actually needed. Explain them before using the advanced term/law/formula.
C. FOUNDATION: Establish the basic objects, quantities, vocabulary, setup or phenomenon.
D. CORE SEQUENCE: Move through the chapter/topic in logical curricular order. For an exact chapter match, mirror the supplied NCERT sequence.
E. DEEPEN: Only after the idea is understood, introduce laws, formulas, derivations, cases, graphs, mechanisms and applications.
F. APPLY: Work through representative examples/problems when relevant.
G. CONSOLIDATE: misconceptions, distinctions, exam-useful relationships and final questions.

STRICT RULES
1. The student must understand WHAT the thing is before being asked to remember WHAT LAW governs it. Do not open a Light class with 'laws of reflection' unless the opening itself has first established light/rays/reflecting surface and the phenomenon.
2. Exact chapter match = preserve source sequence. You may insert short prerequisite bridges before a source concept; label them as explanation, not as NCERT text.
3. Every slide should advance the lesson. Never repeat a concept just to fill duration.
4. Slide title is the ONLY heading. Each point is one strong, self-contained revision bullet; no mini-heading + tiny detail pattern.
5. Notes should be high quality and information-dense: actual definitions, relationships, conditions, cases, formula meaning, cause-effect, examples or distinctions. Avoid generic teaching filler.
6. Speech must explain the notes, not read them. It should sound like a human teacher thinking with the student, including natural questions such as 'why does that happen?' only when useful.
7. Match the selected level aggressively: do not explain Class 12 material like Class 9; do not drown Class 9 in unnecessary formalism. Increase mathematical and conceptual depth from 9 → 10 → 11 → 12.
8. Any topic is allowed. If it is outside the selected syllabus, adapt it instead of rejecting it.
9. For every subject: science, mathematics, social sciences, languages, computer science, commerce, arts/humanities and other academic topics, use the same foundation → sequence → application pedagogy.
10. Duration changes UNIQUE coverage and depth.
11. Hinglish = natural Roman Indian classroom speech, not literal translation.
12. Final questions must test concepts actually taught.
13. Output JSON only.`;
  const raw=await callHF([{role:'system',content:CLASS_SYSTEM},{role:'user',content:prompt}],Math.max(8000,mins*140)); const obj=extractJSON(raw);
  let deck=Array.isArray(obj.deck)?obj.deck.map((s,i)=>({title:String(s?.title||`Concept ${i+1}`),say:String(s?.say||''),visual:String(s?.visual||'none'),points:Array.isArray(s?.points)?s.points.map(p=>Array.isArray(p)?[String(p[0]||''),String(p[1]||''),String(p[2]||'')]:[String(p?.title||p?.key||''),String(p?.detail||p?.note||p?.explanation||''),String(p?.speak||p?.speech||'')]).filter(p=>p[1]):[]})).filter(s=>s.points.length):[];
  deck=uniqueDeck(deck); const qs=Array.isArray(obj.examQuestions)?obj.examQuestions.map(x=>String(x).trim()).filter(Boolean).slice(0,4):[]; if(qs.length)deck.push({title:String(obj.examTitle||'Exam Check'),say:'Let us check what you can now explain and apply.',visual:'none',points:qs.map((q,i)=>[`Question ${i+1}`,q,''])});
  if(!deck.length)throw Object.assign(new Error('No usable class was generated.'),{status:502}); send(res,200,{deck,model:MODEL,grounded:Boolean(ret.length&&chapter),chapter:chapter?{code:chapter.code,title:chapter.title,number:chapter.number,subject:chapter.subjectName}:null,sources:ret.map(c=>({chapter:c.chapter,chapterTitle:c.chapterTitle,sourceUrl:c.sourceUrl}))});
}catch(e){send(res,e.status||500,{error:e.message||'Could not generate the class.'})}}
const server=http.createServer(async(req,res)=>{try{if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type'});return res.end()}if(req.method==='POST'&&req.url==='/api/chat')return chat(req,res);if(req.method==='POST'&&req.url==='/api/tts')return tts(req,res);if(req.method==='POST'&&req.url==='/api/class')return generateClass(req,res);if(req.method==='GET'&&req.url==='/api/corpus-status')return send(res,200,{indexedChunks:CORPUS.chunks?.length||0,generatedAt:CORPUS.generatedAt||null,source:CORPUS.source||null});if(req.method==='GET'&&(req.url==='/'||req.url==='/index.html'))return send(res,200,fs.readFileSync(path.join(__dirname,'index.html'),'utf8'),'text/html; charset=utf-8');if(req.method==='GET'&&req.url==='/manifest.webmanifest')return send(res,200,fs.readFileSync(path.join(__dirname,'manifest.webmanifest'),'utf8'),'application/manifest+json; charset=utf-8');if(req.method==='GET'&&req.url==='/sw.js')return send(res,200,fs.readFileSync(path.join(__dirname,'sw.js'),'utf8'),'application/javascript; charset=utf-8');if(req.method==='GET'&&req.url.startsWith('/icons/')){const f=path.join(__dirname,req.url.split('/').filter(Boolean).join('/'));if(fs.existsSync(f))return send(res,200,fs.readFileSync(f),req.url.endsWith('.png')?'image/png':'application/octet-stream');}if(req.method==='GET'&&req.url==='/health')return send(res,200,{ok:true,model:MODEL,aiConnected:Boolean(HF_TOKEN),premiumVoice:Boolean(ELEVENLABS_API_KEY&&ELEVENLABS_VOICE_ID),corpusChunks:CORPUS.chunks?.length||0});send(res,404,{error:'Not found'})}catch(e){console.error(e);send(res,500,{error:e.message||'Server error'})}});server.listen(PORT,()=>console.log(`VYRA AI Classroom running at http://localhost:${PORT}`));
