import sharp from 'sharp';
const [,, inF, outF, left, top, w, h, scale=3, mult=2.2] = process.argv;
await sharp(inF)
  .extract({ left:+left, top:+top, width:+w, height:+h })
  .resize({ width: +w * +scale, kernel: 'nearest' })
  .linear(+mult, 0)
  .toFile(outF);
console.log('ok', outF);
