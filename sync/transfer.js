(function () {
  'use strict';
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  function encode(bytes) {
    let text = '';
    for (const byte of bytes) text += String.fromCharCode(byte);
    return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function decode(text) {
    if (typeof text !== 'string' || !/^[\w-]+$/.test(text)) throw Error('Codice non valido');
    const raw = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - text.length % 4) % 4));
    return Uint8Array.from(raw, char => char.charCodeAt(0));
  }

  async function key(secret, usage) {
    if (!/^[a-f0-9]{64}$/.test(secret)) throw Error('Associazione non valida');
    return crypto.subtle.importKey('raw', Uint8Array.from(secret.match(/../g), byte => parseInt(byte, 16)),
      { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
  }

  async function sign(secret, payload) {
    const signature = await crypto.subtle.sign('HMAC', await key(secret, 'sign'), encoder.encode(JSON.stringify(payload)));
    return { ...payload, signature: encode(new Uint8Array(signature)) };
  }

  async function verify(secret, packet) {
    if (!packet || typeof packet.signature !== 'string') throw Error('Firma mancante');
    const { signature, ...payload } = packet;
    const valid = await crypto.subtle.verify('HMAC', await key(secret, 'verify'), decode(signature), encoder.encode(JSON.stringify(payload)));
    if (!valid) throw Error('Firma del file non valida. Usa il file originale esportato dal dispositivo');
    return payload;
  }

  async function pack(payload) {
    const stream = new Blob([JSON.stringify(payload)]).stream().pipeThrough(new CompressionStream('gzip'));
    return encode(new Uint8Array(await new Response(stream).arrayBuffer()));
  }

  async function unpack(text) {
    if (text.length > 16000) throw Error('QR troppo grande. Usa il file di configurazione');
    const stream = new Blob([decode(text)]).stream().pipeThrough(new DecompressionStream('gzip'));
    const reader = stream.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 200000) {
        await reader.cancel();
        throw Error('QR oltre il limite');
      }
      chunks.push(value);
    }
    return JSON.parse(decoder.decode(await new Blob(chunks).arrayBuffer()));
  }

  function download(payload, filename) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  async function readFile(file) {
    if (file.size > 12 * 1024 * 1024) throw Error('File troppo grande (massimo 12 MB)');
    return JSON.parse(await file.text());
  }

  function mobileUrl() {
    const url = new URL(ATOMIC_SYNC_CONFIG.mobileUrl);
    url.hash = '';
    url.search = '';
    url.pathname = url.pathname.replace(/(?:index\.html|FamilyWellnessMobile\.html)?$/, '');
    if (!url.pathname.endsWith('/')) url.pathname += '/';
    return new URL('FamilyWellnessMobile.html', url).href;
  }

  function draw(value) {
    const qr = new FWS_QR(0, /^(ATQ2|ATB1|ATC1):/.test(value)?0:1);
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount();
    const namespace = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(namespace, 'svg');
    svg.setAttribute('viewBox', `-4 -4 ${count + 8} ${count + 8}`);
    svg.setAttribute('width', '520');
    svg.setAttribute('shape-rendering','crispEdges');
    svg.setAttribute('role','img');svg.setAttribute('aria-label','Codice QR di trasferimento');
    svg.style.maxWidth = '100%';
    const background = document.createElementNS(namespace, 'rect');
    background.setAttribute('x', '-4');
    background.setAttribute('y', '-4');
    background.setAttribute('width', String(count + 8));
    background.setAttribute('height', String(count + 8));
    background.setAttribute('fill', '#fff');
    let path = '';
    for (let y = 0; y < count; y++) {
      for (let x = 0; x < count; x++) {
        if (qr.isDark(y, x)) path += `M${x} ${y}h1v1h-1z`;
      }
    }
    const pixels = document.createElementNS(namespace, 'path');
    pixels.setAttribute('d', path);
    pixels.setAttribute('fill', '#151515');
    svg.append(background, pixels);
    return svg;
  }

  function balanceQRFrames(packed, id=crypto.randomUUID().replace(/-/g,'').slice(0,12)) {
    if (!/^[a-f0-9]{12}$/.test(id) || !/^[A-Za-z0-9_-]+$/.test(packed) || packed.length>16000) throw Error('Riepilogo troppo grande per i QR. Usa il file saldi.');
    const chunks=packed.match(/.{1,260}/g);
    return chunks.map((chunk,index)=>'ATB1:'+id+':'+index+':'+chunks.length+':'+chunk);
  }
  globalThis.AtomicTransfer = { sign, verify, pack, unpack, download, readFile, mobileUrl, draw, balanceQRFrames };
})();
(function(){
 'use strict';
 function expenseQRFrames(packed,id=crypto.randomUUID().replace(/-/g,'').slice(0,12)){
  if(!/^[a-f0-9]{12}$/.test(id)||!/^[\w-]+$/.test(packed)||packed.length>16000)throw Error('Spesa troppo grande per i QR: usa Esporta file spese');
  const parts=packed.match(/.{1,220}/g);return parts.map((p,i)=>'ATQ2:'+id+':'+i+':'+parts.length+':'+p);
 }
 function collector(prefix='ATQ2',limit=220){let current=null;return {reset(){current=null},accept(text){
  const m=new RegExp('^'+prefix+':([a-f0-9]{12}):(\\d{1,2}):(\\d{1,2}):([A-Za-z0-9_-]{1,'+limit+'})$').exec(text);if(!m)throw Error('Frammento QR non valido');const [,id,is,ns,part]=m,index=Number(is),total=Number(ns);if(total<1||total>96||index>=total)throw Error('Sequenza QR non valida');if(!current||current.id!==id)current={id,total,parts:new Map()};if(current.total!==total||current.parts.has(index)&&current.parts.get(index)!==part)throw Error('Frammenti QR incoerenti');current.parts.set(index,part);if(current.parts.size<total)return {pending:true,id,received:current.parts.size,total};const packed=Array.from({length:total},(_,i)=>current.parts.get(i)).join('');if(packed.length>16000)throw Error('Sequenza troppo grande');return {pending:false,id,received:total,total,packed};
 }}}
 Object.assign(AtomicTransfer,{expenseQRFrames,collector});
})();
