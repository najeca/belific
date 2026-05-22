require('react-native-get-random-values');

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
