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
    if (!data.identity || packet.deviceId !== data.deviceId) throw Error('Il file appartiene a un altro telefono');
    const receipt = await transfer.verify(data.credential, packet);
    mobile.applyAck(receipt);
    status('Spese confermate e saldi aggiornati dal PC.');
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
  window.AtomicMobileTransfer = { applyConfig, applyReceipt, exportExpenses, readHash };
  readHash();
})();
