'use strict';

/* Builds the QR code that phones scan to open the app page.
   Uses the vendored qrcode-generator library (website/qrcode.js). */

(function () {
  const container = document.getElementById('qr-code');
  const urlInput = document.getElementById('qr-url');
  const hint = document.getElementById('qr-hint');
  const localNote = document.getElementById('qr-local-note');
  if (!container || !urlInput) return;

  function appUrl() {
    // The app page lives in app/index.html next to this page.
    return new URL('app/index.html', location.href).href;
  }

  function render(url) {
    container.innerHTML = '';
    try {
      const qr = qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      const svg = qr
        .createSvgTag({ cellSize: 4, margin: 2, scalable: true })
        .replace(/fill="black"/g, 'fill="#1d1b16"');
      const box = document.createElement('div');
      box.className = 'qr-box';
      box.innerHTML = svg;
      container.appendChild(box);
      hint.textContent =
        'Scan with your phone camera. The app page opens, and you can install it from there.';
      if (localNote) localNote.hidden = true;
    } catch (e) {
      hint.textContent = 'Could not build a QR code for this address.';
    }
  }

  const typed = urlInput.value.trim();
  if (typed) {
    render(typed);
  } else if (location.protocol === 'file:') {
    // Opening the page straight from disk: there is no address a phone can scan.
    if (localNote) localNote.hidden = false;
    hint.textContent = 'The QR code needs the web address where this site is hosted.';
  } else {
    render(appUrl());
  }

  urlInput.addEventListener('input', function () {
    const v = urlInput.value.trim();
    if (v) render(v);
  });
})();
