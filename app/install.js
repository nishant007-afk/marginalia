'use strict';

/* Top install banner for the phone PWA. Shows immediately when possible. */

(function () {
  const bar = document.getElementById('install-bar');
  const btn = document.getElementById('btn-install');
  const text = document.getElementById('install-text');
  if (!bar) return;

  function isStandalone() {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    );
  }

  // Already installed or opened in browser mode from home screen: hide.
  if (isStandalone()) return;

  var isIOS = /iP(hone|ad|od)/.test(navigator.userAgent);
  var deferredPrompt = null;

  // Android / Chrome / Edge: capture the install prompt and show the bar.
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    text.textContent = 'Add Marginalia to your home screen';
    btn.textContent = 'Install';
    bar.hidden = false;
  });

  // iOS Safari: no install event exists. Show a manual hint.
  if (isIOS && !window.navigator.standalone) {
    text.textContent = 'To install: tap the Share button, then "Add to Home Screen"';
    btn.hidden = true;
    bar.hidden = false;
  }

  // Android fallback: if no beforeinstallprompt after 3s, show a manual hint.
  setTimeout(function () {
    if (!isIOS && bar.hidden) {
      text.textContent = 'Open this page in Chrome to install';
      btn.hidden = true;
      bar.hidden = false;
    }
  }, 3500);

  if (btn) {
    btn.addEventListener('click', function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function () {
        bar.hidden = true;
        deferredPrompt = null;
      });
    });
  }

  window.addEventListener('appinstalled', function () {
    bar.hidden = true;
  });
})();
