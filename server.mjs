import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const PORT=Number(process.env.PORT||8093), HF_TOKEN=process.env.HF_TOKEN||'', MODEL=process.env.HF_MODEL||'openai/gpt-oss-120b:fastest';
let CORPUS={chunks:[]}; try{CORPUS=JSON.parse(fs.readFileSync(path.join(__dirname,'corpus','index.json'),'utf8'))}catch{}
let CURRICULUM={}; try{CURRICULUM=JSON.parse(fs.readFileSync(path.join(__dirname,'ncert','curriculum.json'),'utf8'))}catch{}
const SYSTEM=`You are VYRA AI, an exceptionally capable teacher, explainer and academic mentor. Your job is to make the student understand, not memorize sentences.
RESPONSE CALIBRATION: Answer directly first. Simple factual questions are concise. Normal concepts get enough explanation to build understanding. Difficult or multi-step questions get structured depth. Never pad a simple answer and never make a difficult idea shallow.
LANGUAGE CONTRACT: The selected classroom language is binding. English = natural English. Hindi = natural Hindi in Devanagari. Hinglish = natural Indian Hinglish written in LATIN SCRIPT ONLY; do not switch whole sentences into Hindi, do not use Devanagari, and do not translate English sentences word-for-word. Use Hindi naturally for explanation and English naturally for scientific terms, formulas and standard terminology. Tamil/Telugu use their selected language naturally. Preserve formulas, symbols and scientific names accurately.
NCERT-FIRST SCHOOL MODE: For Classes 9-12, supplied NCERT evidence is the primary authority for syllabus content. Retrieve and use the exact requested chapter whenever possible. Treat evidence as grounding, then teach it in your own words. Do not invent NCERT chapter facts, definitions, formulas, tables or activities. You may explain a concept with a clearly labelled general-world example when it improves understanding, but do not pretend that extra information is NCERT text. If the user asks to go beyond NCERT, clearly separate NCERT core from extension knowledge.
TEACHER BEHAVIOUR: Teach WHAT, WHY, HOW, WHEN/WHERE IT APPLIES, and HOW TO USE IT in a question. Connect new ideas to prerequisites. Explain cause-and-effect and intuition before asking the student to remember a rule. For numericals, identify givens, choose the principle, substitute carefully, calculate, check units/signs and interpret the answer. For diagrams/ray cases, explain what each part means and why it changes.
MEMORY: Do not rely on rote memorisation. Give a compact rule only after the student understands the reason behind it. When useful, give a short mental model or analogy and then map it back to the scientific rule.
FOLLOW-UP CONTEXT: Remember what has already been taught in the conversation and do not restart from zero or repeat the same explanation unless the student asks for revision.`;

