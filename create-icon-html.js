/**
 * Generate PNG icons from SVG using a canvas data URL approach.
 * This script creates a simple HTML page that auto-generates and downloads the icons.
 * Open this file in a browser to generate the icons.
 */

const html = `<!DOCTYPE html>
<html>
<head>
<title>AI Chat Exporter — Icon Generator</title>
<style>
  body { font-family: Arial, sans-serif; padding: 20px; background: #0f0f17; color: #e2e8f0; }
  canvas { border: 1px solid #333; margin: 8px; display: inline-block; }
  button { padding: 10px 20px; background: linear-gradient(135deg, #7c3aed, #06b6d4); color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; margin: 10px 0; display: block; }
  .status { color: #10b981; margin-top: 10px; }
</style>
</head>
<body>
<h2>AI Chat Exporter — Icon Generator</h2>
<p>Click the button below to generate and download all icon sizes.</p>
<div id="canvases"></div>
<button onclick="generateAll()">Generate & Download All Icons</button>
<div id="status"></div>
<script>
const sizes = [16, 32, 48, 128];

function drawIcon(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const r = size * 0.2;
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#7c3aed');
  grad.addColorStop(1, '#06b6d4');

  // Rounded rect background
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.arcTo(size, 0, size, size, r);
  ctx.arcTo(size, size, 0, size, r);
  ctx.arcTo(0, size, 0, 0, r);
  ctx.arcTo(0, 0, size, 0, r);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  const lw = Math.max(1.5, size * 0.08);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const cx = size / 2;
  const pad = size * 0.2;

  // Vertical line
  ctx.beginPath();
  ctx.moveTo(cx, pad);
  ctx.lineTo(cx, size * 0.60);
  ctx.stroke();

  // Arrow head
  const ah = size * 0.13;
  ctx.beginPath();
  ctx.moveTo(cx - ah * 1.7, size * 0.47);
  ctx.lineTo(cx, size * 0.66);
  ctx.lineTo(cx + ah * 1.7, size * 0.47);
  ctx.stroke();

  // Base bar
  ctx.beginPath();
  ctx.moveTo(pad, size * 0.82);
  ctx.lineTo(size - pad, size * 0.82);
  ctx.stroke();

  return canvas;
}

function generateAll() {
  const status = document.getElementById('status');
  sizes.forEach(size => {
    const canvas = drawIcon(size);
    document.getElementById('canvases').appendChild(canvas);

    // Download
    const link = document.createElement('a');
    link.download = 'icon' + size + '.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  });
  status.innerHTML = '✅ Icons generated! Save them to the <strong>icons/</strong> folder.';
}

// Preview on load
window.onload = () => {
  sizes.forEach(size => {
    const canvas = drawIcon(size);
    canvas.title = size + 'x' + size;
    document.getElementById('canvases').appendChild(canvas);
  });
};
<\/script>
</body>
</html>`;

require('fs').writeFileSync('icon-generator.html', html);
console.log('Open icon-generator.html in a browser to generate icons.');
