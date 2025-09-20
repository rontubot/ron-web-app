const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

(function main() {
  const inPng  = path.join(__dirname, '..', 'public', 'favicon.png');
  const inIco  = path.join(__dirname, '..', 'public', 'favicon.ico');
  const outIco = path.join(__dirname, '..', 'build', 'icon.ico'); // 👈 aquí (no build/icons)

  if (!fs.existsSync(inPng)) {
    if (!fs.existsSync(inIco)) {
      console.error('❌ Falta public/favicon.png o public/favicon.ico');
      process.exit(1);
    }
    // ico -> png (una sola vez)
    execFileSync('magick', [inIco, inPng], { stdio: 'inherit' });
  }

  fs.mkdirSync(path.dirname(outIco), { recursive: true });

  // Cuadrar a 512x512 y generar .ico multi-size (ImageMagick)
  const sqPng = path.join(__dirname, '..', 'public', 'favicon-512.png');
  execFileSync('magick', [
    inPng, '-resize', '512x512^', '-gravity', 'center', '-background', 'none', '-extent', '512x512',
    sqPng
  ], { stdio: 'inherit' });

  execFileSync('magick', [
    sqPng, '-define', 'icon:auto-resize=256,128,64,48,32,24,16',
    outIco
  ], { stdio: 'inherit' });

  console.log('✅ ICO generado en', outIco);
})();
