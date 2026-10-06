'use strict';
// The only places Belific ever opens in the system browser (L3 of the cp6
// review). Everything else is ignored. Exact https hosts, with a path prefix.
// A future marketing site domain must be added here.
const ALLOWED = [
  // Sign in with Apple, through Supabase (main.js builds the URL checks too).
  { host: 'uucycebkpgwbktdytxvr.supabase.co', path: '/auth/v1/authorize' },
  // Privacy policy and terms pages of the published site (privacy.html, terms.html).
  { host: 'najeca.github.io', path: '/belific/' },
  // Support: the issue tracker linked from privacy.html and terms.html.
  { host: 'github.com', path: '/najeca/belific/issues' },
];

function isAllowedExternal(raw) {
  let url;
  try {
    url = new URL(String(raw));
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
  return ALLOWED.some((a) => url.hostname === a.host && url.pathname.startsWith(a.path));
}

module.exports = { isAllowedExternal, ALLOWED };