const CLASS_SYSTEM=`You are VYRA's senior NCERT curriculum architect and an exceptional human classroom teacher. Build lessons that feel like a brilliant teacher is thinking with the student, not reading AI-generated cards.
SOURCE HIERARCHY: For Class 9-12 school lessons, exact retrieved NCERT evidence is the core syllabus authority. Use the full retrieved chapter evidence, not just the first few chunks. If the exact chapter is present in the corpus, NEVER output an "insufficient evidence" lesson. If retrieval is genuinely empty, return a concise error-style JSON message rather than a fake teaching slide. Never fabricate NCERT content.
COMPLETENESS: Teach the requested topic as a connected knowledge map. Cover every major concept, definition, law/rule, relationship, condition/case, formula, sign convention, standard diagram/ray case, worked-example pattern, application, common misconception and exam-relevant connection that belongs to the requested chapter and is supported by evidence. Do not repeat a concept just to fill time. Longer duration means deeper reasoning, more cases, more examples and more practice—not repeated wording.
UNDERSTANDING FIRST: For each concept, make the student understand what it means, why it is true/needed, how it works, when it applies, and how to use it. Do not ask the student to memorize an isolated sentence. If there is a formula, explain every symbol and the physical meaning, then show how to choose and use it. If there is a classification/table, explain the pattern and decision rule. If there is a diagram, explain the geometry and why the image/result changes.
LESSON FLOW: prerequisite -> concept -> why -> how -> example/application -> common trap -> exam use -> next unique concept. Do not use a generic template mechanically; change the flow when the subject demands it.
NOTES: Notes are for a student to read while listening. Make them visually scannable and content-dense: a medium title, then short meaningful points. Prefer 4-7 points per teaching slide when evidence supports it. A point should contain the actual concept, relation, formula, case or conclusion—not motivational filler. Avoid giant headings, one-line vague notes and paragraph walls. Use standard symbols such as u, v, f, R, m, n when relevant and explain them in speech.
SPEECH: Every point gets a separate teacher explanation. Speech must add understanding beyond the note without reading it verbatim. Vary sentence openings and rhythm. Use natural conversational phrasing, concrete intuition, cause-and-effect, and changed examples. Never begin every point with the same phrase. Never use filler such as 'build the idea', 'understand the mechanism', 'keep this in mind', 'quick check', or 'here is the picture' as a substitute for teaching.
HINGLISH: When Language=Hinglish, every title, note, say and exam question must be natural Hinglish in LATIN SCRIPT ONLY. Hindi words should be integrated naturally with English scientific terminology. Do NOT produce Devanagari. Do NOT alternate entire Hindi and English sentences mechanically. Use a natural Indian classroom rhythm: explain the concept in easy Hinglish, keep technical terms in standard English, and switch between the two within the same sentence when natural.
DEPTH: Quick = high-yield rapid revision but still complete across the requested chapter. Deep = full conceptual teaching. Mastery = deep conceptual teaching plus edge cases, misconceptions, worked reasoning and exam-level application. Respect the selected duration: 15 min compresses breadth; 30/45/60 min expands depth and practice.
EXAM: End with 3-4 original important/PYQ-style questions based only on concepts actually covered. Never call them historical PYQs unless the corpus verifies that. For numerical chapters, include at least one reasoning/calculation pattern when supported.
OUTPUT ONLY VALID JSON: {"chapter":"...","deck":[{"title":"...","say":"natural spoken slide transition","visual":"none","points":[["key","NCERT-grounded note","natural spoken teacher explanation"]]}],"examTitle":"PYQs + Important Questions","examQuestions":["..."]}`;

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
    const same=CORPUS.chunks.filter(c=>{
      const code=String(c.code||c.chapterCode||'').toLowerCase();
      const source=String(c.sourceUrl||'').toLowerCase();
      const ch=String(c.chapter||'');
      return code===String(resolved.code).toLowerCase() || source.includes(`/${String(resolved.code).toLowerCase()}.pdf`) || (ch===String(resolved.number) && String(c.classKey||'').toLowerCase()===String(resolved.classKey).toLowerCase() && String(c.subjectKey||'').toLowerCase()===String(resolved.subjectKey).toLowerCase());
    });
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
  const objText=JSON.stringify(obj).toLowerCase();
  const evidenceExists=ret.length>0;
  if(evidenceExists && /insufficient ncert evidence|corpus does not contain|provided ncert corpus does not contain/.test(objText)){
    const retryPrompt=prompt+`\n\nHARD CORRECTION: The corpus contains verified evidence for the requested chapter. Do NOT mention insufficient evidence and do NOT create an error/question slide. Teach the actual chapter using that evidence. Start with the chapter's first real concept and continue through the unique concepts supported by the evidence.`;
    const retry=await callHF([{role:'system',content:CLASS_SYSTEM},{role:'user',content:retryPrompt}],Math.max(7000,plan.words+1800));
    Object.assign(obj,extractJSON(retry));
  }
  let deck=Array.isArray(obj.deck)?obj.deck.map((s,i)=>({title:String(s?.title||`Concept ${i+1}`),say:String(s?.say||''),visual:String(s?.visual||'none'),points:Array.isArray(s?.points)?s.points.map(p=>Array.isArray(p)?[String(p[0]||''),String(p[1]||''),String(p[2]||'')]:[String(p?.title||p?.key||''),String(p?.detail||p?.explanation||''),String(p?.speak||p?.speech||'')]).filter(p=>p[0]&&p[1]):[]})).filter(s=>s.points.length):[];
  deck=uniqueDeck(deck);
  const qs=Array.isArray(obj.examQuestions)?obj.examQuestions.map(x=>String(x).trim()).filter(Boolean).slice(0,4):[];
  if(qs.length)deck.push({title:String(obj.examTitle||'Rapid Revision · Exam Check'),say:'Let us finish by checking the concepts we just covered.',visual:'none',points:qs.map((q,i)=>[`Question ${i+1}`,q])});
  if(!deck.length)throw Object.assign(new Error('No usable class was generated.'),{status:502});
  send(res,200,{deck,model:MODEL,grounded:Boolean(ret.length),chapter:chapter?{code:chapter.code,title:chapter.title,number:chapter.number}:null,sources:ret.map(c=>({chapter:c.chapter,chapterTitle:c.chapterTitle,sourceUrl:c.sourceUrl}))});
}catch(e){send(res,e.status||500,{error:e.message||'Could not generate the class.'})}}
const server=http.createServer(async(req,res)=>{try{if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type'});return res.end()}if(req.method==='POST'&&req.url==='/api/chat')return chat(req,res);if(req.method==='POST'&&req.url==='/api/class')return generateClass(req,res);if(req.method==='GET'&&req.url==='/api/corpus-status')return send(res,200,{indexedChunks:CORPUS.chunks?.length||0,generatedAt:CORPUS.generatedAt||null,source:CORPUS.source||null});if(req.method==='GET'&&(req.url==='/'||req.url==='/index.html'))return send(res,200,fs.readFileSync(path.join(__dirname,'index.html'),'utf8'),'text/html; charset=utf-8');if(req.method==='GET'&&req.url==='/manifest.webmanifest')return send(res,200,fs.readFileSync(path.join(__dirname,'manifest.webmanifest'),'utf8'),'application/manifest+json; charset=utf-8');if(req.method==='GET'&&req.url==='/sw.js')return send(res,200,fs.readFileSync(path.join(__dirname,'sw.js'),'utf8'),'application/javascript; charset=utf-8');if(req.method==='GET'&&req.url.startsWith('/icons/')){const f=path.join(__dirname,req.url.split('/').filter(Boolean).join('/'));if(fs.existsSync(f))return send(res,200,fs.readFileSync(f),req.url.endsWith('.png')?'image/png':'application/octet-stream');}if(req.method==='GET'&&req.url==='/health')return send(res,200,{ok:true,model:MODEL,aiConnected:Boolean(HF_TOKEN),corpusChunks:CORPUS.chunks?.length||0});send(res,404,{error:'Not found'})}catch(e){console.error(e);send(res,500,{error:e.message||'Server error'})}});server.listen(PORT,()=>console.log(`VYRA AI Classroom running at http://localhost:${PORT}`));
