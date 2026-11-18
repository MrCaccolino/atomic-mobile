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
