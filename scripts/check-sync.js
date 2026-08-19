'use strict';

/*
 * Diagnose a Supabase project URL + anon key in one command:
 *   node scripts/check-sync.js <SUPABASE_URL> <ANON_KEY>
 *
 * Reports each layer: DNS, HTTPS reachability, project status, and table access.
 * When every line says "ok", that URL + key can be baked into
 * website/app/supabase-config.js so every user syncs with zero setup.
 */

const https = require('https');
const dns = require('dns').promises;

const [urlRaw = '', key = ''] = process.argv.slice(2);

function cleanUrl(u) {
  return u.replace(/\/+$/, '');
}

async function dnsCheck(host) {
  try {
    const r = await dns.resolve4(host);
    return { ok: true, ips: r.slice(0, 2) };
  } catch (e1) {
    try {
      dns.setServers(['8.8.8.8']);
      const r = await dns.resolve4(host);
      return { ok: true, ips: r.slice(0, 2), via: '8.8.8.8' };
    } catch (e2) {
      return { ok: false, error: e1.code || e1.message };
    }
  }
}

function getJson(url, headers = {}) {
  return new Promise((resolve) => {
    const req = https.get(url, { headers, timeout: 12000 }, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => resolve({ status: res.statusCode, body: body.slice(0, 300) }));
    });
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: 'timeout' }); });
    req.on('error', (e) => resolve({ status: 0, body: e.message }));
  });
}

function report(name, ok, detail) {
  console.log((ok ? '  ok  ' : '  FAIL ') + name + (detail ? '  ' + detail : ''));
}

(async () => {
  if (!urlRaw || !key) {
    console.log('Usage: node scripts/check-sync.js <SUPABASE_URL> <ANON_KEY>');
    console.log('Example: node scripts/check-sync.js https://xxxx.supabase.co eyJhbGciOi...');
    process.exit(1);
  }

  const url = cleanUrl(urlRaw);
  let host;
  try {
    host = new URL(url).host;
  } catch (e) {
    console.log('Invalid URL.', e.message);
    process.exit(1);
  }

  console.log('Checking ' + url);

  const d = await dnsCheck(host);
  report('DNS resolves', d.ok, d.ok ? d.ips.join(', ') : d.error);
  if (!d.ok) {
    console.log('\nThe project cannot be found. It may be paused or deleted.');
    console.log('Create a new free project at https://supabase.com, then re-run this check.');
    process.exit(1);
  }

  const health = await getJson(url + '/auth/v1/health', { apikey: key });
  report('HTTP reachable', health.status === 200, 'status ' + health.status);

  const api = await getJson(url + '/rest/v1/notes?select=id&limit=1', {
    apikey: key,
    Authorization: 'Bearer ' + key,
    Accept: 'application/json'
  });
  report('Data API + tables', api.status === 200, api.status === 200 ? 'notes table reachable' : 'status ' + api.status + (api.body ? '  ' + api.body : ''));

  const allGood = d.ok && health.status === 200 && api.status === 200;
  if (allGood) {
    console.log('\nAll good - this URL + key can be baked into supabase-config.js.');
  } else {
    console.log('\nSomething failed above. If the project is paused, resume it in the Supabase dashboard and re-run.');
  }
  process.exit(allGood ? 0 : 1);
})();