/* Atomic Sync 2 — integer cents, basis points, deterministic immutable imports. */
(function(root){
'use strict';
const fail=m=>{throw Error(m)}, clone=x=>JSON.parse(JSON.stringify(x));
const canonical=x=>JSON.stringify(sort(x));
function sort(x){return Array.isArray(x)?x.map(sort):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,sort(x[k])])):x}
function percent(value){if(value===''||value===null||value===undefined)fail('Percentuale mancante');const n=Number(value);if(!Number.isFinite(n)||n<0||n>100||Math.abs(n*100-Math.round(n*100))>1e-7)fail('Usa una percentuale tra 0 e 100, con massimo due decimali');return Math.round(n*100)}
function allocate(amount,weights){if(!Number.isSafeInteger(amount)||amount<=0||amount>1e10)fail('Importo non valido');const keys=Object.keys(weights);if(!keys.length||keys.some(k=>!Number.isInteger(weights[k])||weights[k]<0)||keys.reduce((n,k)=>n+weights[k],0)!==10000)fail('Le quote devono sommare al 100%');const rows=keys.map((k,i)=>({k,i,v:Math.floor(amount*weights[k]/10000),r:amount*weights[k]%10000}));let rest=amount-rows.reduce((n,x)=>n+x.v,0);for(const x of [...rows].sort((a,b)=>b.r-a.r||a.i-b.i)){if(rest-->0)x.v++}return Object.fromEntries(rows.map(x=>[x.k,x.v]))}
function twoShares(amount,members,payer,value){if(members.length!==2||!members.includes(payer))fail('La percentuale libera richiede due partecipanti');const b=percent(value);return allocate(amount,Object.fromEntries(members.map(n=>[n,n===payer?b:10000-b])))}
function balance(a,movements){const anchor=a.balanceDate;if(!anchor)return null;return Number(a.balance||0)+movements.filter(m=>m.account===a.name&&(m.date>anchor||m.date===anchor&&a.includeAnchorDay!==false)).reduce((n,m)=>n+(m.kind==='income'?m.amount:-m.amount),0)}
function familySummary(f,entries,name){
 const rows=entries.filter(x=>x.familyId===f.id);
 if(f.mode==='real')return {balance:Number(f.opening||0)+rows.reduce((n,x)=>n+Number(x.delta||0),0),position:null};
 const norm=value=>String(value||'').trim().toLocaleLowerCase('it-IT');
 const debt=f.openingDebt;
 const opening=debt&&Number.isSafeInteger(debt.amount)&&debt.amount>=0?(norm(debt.creditor)===norm(name)?debt.amount:0)-(norm(debt.debtor)===norm(name)?debt.amount:0):0;
 const position=rows.reduce((total,row)=>{total+=Object.entries(row.balanceCorrection||{}).reduce((v,[n,a])=>v+(norm(n)===norm(name)?a:0),0);return row.positions?total+Object.entries(row.positions).reduce((v,[n,a])=>v+(norm(n)===norm(name)?a:0),0):row.kind==='settlement'?total+(norm(row.debtor)===norm(name)?Number(row.amount||0):0)-(norm(row.creditor)===norm(name)?Number(row.amount||0):0):total+(norm(row.payer)===norm(name)?Number(row.amount||0):0)-Object.entries(row.shares||{}).reduce((sum,[member,amount])=>sum+(norm(member)===norm(name)?Number(amount||0):0),0)},opening);
 const totalSpent=rows.filter(row=>row.kind!=='settlement'&&!row.positions).reduce((total,row)=>total+Number(row.amount||0),0);
 return {balance:null,position,totalSpent,openingPosition:opening,openingDebt:debt||null,openingNeedsReview:!!f.hasOpeningBalance&&!debt};
}
function legacyFamily(data,name,profileId){
 const ledger=data.familyLedger||[],movements=data.movements||[];
 if(!ledger.length&&!movements.some(m=>m.sharedFamily&&!m.familySplit&&!m.familyId))return null;
 const norm=x=>String(x||'').trim().toLocaleLowerCase('it-IT');
 const other=ledger.map(x=>x.payer).find(n=>n&&norm(n)!==norm(name)&&!['io','me'].includes(norm(n)))||'Altro partecipante';
 const id='legacy-family:'+profileId,opening=ledger.find(x=>x.id==='opening'),amount=Number(opening?.amount)||0;
 const f={id,name:'Conto famiglia storico',mode:'virtual',members:[name,other],legacyOwner:name,opening:0,hasOpeningBalance:false,openingDebt:{amount:Math.abs(amount),creditor:amount>=0?name:other,debtor:amount>=0?other:name,date:opening?.date||movements.map(x=>x.date).sort()[0]||new Date().toISOString().slice(0,10)}};
 const entries=[];
 const shares=(a,pct)=>{const own=Math.round(a*Math.max(0,Math.min(100,Number(pct??50)))/100);return {[name]:own,[other]:a-own}};
 for(const m of movements)if(m.kind==='expense'&&m.sharedFamily&&!m.familySplit&&!m.familyId)entries.push({...m,id:'legacy-movement:'+m.id,familyId:id,mode:'virtual',kind:'split',payer:name,actor:name,shares:shares(m.amount,m.myShare),sourceMovementId:m.id,delta:0});
 for(const x of ledger){
  if(x.id==='opening')continue;
  const payer=['io','me',norm(name)].includes(norm(x.payer))?name:x.payer||other;
  const base={...x,id:'legacy-ledger:'+x.id,legacySourceId:x.id,familyId:id,mode:'virtual',payer,actor:name,account:x.bank||'',category:x.category||'Spese familiari',delta:0};
  const linked=movements.find(m=>m.sourceFamilyId===x.id||m.id==='family-shared:'+x.id||m.id==='family-settlement:'+x.id);if(linked)base.sourceMovementId=linked.id;
  if(['shared','wife'].includes(x.kind))entries.push({...base,kind:'split',shares:shares(x.amount,x.myShare)});
  else{const delta=x.kind==='wifeAdvance'?-x.amount:x.kind==='myAdvance'?x.amount:x.kind==='settlementReceived'?-x.amount:x.kind==='settlementPaid'?x.amount:x.kind==='adjustment'?x.amount:0;entries.push({...base,kind:'adjustment',positions:{[name]:delta,[other]:-delta}})}
 }
 for(const entry of entries){if(!entry.shares)continue;const desired=entry.payer===name?Math.round(entry.amount*(100-Number(entry.myShare??50))/100):-Math.round(entry.amount*Number(entry.myShare??50)/100);const current=(entry.payer===name?entry.amount:0)-entry.shares[name];const correction=desired-current;if(correction)entry.balanceCorrection={[name]:correction,[other]:-correction}}
 return {family:f,entries};
}
function validateExpense(x,identity){
 if(!x||typeof x.id!=='string'||! /^[a-zA-Z0-9:_-]{1,150}$/.test(x.id))fail('Identificativo movimento non valido');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(x.date)||Number.isNaN(Date.parse(x.date))||new Date(x.date).toISOString().slice(0,10)!==x.date)fail('Data non valida');
 if(!Number.isSafeInteger(x.amount)||x.amount<=0||x.amount>1e10)fail('Importo non valido');
 if(typeof x.description!=='string'||!x.description.trim()||x.description.length>240)fail('Descrizione non valida');
 if(x.profileId!==identity.profileId||x.householdId!==identity.householdId)fail('Il movimento appartiene a un altro profilo o famiglia');
 const shared=x.shared===true,f=shared?identity.families.find(f=>f.id===x.familyId):null;
 if(shared&&!f)fail('Conto famiglia non autorizzato o rimosso');
 const a=identity.accounts.find(a=>a.id===x.accountId);
 if((!shared||f.mode==='virtual')&&!a)fail('Conto personale non autorizzato o rimosso');
 if(shared&&f.mode==='real'&&x.accountId!==f.id)fail('Seleziona il conto cointestato per una spesa dal saldo condiviso');
 const weights=shared?x.weights:null;
 if(shared){if(!weights||Object.keys(weights).length!==f.members.length||f.members.some(n=>!Object.hasOwn(weights,n)))fail('Partecipanti o quote non validi');allocate(x.amount,weights)}
 return {id:x.id,householdId:identity.householdId,profileId:identity.profileId,date:x.date,amount:x.amount,description:x.description.trim(),category:String(x.category||'Altro').slice(0,120),accountId:shared&&f.mode==='real'?f.id:a.id,familyId:shared?f.id:null,shared,weights:weights?clone(weights):null};
}
function planExpense(x,identity){const clean=validateExpense(x,identity),f=identity.families.find(f=>f.id===clean.familyId),a=identity.accounts.find(a=>a.id===clean.accountId),id='mobile:'+identity.profileId+':'+clean.id;
 const shares=f?allocate(clean.amount,clean.weights):null;
 const personal=(!f||f.mode==='virtual')?{id,mobileSourceId:clean.id,date:clean.date,description:clean.description,amount:clean.amount,kind:'expense',category:clean.category,account:a.name,ownerProfile:identity.name,sourceMobile:true,scope:f?'Familiare':'Personale',sharedFamily:!!f,myShare:f?clean.weights[identity.name]/100:100,...(f?{familyId:f.id,familySplit:{weights:clean.weights},syncFamilyEntryId:id}:{})}:null;
 const family=f?{id,mobileSourceId:clean.id,familyId:f.id,mode:f.mode,date:clean.date,description:clean.description,amount:clean.amount,category:clean.category,actor:identity.name,payer:identity.name,shares,weights:clean.weights,scope:'Familiare',account:f.mode==='real'?f.name:a.name,delta:f.mode==='real'?-clean.amount:0,...(personal?{sourceMovementId:id}:{})}:null;
 return {clean,personal,family};
}
function migrateLegacy(raw){const d=clone(raw);if(!Array.isArray(d.expenses))fail('Archivio precedente non valido');return {schema:2,legacy:d,expenses:[],confirmed:[],history:[],identity:null,lastSync:null,issues:[],deviceId:crypto.randomUUID()}}
const api={legacyFamily,canonical,percent,allocate,twoShares,balance,familySummary,validateExpense,planExpense,migrateLegacy};root.AtomicCore=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
