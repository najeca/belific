'use strict';
// One-off helper: converts mobile/assets/belificappicon.png into the sizes the
// desktop app needs (and, since 2.26.0, mobile/assets/belific-mark.png) (run with `npx electron scripts/make-icons.js`). The
// outputs in desktop/assets are committed, so this only reruns if the source
// icon changes. electron-builder turns assets/icon.png into the Windows .ico.
const { app, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

app.whenReady().then(() => {
  const source = nativeImage.createFromPath(path.join(__dirname, '..', '..', 'mobile', 'assets', 'belificappicon.png'));
  if (source.isEmpty()) throw new Error('source icon not found');
  const out = path.join(__dirname, '..', 'assets');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'icon.png'), source.resize({ width: 256, height: 256, quality: 'best' }).toPNG());
  fs.writeFileSync(path.join(out, 'tray.png'), source.resize({ width: 32, height: 32, quality: 'best' }).toPNG());
  // 2.26.0: the mark cropped close (the B on its cream square) for the
  // sidebar's top left, shown at 28 px, kept at 96 px for sharp scaling.
  const mark = source.crop({ x: 275, y: 255, width: 480, height: 480 }).resize({ width: 96, height: 96, quality: 'best' });
  fs.writeFileSync(path.join(__dirname, '..', '..', 'mobile', 'assets', 'belific-mark.png'), mark.toPNG());
  app.quit();
});
