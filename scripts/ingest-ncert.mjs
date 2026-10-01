import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pdf from 'pdf-parse';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const manifest=JSON.parse(await fs.readFile(path.join(root,'ncert','curriculum.json'),'utf8'));
const outDir=path.join(root,'corpus');
const pdfDir=path.join(outDir,'pdf');
await fs.mkdir(pdfDir,{recursive:true});
const chunks=[];
const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
const chunkText=(text,size=1100,overlap=160)=>{
  const words=clean(text).split(' ').filter(Boolean); const out=[];
  for(let i=0;i<words.length;i+=size-overlap){const part=words.slice(i,i+size).join(' ');if(part.length>120)out.push(part);if(i+size>=words.length)break;}
  return out;
};
for(const [classKey,subjects] of Object.entries(manifest.books)){
  for(const [subjectKey,book] of Object.entries(subjects)){
    for(const ch of book.chapters){
      const url=`https://ncert.nic.in/textbook/pdf/${ch.code}.pdf`;
      const file=path.join(pdfDir,`${ch.code}.pdf`);
      try{
        let buf;
        try{buf=await fs.readFile(file)}catch{const r=await fetch(url);if(!r.ok)throw new Error(`HTTP ${r.status}`);buf=Buffer.from(await r.arrayBuffer());await fs.writeFile(file,buf);}
        const parsed=await pdf(buf);
        const parts=chunkText(parsed.text);
        parts.forEach((text,i)=>chunks.push({id:`${classKey}:${subjectKey}:ch${ch.number}:c${i+1}`,classKey,subjectKey,chapter:ch.number,chapterTitle:ch.title,sourceUrl:url,text}));
        console.log(`OK ${ch.code}: ${parts.length} chunks`);
      }catch(e){console.error(`SKIP ${ch.code}: ${e.message}`)}
    }
  }
}
await fs.writeFile(path.join(outDir,'index.json'),JSON.stringify({generatedAt:new Date().toISOString(),source:'NCERT official PDFs',chunks},null,2));
console.log(`\nIndexed ${chunks.length} NCERT chunks.`);
