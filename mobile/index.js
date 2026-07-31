import 'react-native-gesture-handler';

require('react-native-get-random-values');
// Supabase's JS client uses the URL constructor internally — RN's JS
// engine (Hermes) doesn't implement it, this polyfills it globally.
// Must load before anything imports @supabase/supabase-js.
require('react-native-url-polyfill/auto');

if (typeof global.process === 'undefined') {
  global.process = {
    env: {},
    nextTick: function (cb) { setTimeout(cb, 0); },
    version: '',
    versions: {},
    platform: 'ios',
  };
}
if (!global.process.env) {
  global.process.env = {};
}

if (typeof global.Buffer === 'undefined') {
  global.Buffer = require('buffer').Buffer;
}

require('expo-router/entry');
