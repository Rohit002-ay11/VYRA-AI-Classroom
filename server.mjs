import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const PORT=Number(process.env.PORT||8093), OPENROUTER_API_KEY=process.env.OPENROUTER_API_KEY||'', MODEL=process.env.OPENROUTER_MODEL||'nvidia/nemotron-3-ultra-550b-a55b:free', ELEVENLABS_API_KEY=process.env.ELEVENLABS_API_KEY||'', ELEVENLABS_VOICE_ID=process.env.ELEVENLABS_VOICE_ID||'', ELEVENLABS_MODEL=process.env.ELEVENLABS_MODEL||'eleven_multilingual_v2';
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
async function callAI(messages,max_tokens=3600){
  if(!OPENROUTER_API_KEY)throw Object.assign(new Error('VYRA AI is not connected.\nOPENROUTER_API_KEY is missing in the server environment.'),{status:500});
  const r=await fetch('https://openrouter.ai/api/v1/chat/completions',{
    method:'POST',
    headers:{Authorization:`Bearer ${OPENROUTER_API_KEY}`,'Content-Type':'application/json','HTTP-Referer':'https://vyra-ai-classroom.onrender.com','X-Title':'VYRA AI Classroom'},
    body:JSON.stringify({model:MODEL,messages,stream:false,max_tokens,temperature:0.45})
  });
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw Object.assign(new Error(d?.error?.message||d?.error||'OpenRouter AI provider returned an error.'),{status:r.status});
  const a=extractChatText(d);
  if(!a)throw Object.assign(new Error('The AI returned no text.'),{status:502});
  return a;
}
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
      seen.push(sig); pts.push([a,b,say]);
    }
    if(pts.length&&!clean.some(x=>sim(x.title,s.title)>.9))clean.push({...s,points:pts});
  }
  return clean;
}

const GENERIC_CLASS_PHRASES=[
  'build the idea','start with the core definition','connect it to a simple example','then add the deeper mechanism',
  'understand the mechanism','understand the concept','build a strong foundation','let us understand the idea',
  'core definition','deeper mechanism','simple example','key idea'
];
const STOPWORDS=new Set('the a an and or of to in on for with from by is are was were be been being this that these those it its as at into than then so such can could should would will may might do does did how what why when where which who whom about over under between through during before after their there here very more most some any each every only also not no yes you your our we they he she them his her its i me my'.split(/\s+/));
function contentTokens(s){return String(s||'').toLowerCase().replace(/[^a-z0-9\u0900-\u097F]+/gi,' ').split(/\s+/).filter(x=>x.length>=4&&!STOPWORDS.has(x));}
function tokenSet(s){return new Set(contentTokens(s));}
function overlap(a,b){const A=tokenSet(a),B=tokenSet(b);let n=0;for(const x of A)if(B.has(x))n++;return n/Math.max(1,Math.min(A.size,B.size));}
function genericHit(text){const t=String(text||'').toLowerCase();return GENERIC_CLASS_PHRASES.filter(x=>t.includes(x)).length;}
function sourceTerms(chunks){
  const counts=new Map();
  for(const c of chunks){for(const w of contentTokens(`${c.chapterTitle||''} ${c.text||''}`)){counts.set(w,(counts.get(w)||0)+1)}}
  return [...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,80).map(x=>x[0]);
}
function validateGroundedDeck(deck,ret,chapter,topic,level){
  if(!chapter)return {ok:true,reason:'open-topic'};
  if(!Array.isArray(deck)||deck.length<Math.min(5,ret.length+2))return {ok:false,reason:'too-few-slides'};
  const all=deck.map(s=>`${s.title} ${s.points.map(p=>`${p[0]} ${p[1]} ${p[2]}`).join(' ')}`).join(' ');
  const generic=genericHit(all);
  const src=ret.map(c=>`${c.chapterTitle||''} ${c.text||''}`).join(' ');
  const sourceWords=tokenSet(src), deckWords=tokenSet(all);
  let covered=0; for(const w of sourceWords)if(deckWords.has(w))covered++;
  const coverage=covered/Math.max(1,Math.min(sourceWords.size,90));
  const slideOverlaps=deck.map(s=>overlap(`${s.title} ${s.points.map(p=>p[1]).join(' ')}`,src));
  const usefulSlides=slideOverlaps.filter(x=>x>=0.08).length;
  const first=String(deck[0]?.title||'').toLowerCase()+' '+String(deck[0]?.points?.[0]?.[1]||'').toLowerCase();
  const badFirst=genericHit(first)>=1 || /laws? of reflection|fleming|right hand thumb|snell|formula|theorem/i.test(first) && !/what is|what are|means|refers to|phenomenon|observation|basic|first/i.test(first);
  const ok=generic===0 && coverage>=0.12 && usefulSlides>=Math.max(3,Math.floor(deck.length*.55)) && !badFirst;
  return {ok,reason:ok?'ok':`grounding validation failed: generic=${generic}, coverage=${coverage.toFixed(2)}, usefulSlides=${usefulSlides}/${deck.length}, badFirst=${badFirst}`};
}
function sourceDigest(ret){
  return ret.map((c,i)=>`SOURCE CHUNK ${i+1} | ${c.chapterTitle||''} | order=${c.order??c.chunkIndex??i}\n${String(c.text||'').slice(0,5000)}`).join('\n\n---\n\n');
}
async function chat(req,res){try{const b=await body(req),message=String(b.message||'').trim();if(!message)return send(res,400,{error:'Message is empty.'});const context=b.context||{},history=Array.isArray(b.history)?b.history.slice(-20):[],ret=retrieve(message+' '+(context.topic||''),context,8);const ctx=`Current classroom context:\n- Topic: ${context.topic||'none'}\n- Level: ${context.level||'not specified'}\n- Depth: ${context.depth||'not specified'}\n- Language: ${context.language||'English'}\n- Class active: ${context.classActive?'yes':'no'}`;const msgs=[{role:'system',content:SYSTEM+'\n\n'+ctx+'\n\nNCERT RETRIEVAL ('+ret.length+' chunks):\n'+grounding(ret)}];for(const m of history)if((m.role==='user'||m.role==='assistant')&&typeof m.content==='string')msgs.push({role:m.role,content:m.content.slice(0,8000)});msgs.push({role:'user',content:message});const answer=await callAI(msgs,3600);send(res,200,{answer,model:MODEL,grounded:Boolean(ret.length),sources:ret.map(c=>({chapter:c.chapter,chapterTitle:c.chapterTitle,sourceUrl:c.sourceUrl}))})}catch(e){send(res,e.status||500,{error:e.message||'Server error'})}}

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

