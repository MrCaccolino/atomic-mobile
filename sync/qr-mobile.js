(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const mobile = window.AtomicMobileQR;
  const transfer = AtomicTransfer;
  const panel = document.createElement('section');
  panel.className = 'panel';
  panel.innerHTML = `<h2>Trasferisci con il PC</h2>
    <p>Mostra i QR alla webcam del PC oppure trasferisci le spese tramite file. Ricevi conti e saldi con il QR del PC o con il file del tuo profilo.</p>
    <button id="exportExpenses">Esporta spese per il PC</button>
    <button id="importReceipt">Importa saldi dal PC</button>
    <input id="receiptFile" type="file" accept=".json,application/json" hidden>
    <p id="qrMobileStatus" role="status"></p>
`;
  $('dashboard').append(panel);
  const scanner=document.createElement('dialog');scanner.id='pcScanDialog';
  scanner.innerHTML='<div class="sectionhead"><h2>Leggi il QR del PC</h2><button id="closePCScanner" class="secondary">Chiudi</button></div><p>Nel programma Windows seleziona il codice di questo telefono e premi Aggiorna conti e saldi via QR.</p><video id="pcScanVideo" autoplay playsinline muted></video><p id="pcScanStatus" role="status"></p>';
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
    receivedBalance=null;scanner.showModal();$('pcScanStatus').textContent='Attivazione fotocamera…';
    let stream;
    try{
      if(!navigator.mediaDevices?.getUserMedia)throw Error('Fotocamera non disponibile. Puoi importare il file saldi del PC.');
      stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});
      let running=true;stopScanner=()=>{running=false;stream.getTracks().forEach(track=>track.stop());$('pcScanVideo').srcObject=null};
      if(!scanner.open){stopScanner();return}
      const video=$('pcScanVideo');video.srcObject=stream;await video.play();const canvas=document.createElement('canvas');
      let previous;
      while(running&&scanner.open){
        const frame=AtomicCamera.read(video,canvas);
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
  qrDialog.innerHTML='<div class="sectionhead"><h2>QR spesa per il PC</h2><button id="closeQrDisplay" class="secondary">Chiudi</button></div><p id="qrExpenseDescription"></p><div id="qrMobileCanvas"></div><p id="qrDisplayStatus" role="status">Tieni il QR fermo davanti alla webcam del PC.</p><button id="qrNext" class="wide">Mostra spesa successiva</button>';
  document.body.append(qrDialog);
  $('closeQrDisplay').onclick=()=>qrDialog.close();
  $('showExpenseQR').onclick=()=>{qrDialog.showModal();$('qrNext').click()};

  const setup = document.createElement('section');
  setup.className = 'panel';
  setup.innerHTML = `<button id="importConfig">Importa configurazione dal PC</button>
    <input id="configFile" type="file" accept=".json,application/json" hidden>
    <p>Puoi usare il QR personale oppure il file di configurazione esportato dal PC.</p>`;
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
    status(receipt.identity.families.length?'Conti e saldi aggiornati dal PC: '+receipt.identity.families.map(f=>f.name).join(', '):'Il PC non ha inviato conti condivisi per questo profilo. Controlla i partecipanti del conto nel programma Windows.');
  }
  function applyConfig(packet) {
    if (packet?.v !== 1 || packet.type !== 'provision') throw Error('File di configurazione non valido');
    mobile.setIdentity(packet);
    status('Profilo ' + packet.identity.name + ' configurato. Puoi registrare le spese.');
  }
  async function readHash() {
    const hash = new URLSearchParams(location.hash.slice(1));
    try {
      if (hash.has('offline')) applyConfig(await transfer.unpack(hash.get('offline')));
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
      const expense = pending[position % pending.length];
      position++;
      $('qrExpenseDescription').textContent='Spesa '+((position-1)%pending.length+1)+' di '+pending.length+' · '+expense.description;
      const packet = await transfer.sign(data.credential, { v: 1, type: 'expense', deviceId: data.deviceId, expense });
      $('qrMobileCanvas').replaceChildren(transfer.draw('ATQ1:' + await transfer.pack(packet)));
      status('Mostra il QR alla webcam del PC · ' + expense.description);
    } catch (error) { status(error.message + '. Puoi trasferire le spese tramite file.'); }
  };
  window.addEventListener('hashchange', readHash);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) readHash(); });
  setup.hidden = !!mobile.getData()?.identity;
  window.AtomicMobileTransfer = { applyConfig, applyReceipt, exportExpenses, readHash, scanPCQR, acceptPCQR };
  readHash();
})();
