import kb from '../data/knowledge_base.json' with {type:'json'};
import {currentInvestmentFacts} from '../current-facts.mjs';
const currentIds=new Set(currentInvestmentFacts.map(f=>f.id));
const facts=[...currentInvestmentFacts,...kb.facts.filter(f=>!currentIds.has(f.id))];
const stop=new Set('what is the a an of to for in on do does can how are our your my and i we it if from about will this that with'.split(' '));
const words=s=>s.toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(x=>x.length>1&&!stop.has(x));
export function answerQuestion(question){if(typeof question!=='string'||question.trim().length<3||question.length>1000)throw new Error('Ask a question between 3 and 1,000 characters.');const query=words(question);const candidates=facts.map(f=>{const title=words(f.question),all=words(f.answer);return {f,score:query.reduce((n,w)=>n+(title.includes(w)?4:all.includes(w)?1:0),0)};}).filter(x=>x.score>=3).sort((a,b)=>b.score-a.score).slice(0,3);return {mode:'curated-record-search',reviewedAt:kb.reviewedAt,answer:candidates.length?'These project records address your question.':'That has not been confirmed in the project records. Please request a technical discussion.',matches:candidates.map(({f})=>({...f,sources:f.sourceIds.map(id=>({id,...kb.sources[id]}))}))};}
export function faqList(){return facts.map(f=>({id:f.id,question:f.question,answer:f.answer,status:f.status,reviewedAt:f.reviewedAt}));}
