'use strict';

/* Builds the QR code that phones scan to open the app page. */
(function () {
  var container = document.getElementById('qr-code');
  var urlInput = document.getElementById('qr-url');
  var hint = document.getElementById('qr-hint');
  if (!container) return;

  function appUrl() {
    return new URL('app/index.html', location.href).href;
  }

  function render(url) {
    container.innerHTML = '';
    try {
      var qr = qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      var svg = qr
        .createSvgTag({ cellSize: 4, margin: 2, scalable: true })
        .replace(/fill="black"/g, 'fill="#1d1b16"');
      var box = document.createElement('div');
      box.className = 'qr-box';
      box.innerHTML = svg;
      container.appendChild(box);
      hint.textContent = 'Scan this with your phone camera to open the app.';
    } catch (e) {
      hint.textContent = 'Could not build a QR code.';
    }
  }

  if (location.protocol === 'file:') {
    // Opening from disk: QR code needs a hosted URL
    if (urlInput) urlInput.style.display = 'block';
    hint.textContent = 'Paste your hosted site address above to generate a QR code.';
    var typed = urlInput ? urlInput.value.trim() : '';
    if (typed) render(typed);
    if (urlInput) urlInput.addEventListener('input', function () {
      var v = urlInput.value.trim();
      if (v) render(v);
    });
  } else {
    // Hosted site: auto-generate QR, hide the URL input
    if (urlInput) urlInput.style.display = 'none';
    render(appUrl());
  }
})();
