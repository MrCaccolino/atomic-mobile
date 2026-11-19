(function () {
  'use strict';
  function pixels(video, canvas, crop) {
    const side = crop ? 0.65 : 1;
    const width = video.videoWidth * side;
    const height = video.videoHeight * side;
    const scale = Math.min(1, 1600 / width);
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw Error('Impossibile acquisire le immagini della webcam');
    context.drawImage(video, (video.videoWidth - width) / 2, (video.videoHeight - height) / 2,
      width, height, 0, 0, canvas.width, canvas.height);
    return context.getImageData(0, 0, canvas.width, canvas.height);
  }
  function decodePixels(image) {
    return jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' })?.data || null;
  }
  function read(video, canvas) {
    if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return { text: null, brightness: 128, contrast: 255 };
    const image = pixels(video, canvas, false);
    let total = 0, count = 0, low = 255, high = 0;
    for (let index = 0; index < image.data.length; index += 64) {
      const value = (image.data[index] + image.data[index + 1] + image.data[index + 2]) / 3;
      total += value;
      count++;
      low = Math.min(low, value);
      high = Math.max(high, value);
    }
    const text = decodePixels(image) || decodePixels(pixels(video, canvas, true));
    return { text, brightness: total / Math.max(1, count), contrast: high - low };
  }
  globalThis.AtomicCamera = { read, decode: (video, canvas) => read(video, canvas).text, decodePixels };
})();
(function(){
 'use strict';
 let detector;
 async function open(video,{deviceId,facingMode}={}){
  if(!navigator.mediaDevices?.getUserMedia)throw Error('Webcam non disponibile in questa pagina. Usa Importa file spese.');
  const preferred={width:{ideal:1920},height:{ideal:1080},frameRate:{ideal:15,max:30},...(deviceId?{deviceId:{exact:deviceId}}:facingMode?{facingMode:{ideal:facingMode}}:{})};
  let stream;try{stream=await navigator.mediaDevices.getUserMedia({video:preferred,audio:false})}catch(e){if(e.name==='OverconstrainedError'||e.name==='NotFoundError'&&deviceId)stream=await navigator.mediaDevices.getUserMedia({video:true,audio:false});else if(e.name==='NotAllowedError')throw Error('Permesso webcam negato. Consenti la fotocamera nelle impostazioni oppure usa il file spese.');else if(e.name==='NotReadableError')throw Error('Webcam occupata: chiudi le altre applicazioni che la utilizzano oppure usa il file spese.');else throw e}
  try{const track=stream.getVideoTracks()[0],cap=track.getCapabilities?.()||{},advanced={};if(cap.focusMode?.includes('continuous'))advanced.focusMode='continuous';if(cap.exposureMode?.includes('continuous'))advanced.exposureMode='continuous';if(Object.keys(advanced).length)try{await track.applyConstraints({advanced:[advanced]})}catch{}video.srcObject=stream;video.style.objectFit='contain';video.style.height='auto';await video.play();return {stream,settings:track.getSettings?.()||{},stop(){stream.getTracks().forEach(t=>t.stop());video.srcObject=null}}}catch(e){stream.getTracks().forEach(t=>t.stop());throw e}
 }
 async function devices(){return (await navigator.mediaDevices?.enumerateDevices?.()||[]).filter(d=>d.kind==='videoinput')}
 async function readAsync(video,canvas){if(typeof BarcodeDetector!=='undefined'){try{detector||=new BarcodeDetector({formats:['qr_code']});const codes=await detector.detect(video);if(codes[0]?.rawValue)return {text:codes[0].rawValue,brightness:128,contrast:255}}catch{}}return AtomicCamera.read(video,canvas)}
 Object.assign(AtomicCamera,{open,devices,readAsync});
})();
