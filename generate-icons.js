/**
 * Icon Generator for AI Chat Exporter
 * Run with: node generate-icons.js
 * Generates SVG-based PNG icons at 16, 32, 48, 128px
 */

const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const sizes = [16, 32, 48, 128];
const outDir = path.join(__dirname, 'icons');

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

function drawIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#7c3aed');
  grad.addColorStop(1, '#06b6d4');

  const r = size * 0.2; // corner radius
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(size - r, 0);
  ctx.quadraticCurveTo(size, 0, size, r);
  ctx.lineTo(size, size - r);
  ctx.quadraticCurveTo(size, size, size - r, size);
  ctx.lineTo(r, size);
  ctx.quadraticCurveTo(0, size, 0, size - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Draw a download arrow (↓ into document)
  const pad = size * 0.2;
  const w = size - pad * 2;
  const h = size - pad * 2;

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1, size * 0.08);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const cx = size / 2;
  const arrowTop = pad;
  const arrowBottom = size * 0.62;
  const arrowHeadY = arrowBottom;
  const arrowHeadSize = size * 0.14;
  const baseY = size - pad;
  const baseLeft = pad;
  const baseRight = size - pad;

  // Vertical line
  ctx.beginPath();
  ctx.moveTo(cx, arrowTop);
  ctx.lineTo(cx, arrowBottom);
  ctx.stroke();

  // Arrow head
  ctx.beginPath();
  ctx.moveTo(cx - arrowHeadSize, arrowHeadY - arrowHeadSize);
  ctx.lineTo(cx, arrowHeadY);
  ctx.lineTo(cx + arrowHeadSize, arrowHeadY - arrowHeadSize);
  ctx.stroke();

  // Base line
  ctx.beginPath();
  ctx.moveTo(baseLeft, baseY);
  ctx.lineTo(baseRight, baseY);
  ctx.stroke();

  const buffer = canvas.toBuffer('image/png');
  const outPath = path.join(outDir, `icon${size}.png`);
  fs.writeFileSync(outPath, buffer);
  console.log(`✓ Generated ${outPath}`);
}

sizes.forEach(drawIcon);
console.log('\n✅ All icons generated!');
