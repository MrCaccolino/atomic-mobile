(function(){'use strict';
const $=id=>document.getElementById(id),C=AtomicCore,T=AtomicTransport,CONF=ATOMIC_SYNC_CONFIG,KEY='atomic-mobile-qr-fresh-20261118',OLD='fws-mobile-dev-v117',eur=n=>(n/100).toLocaleString('it-IT',{style:'currency',currency:'EUR'});let data,busy=false;
function message(s){$('message').textContent=s}
function write(next){const raw=JSON.stringify(next);localStorage.setItem(KEY,raw);if(localStorage.getItem(KEY)!==raw)throw Error('Verifica salvataggio non riuscita');data=next}
function mutate(fn){const next=structuredClone(data);fn(next);write(next)}
function initial(){const raw=localStorage.getItem(KEY);if(raw){const d=JSON.parse(raw);if(d.schema!==2||!Array.isArray(d.expenses)||!Array.isArray(d.confirmed))throw Error('Archivio non riconosciuto. I dati non sono stati modificati.');return d}const d={schema:2,deviceId:crypto.randomUUID(),identity:null,expenses:[],confirmed:[],history:[],lastSync:null,issues:[]};write(d);return d}
function pending(){return data.expenses.filter(x=>!data.confirmed.includes(x.id))}
function render(){const i=data.identity;$('dashboard').hidden=!i;$('greeting').textContent=i?'Ciao, '+i.name+'.':'Benvenuto.';$('identityHint').textContent=i?'Le tue spese, sempre con te.':'Dal programma sul PC scegli «Collega smartphone» e inquadra il tuo QR personale.';if(!i)return;
 const balances=i.accounts.filter(a=>a.type!=='crypto').map(a=>a.balance);$('personalBalance').textContent=balances.length&&balances.every(Number.isSafeInteger)?eur(balances.reduce((n,v)=>n+v,0)):'Saldo non ancora sincronizzato';$('balanceDate').textContent=data.lastSync?'Aggiornato '+new Date(data.lastSync).toLocaleString('it-IT'):'Saldo non ancora sincronizzato';$('familyBalances').replaceChildren();
 for(const f of i.families){const article=document.createElement('article');article.className='balance familybalance';const label=document.createElement('span');label.textContent=f.name+' · '+(f.mode==='virtual'?'Posizione personale':'Saldo condiviso ufficiale');const strong=document.createElement('strong'),small=document.createElement('small'),v=f.mode==='virtual'?f.position:f.balance;strong.textContent=Number.isSafeInteger(v)?eur(v):'Saldo non ancora sincronizzato';strong.className=v<0?'negative':'positive';small.textContent=f.mode==='virtual'?(v<0?'Debito da rimborsare':v>0?'Credito da ricevere':'Quote in equilibrio')+' · Conto virtuale, senza saldo bancario':'Conto reale · Le spese in attesa non sono ancora incluse';article.append(label,strong,small);$('familyBalances').append(article)}
 $('pendingCount').textContent=pending().length+' spese in attesa';$('sync').disabled=busy;$('newExpense').disabled=busy;$('deviceInfo').textContent=i.name+' · Dispositivo '+data.deviceId.slice(0,8);$('migrationInfo').textContent=data.legacy?'Archivio precedente conservato integralmente. '+(data.legacyIssues?.length||0)+' movimenti da verificare.':'';
 const filter=$('historyFilter').value,queue=pending().map(x=>({...x,pending:true,profile:i.name})),items=[...(filter==='confirmed'?[]:queue),...(filter==='pending'?[]:data.history||[])];$('history').replaceChildren();if(!items.length){const p=document.createElement('p');p.className='muted';p.textContent='Nessun movimento da mostrare.';$('history').append(p)}for(const x of items.slice(0,500)){const row=document.createElement('div');row.className='transaction';const title=document.createElement('b');title.textContent=x.description;const value=document.createElement('strong');value.textContent=(x.kind==='income'?'+':'−')+eur(x.amount);value.className=x.kind==='income'?'positive':'negative';const info=document.createElement('small');const issue=data.issues?.find(y=>y.id===x.id);info.textContent=x.date+' · '+x.profile+' · '+(x.pending?(issue?'Da verificare: '+issue.message:'In attesa'):'Confermato')+(x.shared?' · Condivisa':'');row.append(title,value,info);$('history').append(row)}
}
function options(node,rows){const old=node.value;node.replaceChildren();for(const x of rows){const o=document.createElement('option');o.value=x.id;o.textContent=x.name;node.append(o)}if(rows.some(x=>x.id===old))node.value=old}
function formUpdate(){const i=data.identity,shared=$('scope').value==='shared';$('familyField').hidden=!shared;$('splitPanel').hidden=!shared;options($('family'),i.families);const f=shared?i.families.find(f=>f.id===$('family').value):null;options($('account'),f?.mode==='real'?[f]:i.accounts.filter(a=>a.type!=='crypto'));$('multiShares').replaceChildren();$('sharePercent').hidden=!!f&&f.members.length!==2;$('presets').hidden=!!f&&f.members.length!==2;if(f?.members.length>2){f.members.forEach((name,index)=>{const label=document.createElement('label');label.textContent=name+' (%)';const input=document.createElement('input');input.type='number';input.min='0';input.max='100';input.step='0.01';input.dataset.member=name;input.value=String((Math.floor(10000/f.members.length)+(index===0?10000%f.members.length:0))/100);label.append(input);$('multiShares').append(label)});$('sharePreview').textContent='Le quote dei partecipanti devono sommare al 100%.'}else sharePreview()}
function sharePreview(){try{const pct=C.percent($('sharePercent').value)/100;$('sharePreview').textContent='La mia quota '+pct.toLocaleString('it-IT')+'% · Altra persona '+(100-pct).toLocaleString('it-IT')+'%'}catch(e){$('sharePreview').textContent=e.message}}
function today(){const n=new Date();return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0')}
function convertLegacy(next){if(!next.legacy||next.legacyMigrated)return;const i=next.identity;if(next.legacy.profile!==i.name)throw Error('Il vecchio archivio appartiene a un altro profilo. Nessun movimento trasferito.');const issues=[],converted=[];for(const x of next.legacy.expenses){if(next.legacy.syncedIds?.includes(x.id))continue;try{const f=x.shared?i.families.find(f=>f.id===x.familyId):null,a=i.accounts.find(a=>a.name===x.account);if(x.shared&&!f)throw Error('Conto famiglia non presente');if(f?.mode==='real')throw Error('Verificare se la spesa precedente ha usato il conto personale o quello cointestato');if(!a)throw Error('Conto personale non presente');if(f&&f.members.length!==2)throw Error('Ripartizione precedente da verificare');const bp=x.shared?C.percent(x.share):10000;const item={id:x.id,date:x.date,amount:x.amount,description:x.description,category:x.category,profileId:i.profileId,householdId:i.householdId,accountId:a.id,familyId:f?.id||null,shared:!!x.shared,weights:f?Object.fromEntries(f.members.map(n=>[n,n===i.name?bp:10000-bp])):null};converted.push(C.validateExpense(item,i))}catch(e){issues.push({id:x.id,message:e.message})}}for(const x of converted)if(!next.expenses.some(e=>e.id===x.id))next.expenses.push(x);next.legacyIssues=issues;next.legacyMigrated=true}
let lanTimer,lanPolling=false,appliedRound;
const localPage=location.port==='48967';
function lanSecret(){return Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('')}
async function requestLan(action,extra={}){
 const response=await fetch('/api/lan',{
  method:'POST',credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({action,deviceId:data.deviceId,secret:data.credential,...extra}),
  signal:AbortSignal.timeout(12000)
 });
 const result=await response.json();
 if(!response.ok)throw Error(result.error||'Il PC non ha risposto.');
 return result;
}
async function pairLan(token){
 if(!/^(?:[a-f0-9]{64}|[0-9]{10})$/.test(token))throw Error('QR non valido. Generane uno nuovo dal PC.');
 if(!data.credential)mutate(d=>{d.credential=lanSecret()});
 const {identity}=await requestLan('pair',{token,expectedProfile:data.identity?.profileId,expectedHousehold:data.identity?.householdId,name:/iPhone|iPad/.test(navigator.userAgent)?'iPhone / iPad':'Smartphone'});
 if(data.identity&&(identity.householdId!==data.identity.householdId||identity.profileId!==data.identity.profileId))throw Error('Questo telefono ha già un altro profilo.');
 mutate(d=>{d.identity=identity;d.transport='lan';convertLegacy(d)});
 history.replaceState(null,'',location.pathname);
 render();
 message('Telefono associato. Aggiungi Atomic Mobile alla schermata Home per ritrovarla anche fuori casa.');
}
function resultLan(result){
 if(result.error)throw Error(result.error);
 if(result.identity?.profileId!==data.identity.profileId||result.identity?.householdId!==data.identity.householdId)throw Error('Risposta appartenente a un altro profilo.');
 const known=new Set(data.expenses.map(x=>x.id));
 if(!Array.isArray(result.confirmed)||result.confirmed.some(id=>!known.has(id)))throw Error('Conferme non valide.');
 mutate(d=>{
  d.identity=result.identity;
  d.confirmed=[...new Set([...d.confirmed,...result.confirmed])];
  d.history=result.history;
  d.lastSync=result.lastSync;
  d.issues=result.rejected||[];
 });
 render();
 message('Saldo aggiornato · '+result.confirmed.length+' spese confermate'+(result.rejected?.length?' · '+result.rejected.length+' da verificare':''));
}
async function pollLan(){
 if(lanPolling||!localPage||!data?.identity||!data.credential||document.hidden)return;
 lanPolling=true;
 try{
  const reply=await requestLan('poll',{applied:appliedRound});
  $('connection').textContent='PC raggiungibile';
  if(reply.upload){
   await requestLan('upload',{round:reply.upload,expenses:pending().slice(0,1000)});
   $('connection').textContent='Aggiornamento saldi in corso…';
  }else if(reply.result){
   if(reply.result.error){appliedRound=reply.id;throw Error(reply.result.error)}
   resultLan(reply.result);
   appliedRound=reply.id;
  }
 }catch(e){
  $('connection').textContent='Collegamento da verificare';
  if(e.name==='Error')message(e.message);
  else $('connection').textContent='PC non raggiungibile · dati sul telefono';
 }finally{lanPolling=false}
}
async function initLan(){
 try{
  const token=new URLSearchParams(location.hash.slice(1)).get('lan');
  if(token)await pairLan(token);
 }catch(e){message(e.message)}
 const form=$('lanPairForm');
 form.hidden=!!data.identity;
 form.onsubmit=async event=>{
  event.preventDefault();
  const submit=form.querySelector('button');
  submit.disabled=true;
  try{await pairLan($('lanPairCode').value.trim());form.hidden=true;await pollLan()}
  catch(e){message(e.message)}
  finally{submit.disabled=false}
 };
 if(lanTimer)clearInterval(lanTimer);
 lanTimer=setInterval(pollLan,1800);
 document.addEventListener('visibilitychange',pollLan);
 await pollLan();
}
async function pairFromHash(){const raw=new URLSearchParams(location.hash.slice(1)).get('pair');if(!raw){if(location.hash.includes('setup='))message('Questo QR appartiene alla versione precedente. Genera un nuovo QR personale dal PC.');return}let config;try{config=JSON.parse(atob(raw));if(config.v!==2||config.expires<Date.now()||config.signalingUrl!==CONF.signalingUrl||!CONF.signalingUrl)throw Error('QR scaduto o servizio di collegamento non attivo');if(data.identity&&(data.identity.profileId!==config.profileId||data.identity.householdId!==config.householdId))throw Error('Questo telefono è associato a un altro profilo. I dati esistenti sono stati conservati');const credential=data.credential||T.secret();mutate(d=>{d.credential=credential});message('Associazione al PC in corso…');const conn=T.connect({url:config.signalingUrl,credential:config.credential});try{const result=await conn.request('pair',{deviceId:data.deviceId,secret:credential,name:/iPhone|iPad/.test(navigator.userAgent)?'iPhone / iPad':'Smartphone'});if(result.identity.profileId!==config.profileId||result.identity.householdId!==config.householdId)throw Error('Identità del PC non corrispondente');mutate(d=>{d.identity=result.identity;d.signalingUrl=config.signalingUrl;convertLegacy(d)});history.replaceState(null,'',location.pathname);render();await synchronize()}finally{conn.close()}}catch(e){message(e.message)}}
async function synchronize(){if(busy||!data.identity)return;
 if(localPage){
  try{await requestLan('start');message('Sincronizzazione richiesta al PC.');await pollLan()}
  catch(e){message(e.message)}
  return;
 }
 busy=true;render();const sending=pending().slice(0,1000);let conn;try{if(!data.credential)throw Error('Collega nuovamente questo telefono dal PC');conn=T.connect({url:data.signalingUrl,credential:data.credential,onState:s=>$('connection').textContent=s});const result=await conn.request('sync',{expenses:sending});if(result.identity.profileId!==data.identity.profileId||result.identity.householdId!==data.identity.householdId)throw Error('Risposta appartenente a un’altra famiglia');if(!Array.isArray(result.confirmed)||result.confirmed.some(id=>!sending.some(x=>x.id===id)))throw Error('Conferme non valide');mutate(d=>{d.identity=result.identity;d.confirmed=[...new Set([...d.confirmed,...result.confirmed])];d.history=result.history;d.lastSync=result.lastSync;d.issues=result.rejected||[]});message(result.rejected?.length?'Aggiornamento ricevuto. Alcune spese richiedono una verifica: consulta i movimenti.':'Sincronizzazione completata. '+result.confirmed.length+' spese confermate.')}catch(e){message(e.message)}finally{conn?.close();busy=false;$('connection').textContent='Salvato sul telefono';render()}}
function download(){const blob=new Blob([JSON.stringify({format:'ATOMIC_MOBILE_BACKUP',version:2,createdAt:new Date().toISOString(),data},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Atomic-Mobile-backup-'+today()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000)}
window.AtomicMobileQR={getData:()=>structuredClone(data),applyAck:(ack)=>{if(ack?.v!==1||ack.type!=='ack'||ack.deviceId!==data.deviceId||!data.identity||ack.profileId!==data.identity.profileId||ack.householdId!==data.identity.householdId)throw Error('Conferma di altro profilo');const known=new Set(data.expenses.map(x=>x.id));if(!Array.isArray(ack.confirmed)||ack.confirmed.some(x=>!known.has(x)))throw Error('Conferma non valida');mutate(d=>{d.confirmed=[...new Set([...d.confirmed,...ack.confirmed])];d.identity=ack.identity;d.lastSync=ack.lastSync;d.issues=ack.rejected||[];if(Array.isArray(ack.history))d.history=ack.history});render();message('Conferma ricevuta: '+ack.confirmed.length+' spese aggiornate.');},setIdentity:(payload)=>{if(!payload?.identity||!payload?.deviceId||!payload?.secret)throw Error('Associazione non valida');if(data.identity&&(data.identity.profileId!==payload.identity.profileId||data.identity.householdId!==payload.identity.householdId))throw Error('Profilo diverso: dati conservati');if(data.expenses.length&&data.deviceId!==payload.deviceId)throw Error('Questo telefono ha già movimenti: associazione sospesa per evitare perdite');mutate(d=>{d.identity=payload.identity;d.deviceId=payload.deviceId;d.credential=payload.secret;d.transport='qr'});render();message('Profilo associato in modalità QR offline.');}};
$('settingsOpen').onclick=()=>$('settings').showModal();$('closeSettings').onclick=()=>$('settings').close();$('closeExpense').onclick=()=>$('expenseDialog').close();$('sync').onclick=synchronize;$('historyFilter').onchange=render;$('newExpense').onclick=()=>{$('expenseForm').reset();$('date').value=today();$('expenseError').textContent='';formUpdate();$('expenseDialog').showModal()};$('scope').onchange=formUpdate;$('family').onchange=formUpdate;$('sharePercent').oninput=sharePreview;document.querySelectorAll('[data-pct]').forEach(b=>b.onclick=()=>{$('sharePercent').value=b.dataset.pct;sharePreview()});
$('expenseForm').onsubmit=e=>{e.preventDefault();try{const i=data.identity,shared=$('scope').value==='shared',f=shared?i.families.find(f=>f.id===$('family').value):null;let weights=null;if(shared){if(!f)throw Error('Nessun conto famiglia autorizzato');if(f.members.length===2){const b=C.percent($('sharePercent').value);weights=Object.fromEntries(f.members.map(n=>[n,n===i.name?b:10000-b]))}else weights=Object.fromEntries([...$('multiShares').querySelectorAll('input')].map(el=>[el.dataset.member,C.percent(el.value)]))}const x=C.validateExpense({id:crypto.randomUUID(),householdId:i.householdId,profileId:i.profileId,date:$('date').value,amount:Math.round(Number($('amount').value)*100),description:$('description').value,category:$('category').value,accountId:$('account').value,familyId:f?.id||null,shared,weights},i);mutate(d=>d.expenses.push(x));$('expenseDialog').close();message('Spesa salvata sul telefono. Sarà inviata alla prossima sincronizzazione.');render()}catch(e){$('expenseError').textContent=e.message}};
$('backup').onclick=download;$('restore').onclick=()=>$('restoreFile').click();$('restoreFile').onchange=async e=>{try{const f=e.target.files?.[0];if(!f)return;if(f.size>12*1024*1024)throw Error('Backup troppo grande');const b=JSON.parse(await f.text());if(b.format!=='ATOMIC_MOBILE_BACKUP'||b.version!==2||!b.data?.identity||!Array.isArray(b.data.expenses))throw Error('Backup non compatibile');if(localPage&&!data.identity)throw Error('Associa prima il telefono al tuo profilo dal PC.');if(data.identity&&(b.data.identity.profileId!==data.identity.profileId||b.data.identity.householdId!==data.identity.householdId))throw Error('Backup appartenente a un altro profilo');if(!confirm('Unire i movimenti del backup? Nessuna spesa esistente sarà cancellata.'))return;localStorage.setItem('atomic-before-restore',JSON.stringify(data));mutate(d=>{if(!d.identity){d.identity=b.data.identity;d.signalingUrl=b.data.signalingUrl;d.deviceId=b.data.deviceId;d.credential=b.data.credential}for(const x of b.data.expenses){C.validateExpense(x,d.identity);const old=d.expenses.find(y=>y.id===x.id);if(old&&C.canonical(old)!==C.canonical(x))throw Error('Conflitto nel backup: '+x.id);if(!old)d.expenses.push(x)}/* Do not trust backup confirmations: PC will acknowledge retries. */});render();message('Backup ripristinato. Sincronizza per verificare le conferme.')}catch(e){message(e.message)}finally{e.target.value=''}};
$('update').onclick=async()=>{try{const r=await navigator.serviceWorker.getRegistration();await r?.update();message('Aggiornamento verificato. Chiudi e riapri l’app per attivare la nuova versione.')}catch(e){message('Impossibile verificare: '+e.message)}};
try{data=initial();render();/* Only QR provisioning is supported in this clean edition. */if('serviceWorker'in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./mobile-sw.js').catch(e=>message('App disponibile online; salvataggio offline non attivato: '+e.message));navigator.storage?.persist?.().catch(()=>{})}catch(e){message('Avvio sospeso: '+e.message);$('dashboard').hidden=true}
})();
