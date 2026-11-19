(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const mobile = window.AtomicMobileQR;
  const transfer = AtomicTransfer;
  const panel = document.createElement('section');
  panel.className = 'panel';
  panel.innerHTML = `<h2>Trasferisci con il PC</h2>
    <p>2 · Invia le spese al PC. Poi 3 · Leggi conferma e saldi dal PC. Mostra i QR alla webcam del PC oppure trasferisci le spese tramite file. Ricevi conti e saldi con il QR del PC o con il file del tuo profilo.</p>
    <button id="exportExpenses">Esporta spese per il PC</button>
    <button id="importReceipt">Importa saldi dal PC</button>
    <input id="receiptFile" type="file" accept=".json,application/json" hidden>
    <p id="qrMobileStatus" role="status"></p>
`;
  $('dashboard').append(panel);
  const scanner=document.createElement('dialog');scanner.id='pcScanDialog';
  scanner.innerHTML='<div class="sectionhead"><h2>Leggi il QR del PC</h2><button id="closePCScanner" class="secondary">Chiudi</button></div><p id="pcScanInstruction">Inquadra il QR del PC.</p><video id="pcScanVideo" autoplay playsinline muted></video><p id="pcScanStatus" role="status"></p>';
  document.body.append(scanner);
  let stopScanner;
  function closeScanner(){stopScanner?.();scanner.close()}
  $('closePCScanner').onclick=closeScanner;
  scanner.addEventListener('close',()=>stopScanner?.());scanner.addEventListener('cancel',()=>stopScanner?.());
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&scanner.open)closeScanner()});
  let receivedBalance;
  async function acceptPCQR(text){
    if(text.startsWith('ATB1:')){
      const match=/^ATB1:([a-f0-9]{12}):(\d{1,2}):(\d{1,2}):([A-Za-z0-9_-]{1,260})$/.exec(text);
      if(!match)throw Error('QR di aggiornamento non valido');
      const [,id,indexText,totalText,chunk]=match,index=Number(indexText),total=Number(totalText);
      if(total<1||total>64||index>=total)throw Error('Sequenza QR non valida');
      if(receivedBalance?.id!==id)receivedBalance={id,total,chunks:new Map()};
      if(receivedBalance.total!==total)throw Error('Sequenza QR incoerente');
      receivedBalance.chunks.set(index,chunk);
      if(receivedBalance.chunks.size<total)return {pending:true,received:receivedBalance.chunks.size,total};
      const packed=Array.from({length:total},(_,i)=>receivedBalance.chunks.get(i)).join('');
      await applyReceipt(await transfer.unpack(packed));receivedBalance=null;return;
    }
    const hash=new URLSearchParams(new URL(text).hash.slice(1));
    if(hash.has('ack'))return applyReceipt(await transfer.unpack(hash.get('ack')));
    if(hash.has('offline'))return applyConfig(await transfer.unpack(hash.get('offline')));
    throw Error('QR diverso: mostra sul PC il QR di aggiornamento conti e saldi');
  }
  async function scanPCQR(){
    if(scanner.open)return;
    receivedBalance=null;scanner.showModal();$('pcScanInstruction').textContent=mobile.getData().identity?'Sul PC seleziona il codice di questo telefono e premi Aggiorna conti e saldi via QR.':'Sul PC scegli Collega smartphone e Genera QR per nuovo telefono. Inquadra qui quel QR: il profilo verrà salvato in questa app.';$('pcScanStatus').textContent='Attivazione fotocamera…';
    let stream;
    try{
      if(!navigator.mediaDevices?.getUserMedia)throw Error('Fotocamera non disponibile. Puoi importare il file saldi del PC.');
      stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});
      let running=true;stopScanner=()=>{running=false;stream.getTracks().forEach(track=>track.stop());$('pcScanVideo').srcObject=null};
      if(!scanner.open){stopScanner();return}
      const video=$('pcScanVideo');video.srcObject=stream;await video.play();const canvas=document.createElement('canvas');
      let previous;
      while(running&&scanner.open){
        const frame=await AtomicCamera.readAsync(video,canvas);
        if(frame.text&&frame.text!==previous){
          previous=frame.text;
          try{const result=await acceptPCQR(frame.text);if(result?.pending)$('pcScanStatus').textContent='Ricezione conti e saldi: '+result.received+' di '+result.total+' QR. Continua a inquadrare il PC.';else{closeScanner();return}}
          catch(error){$('pcScanStatus').textContent=error.message+'. Codice di questo telefono: '+mobile.getData().deviceId.slice(0,8);}
        }else if(!previous)$('pcScanStatus').textContent=frame.brightness<45?'Immagine scura. Aumenta la luminosità del monitor.':'Inquadra il QR di aggiornamento sul PC. Telefono '+mobile.getData().deviceId.slice(0,8);
        await new Promise(resolve=>setTimeout(resolve,250));
      }
    }catch(error){$('pcScanStatus').textContent='Lettura non completata: '+error.message;stream?.getTracks().forEach(track=>track.stop())}
  }
  $('scanPCQR').onclick=scanPCQR;

  const qrDialog=document.createElement('dialog');
  qrDialog.id='qrDisplay';
  qrDialog.innerHTML='<div class="sectionhead"><h2>QR spese per il PC</h2><button id="closeQrDisplay" class="secondary">Chiudi</button></div><p id="qrExpenseDescription"></p><div id="qrMobileCanvas"></div><p id="qrDisplayStatus" role="status">Tieni il QR fermo davanti alla webcam del PC.</p><p id="expenseFrameProgress" role="status"></p><div class="actions"><button id="expenseQRPrev" class="secondary">QR precedente</button><button id="expenseQRNext" class="secondary">QR successivo</button><button id="expenseQRPause" class="secondary">Pausa sequenza</button><button id="expenseReadReceipt">Leggi conferma e saldi dal PC</button></div><button id="qrNext" class="wide">Mostra lotto di spese</button>';
  document.body.append(qrDialog);
  let expenseTimer,expenseFrames=[],expenseFrame=0,autoFrames=true;
  function stopExpenseFrames(){clearInterval(expenseTimer);expenseTimer=null}
  function showExpenseFrame(){if(!expenseFrames.length)return;$('qrMobileCanvas').replaceChildren(transfer.draw(expenseFrames[expenseFrame]));$('expenseFrameProgress').textContent='QR '+(expenseFrame+1)+' di '+expenseFrames.length+' · attendi che il PC confermi l’importazione';}
  function startExpenseFrames(){stopExpenseFrames();if(autoFrames&&expenseFrames.length>1)expenseTimer=setInterval(()=>{expenseFrame=(expenseFrame+1)%expenseFrames.length;showExpenseFrame()},1400);}
  $('expenseQRPrev').onclick=()=>{autoFrames=false;stopExpenseFrames();expenseFrame=(expenseFrame-1+expenseFrames.length)%Math.max(1,expenseFrames.length);showExpenseFrame();$('expenseQRPause').textContent='Riprendi sequenza'};
  $('expenseQRNext').onclick=()=>{autoFrames=false;stopExpenseFrames();expenseFrame=(expenseFrame+1)%Math.max(1,expenseFrames.length);showExpenseFrame();$('expenseQRPause').textContent='Riprendi sequenza'};
  $('expenseQRPause').onclick=()=>{autoFrames=!autoFrames;$('expenseQRPause').textContent=autoFrames?'Pausa sequenza':'Riprendi sequenza';startExpenseFrames()};
  $('expenseReadReceipt').onclick=()=>{qrDialog.close();scanPCQR()};
  qrDialog.addEventListener('close',stopExpenseFrames);qrDialog.addEventListener('cancel',stopExpenseFrames);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopExpenseFrames();else if(qrDialog.open)startExpenseFrames()});
  $('closeQrDisplay').onclick=()=>qrDialog.close();
  $('showExpenseQR').onclick=()=>{qrDialog.showModal();$('qrNext').hidden=false;autoFrames=true;$('expenseQRPause').textContent='Pausa sequenza';$('qrNext').click()};

  const setup = document.createElement('section');
  setup.className = 'panel';
  setup.innerHTML = `<button id="scanSetupQR">Collega dal QR del PC</button><button id="importConfig" class="secondary">Importa configurazione o backup</button>
    <input id="configFile" type="file" accept=".json,application/json" hidden>
    <p>1 · Collega una sola volta il profilo. Puoi importare la configurazione del PC oppure il backup di Atomic Mobile scaricato da Safari.</p>`;
  $('welcome').append(setup);
  function status(text) {
    $('qrMobileStatus').textContent = text;
    $('message').textContent = text;
    $('qrDisplayStatus').textContent=text;
    setup.hidden = !!mobile.getData()?.identity;
  }
  async function applyReceipt(packet) {
    const data = mobile.getData();
    if (!data.identity || packet.deviceId !== data.deviceId) throw Error('Riepilogo per un altro telefono. Sul PC seleziona il codice '+data.deviceId.slice(0,8));
    const receipt = await transfer.verify(data.credential, packet);
    mobile.applyAck(receipt);
    status(receipt.identity.families.length?'Conferme e saldi ricevuti dal PC. '+mobile.getData().expenses.filter(x=>mobile.getData().confirmed.includes(x.id)).length+' spese confermate; '+mobile.getData().expenses.filter(x=>!mobile.getData().confirmed.includes(x.id)).length+' ancora da inviare. Conti famiglia: '+receipt.identity.families.map(f=>f.name).join(', '):'Il PC non ha inviato conti condivisi per questo profilo. Controlla i partecipanti del conto nel programma Windows.');
  }
  async function applyConfig(packet) {
    if(packet?.format==='ATOMIC_MOBILE_BACKUP'){const restored=await mobile.restoreBackup(packet);if(restored?.restored===false){status('Ripristino annullato. Dati esistenti conservati.');return}status('Backup del telefono ripristinato. Profilo e spese conservati; ricevi dal PC i saldi e le conferme aggiornate.');return;}
    if (packet?.v !== 1 || packet.type !== 'provision') throw Error('File di configurazione non valido');
    mobile.setIdentity(packet);
    status('Profilo ' + packet.identity.name + ' configurato. Puoi registrare le spese.');
  }
  async function readHash() {
    const hash = new URLSearchParams(location.hash.slice(1));
    try {
      if (hash.has('offline')) await applyConfig(await transfer.unpack(hash.get('offline')));
      else if (hash.has('ack')) await applyReceipt(await transfer.unpack(hash.get('ack')));
      else return;
      history.replaceState(null, '', location.pathname);
    } catch (error) { status(error.message); }
  }
  let exporting = false;
  async function exportExpenses() {
    if (exporting) return;
    exporting = true;
    try {
      const data = mobile.getData();
      if (!data.identity || data.transport !== 'qr') throw Error('Importa prima la configurazione del PC');
      const expenses = data.expenses.filter(item => !data.confirmed.includes(item.id)).slice(0, 1000);
      const packet = await transfer.sign(data.credential, { v: 1, type: 'expenses', deviceId: data.deviceId, expenses });
      transfer.download(packet, 'Atomic-spese-' + data.deviceId.slice(0, 8) + '.json');
      status('Esportate ' + expenses.length + ' spese. Restano in attesa fino alla conferma del PC.');
    } catch (error) { status(error.message); }
    finally { exporting = false; }
  }
  $('sync').onclick = exportExpenses;
  $('exportExpenses').onclick = exportExpenses;
  $('scanSetupQR').onclick=scanPCQR;
  $('importConfig').onclick = () => $('configFile').click();
  $('importReceipt').onclick = () => $('receiptFile').click();
  function fileHandler(input, apply) {
    input.onchange = async () => {
      try {
        const file = input.files?.[0];
        if (file) await apply(await transfer.readFile(file));
      } catch (error) { status(error.message); }
      finally { input.value = ''; }
    };
  }
  fileHandler($('configFile'), applyConfig);
  fileHandler($('receiptFile'), applyReceipt);
  let position = 0;
  $('qrNext').onclick = async () => {
    try {
      const data = mobile.getData();
      if (!data.identity || data.transport !== 'qr') throw Error('Associa prima il profilo al PC');
      const pending = data.expenses.filter(item => !data.confirmed.includes(item.id));
      if (!pending.length) {$('qrMobileCanvas').replaceChildren();return status('Nessuna spesa in attesa.');}
      stopExpenseFrames();
      let batch=pending.slice(position%pending.length,position%pending.length+10),packed;
      while(batch.length){const packet=await transfer.sign(data.credential,{v:1,type:'expenses',deviceId:data.deviceId,expenses:batch,pendingTotal:pending.length});packed=await transfer.pack(packet);if(packed.length<=2640||batch.length===1)break;batch=batch.slice(0,-1)}
      expenseFrames=transfer.expenseQRFrames(packed);if(expenseFrames.length>12)throw Error('Lotto troppo denso: usa Esporta file spese');
      position=(position+batch.length)%pending.length;expenseFrame=0;
      $('qrExpenseDescription').textContent='Lotto di '+batch.length+' spese · '+pending.length+' ancora da confermare · '+batch.map(x=>x.description).join(', ');
      showExpenseFrame();startExpenseFrames();
      status('2 · Mostra la sequenza alla webcam del PC. Dopo l’importazione premi Leggi conferma e saldi dal PC.');
    } catch (error) { status(error.message + '. Puoi trasferire le spese tramite file.'); }
  };
  const proof=document.createElement('button');proof.id='showReceiptProof';proof.className='secondary';proof.textContent='Mostra conferma di ricezione al PC (facoltativo)';panel.append(proof);
  proof.onclick=async()=>{try{const d=mobile.getData();if(!d.receiptRevision)throw Error('Ricevi prima i saldi aggiornati dal PC');const packet=await transfer.sign(d.credential,{v:1,type:'received',deviceId:d.deviceId,profileId:d.identity.profileId,householdId:d.identity.householdId,revision:d.receiptRevision,pending:d.expenses.filter(x=>!d.confirmed.includes(x.id)).length,confirmed:d.expenses.filter(x=>d.confirmed.includes(x.id)).length});stopExpenseFrames();qrDialog.showModal();$('qrNext').hidden=true;expenseFrames=[];$('qrMobileCanvas').replaceChildren(transfer.draw('ATC1:'+await transfer.pack(packet)));$('qrExpenseDescription').textContent='4 · Conferma che questo telefono ha ricevuto il riepilogo '+d.receiptRevision;$('expenseFrameProgress').textContent='';status('Sul PC premi Leggi QR spese con webcam per verificare la ricezione.');}catch(e){status(e.message)}};
  window.addEventListener('hashchange', readHash);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) readHash(); });
  setup.hidden = !!mobile.getData()?.identity;
  window.AtomicMobileTransfer = { applyConfig, applyReceipt, exportExpenses, readHash, scanPCQR, acceptPCQR };
  readHash();
})();
