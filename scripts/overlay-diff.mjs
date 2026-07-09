// Compare reference amber ridges vs authored band (magenta) edges on the
// blueprint overlay screenshot, along given scan rows.
import sharp from 'sharp';
const { data, info } = await sharp('blueprint-overlay.png').raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, ch = info.channels;
const px = (x, y) => { const i = (y * W + x) * ch; return [data[i], data[i+1], data[i+2]]; };
const rows = [80, 100, 130, 160, 200, 250, 300, 350, 400, 450, 550, 650, 750, 790];
for (const y of rows) {
  const amber = [], mag = [];
  let inMag = false, magStart = 0;
  const vals = [];
  for (let x = 0; x < W; x++) {
    const [r, g, b] = px(x, y);
    vals.push(Math.max(0, r - b) * (0.5*r + 0.4*g + 0.1*b) / 255);
    const isMag = r > 80 && b > 60 && g < r * 0.6 && g < b; // magenta-ish
    if (isMag && !inMag) { inMag = true; magStart = x; }
    if (!isMag && inMag) { inMag = false; mag.push(`${magStart}-${x-1}`); }
  }
  // amber peaks (smooth3, local max, merged within 5)
  const s = vals.map((v, i) => (vals[Math.max(0,i-1)] + v + vals[Math.min(vals.length-1,i+1)]) / 3);
  const out = [];
  for (let i = 2; i < s.length - 2; i++) {
    if (s[i] > 14 && s[i] >= s[i-1] && s[i] >= s[i+1] && s[i] > s[i-2] && s[i] > s[i+2]) {
      if (out.length && i - out[out.length-1].p < 5) { if (s[i] > out[out.length-1].v) out[out.length-1] = {p:i,v:s[i]}; }
      else out.push({p:i,v:s[i]});
    }
  }
  console.log(`y${y}`.padEnd(5), 'amber:', out.filter(o=>o.p<960).map(o=>o.p).join(','), '| mag:', mag.filter(m=>parseInt(m)<960).join(' '));
}
