'use strict';

/* Renders the Marginalia pen mark to PNG icons (PWA) and a Windows .ico.
   Run with: npm run icons */

const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#17150f"/>
  <g transform="translate(256 256) scale(10.5) translate(-12 -12)" fill="none" stroke="#c9a86a" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 19l7-7 3 3-7 7-3-3z"/>
    <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
    <path d="M2 2l7.586 7.586"/>
    <circle cx="11" cy="11" r="2"/>
  </g>
</svg>`;

function icoFromPng(png) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // count: 1
  const entry = Buffer.alloc(16);
  entry.writeUInt8(0, 0); // width (0 means 256)
  entry.writeUInt8(0, 1); // height
  entry.writeUInt8(0, 2); // color count
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // color planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(png.length, 8); // size of image data
  entry.writeUInt32LE(22, 12); // offset of image data (6 + 16)
  return Buffer.concat([header, entry, png]);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 512,
    height: 512,
    useContentSize: true,
    webPreferences: { offscreen: true }
  });
  await win.loadURL(
    'data:text/html;charset=utf-8,' +
      encodeURIComponent(
        `<!doctype html><html><head><style>html,body{margin:0;padding:0;background:#17150f;overflow:hidden}</style></head><body>${SVG}</body></html>`
      )
  );
  await new Promise((r) => setTimeout(r, 700));
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  if (image.isEmpty()) throw new Error('captured image is empty');
  win.destroy();

  const root = path.resolve(__dirname, '..');
  const appDir = path.join(root, 'website', 'app');
  fs.mkdirSync(appDir, { recursive: true });
  fs.writeFileSync(path.join(appDir, 'icon-512.png'), image.resize({ width: 512, height: 512 }).toPNG());
  fs.writeFileSync(path.join(appDir, 'icon-192.png'), image.resize({ width: 192, height: 192 }).toPNG());
  fs.writeFileSync(path.join(appDir, 'favicon.png'), image.resize({ width: 48, height: 48 }).toPNG());

  const buildDir = path.join(root, 'build');
  fs.mkdirSync(buildDir, { recursive: true });
  const png256 = image.resize({ width: 256, height: 256 }).toPNG();
  fs.writeFileSync(path.join(buildDir, 'icon.ico'), icoFromPng(png256));
  fs.writeFileSync(path.join(buildDir, 'icon.png'), png256);

  console.log('icons written to website/app/ and build/');
  app.quit();
}).catch((err) => {
  console.error(err);
  app.exit(1);
});