async function generateClass(req,res){console.log('[CLASS] request received');try{
  const b=await body(req),topic=String(b.topic||'').trim()||'General Learning',level=String(b.level||'Class 10'),depth=String(b.depth||'Deep'),mins=Math.max(15,Math.min(60,Number(b.mins||30))),language=String(b.language||'English');
  const chapter=resolveChapter(topic,level); const retrievalContext={level,topic,chapterCode:chapter?.code||''};
  const ret=retrieve(topic+' '+level,retrievalContext,40);
  const plan=mins<=15?{slides:6,points:5,mode:'RAPID COHERENT REVISION'}:mins<=30?{slides:9,points:5,mode:'COMPLETE UNDERSTANDING'}:mins<=45?{slides:11,points:6,mode:'DETAILED TEACHING'}:{slides:14,points:6,mode:'DEEP MASTERY'};
  const chapterInstruction=chapter?`EXACT CHAPTER MATCH: ${chapter.classKey} / ${chapter.subjectName} / Chapter ${chapter.number||''}: ${chapter.title} (${chapter.code}). The local corpus contains ordered source chunks for this chapter. You MUST teach the actual source concepts, in source order. Do not replace them with a generic teaching template.`:`OPEN TOPIC MODE: No exact local chapter match exists. Teach the topic using broad subject knowledge at the selected level. Do not claim exact NCERT grounding.`;
  const digest=sourceDigest(ret);
  const sourceHint=chapter?`SOURCE-CONCEPT ANCHORS (use these actual source concepts, not generic placeholders): ${sourceTerms(ret).slice(0,60).join(', ')}`:'No exact local source anchors available.';
   const cbseLayer=(/^Class (9|10|11|12)$/i.test(level))?`CBSE EXAM LAYER: use current CBSE curriculum/SQP/MS style as an assessment-design guide. Official reference hub: https://cbseacademic.nic.in/ . Do not invent exact questions, marks or chapter weightage unless present in supplied evidence.`:'';
  const basePrompt=`Build a complete live class for a real student.

Topic: ${topic}\nSelected level: ${level}\nDepth: ${depth}\nDuration: ${mins} minutes\nLanguage: ${language}\nMode: ${plan.mode}\n\n${cbseLayer}\nTarget slides: ${plan.slides}\nTarget bullets per slide: ${plan.points}\n\n${chapterInstruction}\n\n${sourceHint}\n\nORDERED SOURCE EVIDENCE:\n${digest}\n\nMANDATORY LESSON ORDER\n1. ORIENTATION: first explain WHAT the topic/phenomenon is in plain language and what the student is going to learn.\n2. PREREQUISITES: explain only prerequisites actually needed.\n3. FOUNDATION: establish the physical/mathematical objects, setup, observation, vocabulary or basic situation.\n4. CORE SEQUENCE: follow the source chunks in order.\n5. DEEPEN: only after the foundation, introduce named laws, rules, formulas, derivations and advanced cases.\n6. APPLY: examples, cause-effect changes, problems and applications.\n7. CONSOLIDATE: misconceptions, distinctions and original exam questions based on taught content.\n\nNON-NEGOTIABLE CONTENT RULES\n- This is NOT a generic slide deck. Every slide must teach a concrete concept from the supplied source evidence when an exact chapter exists.\n- Do NOT use generic slide titles or generic filler. Never output phrases such as "Build the idea", "Start with the core definition", "Connect to a simple example", "Then add the deeper mechanism", "Key idea", or "Understand the concept" as the actual lesson content.\n- For an exact chapter, at least 70% of slide titles/notes must have clear semantic overlap with the supplied source concepts.\n- The first slide MUST explain the topic/phenomenon itself and its initial observation/setup. It must not begin with a later law, named rule, famous formula or advanced subtopic.\n- Do not skip source concepts just because a later concept is more famous.\n- Never invent a different chapter while answering the requested chapter.\n- Notes are actual study notes: definitions, relationships, conditions, cases, formula meanings, observations, examples and distinctions.\n- Speech teaches the concrete content and does not merely say how one should study it.\n- Each major concept appears once; do not repeat the same point under different wording.\n- Selected level changes depth: Class 9 concrete/basic; Class 10 strong conceptual + board application; Class 11 deeper mechanisms/math; Class 12 mature derivations/assumptions/graphs/edge cases.\n- Duration increases UNIQUE source coverage and depth, never filler.\n- Hinglish is natural Roman Indian classroom speech.\n- Output ONLY valid JSON with shape {chapter, deck:[{title,say,visual,points:[[key,note,speech]]}], examTitle, examQuestions}.`;

  let deck=[]; let bestDeck=[]; let bestScore=-1; let bestObj=null; let lastReason='';

  for(let attempt=1;attempt<=3;attempt++){
    const repair=attempt===1?'':"\\n\\nREPAIR ATTEMPT "+attempt+": The previous deck did not pass source validation. Reason: "+lastReason+". Rebuild from the ordered source chunks. Keep the class concrete, non-repetitive and genuinely useful. The first slide must teach the actual topic/observation/setup. Do not mention this repair instruction.";
    const raw=await callAI([{role:'system',content:CLASS_SYSTEM},{role:'user',content:basePrompt+repair}],Math.max(10000,mins*170));

    let obj;
    try{obj=extractJSON(raw)}catch(e){lastReason=e.message;continue;}

    deck=Array.isArray(obj.deck)?obj.deck.map((s,i)=>({
      title:String(s?.title||("Concept "+(i+1))),
      say:String(s?.say||''),
      visual:String(s?.visual||'none'),
      points:Array.isArray(s?.points)
        ? s.points.map(p=>Array.isArray(p)
          ? [String(p[0]||''),String(p[1]||''),String(p[2]||'')]
          : [String(p?.title||p?.key||''),String(p?.detail||p?.note||p?.explanation||''),String(p?.speak||p?.speech||'')])
          .filter(p=>p[1])
        : []
    })).filter(s=>s.points.length):[];

    deck=uniqueDeck(deck);
    if(deck.length){
      const validation=validateGroundedDeck(deck,ret,chapter,topic,level);
      lastReason=validation.reason;

      // Keep the strongest usable AI deck even if the validator is too strict.
      const all=deck.map(s=>s.title+" "+s.points.map(p=>p[0]+" "+p[1]).join(' ')).join(' ');
      const genericPenalty=genericHit(all)*20;
      const sourceOverlap=ret.length ? Math.max(...ret.map(c=>overlap(all,(c.chapterTitle||'')+" "+(c.text||'')))) : 0;
      const score=deck.length*10 + sourceOverlap*100 - genericPenalty;
      if(score>bestScore){bestScore=score;bestDeck=deck;bestObj=obj;}

      if(validation.ok){
        const qs=Array.isArray(obj.examQuestions)?obj.examQuestions.map(x=>String(x).trim()).filter(Boolean).slice(0,4):[];
        if(qs.length)deck.push({
          title:String(obj.examTitle||'Exam Check'),
          say:'Let us check what you can now explain and apply.',
          visual:'none',
          points:qs.map((q,i)=>["Question "+(i+1),q,''])
        });
        if(!deck.length)throw Object.assign(new Error('No usable class was generated.'),{status:502});
        return send(res,200,{
          deck,model:MODEL,grounded:Boolean(ret.length&&chapter),
          chapter:chapter?{code:chapter.code,title:chapter.title,number:chapter.number,subject:chapter.subjectName}:null,
          sources:ret.map(c=>({chapter:c.chapter,chapterTitle:c.chapterTitle,sourceUrl:c.sourceUrl}))
        });
      }
    }
  }

  // Do not show "Class unavailable" when the model produced a usable lesson.
  // The grounding validator is a quality gate, not a reason to discard the whole class.
  if(bestDeck.length){
    const exam=[...bestDeck];
    const questions=Array.isArray(bestObj?.examQuestions)?bestObj.examQuestions.map(x=>String(x).trim()).filter(Boolean).slice(0,4):[];
    if(questions.length) exam.push({
      title:String(bestObj?.examTitle||'Exam Check'),
      say:'Let us check what you can now explain and apply.',
      visual:'none',
      points:questions.map((q,i)=>["Question "+(i+1),q,''])
    });
    return send(res,200,{
      deck:exam,model:MODEL,grounded:Boolean(ret.length&&chapter),
      chapter:chapter?{code:chapter.code,title:chapter.title,number:chapter.number,subject:chapter.subjectName}:null,
      sources:ret.map(c=>({chapter:c.chapter,chapterTitle:c.chapterTitle,sourceUrl:c.sourceUrl})),
      qualityGate:'returned_best_usable_deck'
    });
  }

  throw Object.assign(new Error("VYRA could not build the class. "+lastReason),{status:502});
}catch(e){console.error('[CLASS] FAILED',e?.message||e);send(res,e.status||500,{error:e.message||'Could not generate the class.'})}}
const server=http.createServer(async(req,res)=>{try{if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type'});return res.end()}if(req.method==='POST'&&req.url==='/api/chat')return chat(req,res);if(req.method==='POST'&&req.url==='/api/tts')return tts(req,res);if(req.method==='POST'&&req.url==='/api/class')return generateClass(req,res);if(req.method==='GET'&&req.url==='/api/corpus-status')return send(res,200,{indexedChunks:CORPUS.chunks?.length||0,generatedAt:CORPUS.generatedAt||null,source:CORPUS.source||null});if(req.method==='GET'&&(req.url==='/'||req.url==='/index.html'))return send(res,200,fs.readFileSync(path.join(__dirname,'index.html'),'utf8'),'text/html; charset=utf-8');if(req.method==='GET'&&req.url==='/manifest.webmanifest')return send(res,200,fs.readFileSync(path.join(__dirname,'manifest.webmanifest'),'utf8'),'application/manifest+json; charset=utf-8');if(req.method==='GET'&&req.url==='/sw.js')return send(res,200,fs.readFileSync(path.join(__dirname,'sw.js'),'utf8'),'application/javascript; charset=utf-8');if(req.method==='GET'&&req.url.startsWith('/icons/')){const f=path.join(__dirname,req.url.split('/').filter(Boolean).join('/'));if(fs.existsSync(f))return send(res,200,fs.readFileSync(f),req.url.endsWith('.png')?'image/png':'application/octet-stream');}if(req.method==='GET'&&req.url==='/health')return send(res,200,{ok:true,model:MODEL,aiConnected:Boolean(OPENROUTER_API_KEY),premiumVoice:Boolean(ELEVENLABS_API_KEY&&ELEVENLABS_VOICE_ID),corpusChunks:CORPUS.chunks?.length||0});send(res,404,{error:'Not found'})}catch(e){console.error(e);send(res,500,{error:e.message||'Server error'})}});server.listen(PORT,()=>console.log(`VYRA AI Classroom running at http://localhost:${PORT}`));
