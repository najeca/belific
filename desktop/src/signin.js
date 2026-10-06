'use strict';
// Ties the AuthGate to the PKCE verifier kept in the SecureStore (cp6.1).
// auth-js deletes the verifier even when an exchange fails, so a stray link
// would destroy a real sign in. Before each exchange a private copy of the
// verifier entries is taken (main process memory, never on disk); a failed
// exchange puts it back. Whenever the sign in ends for any reason the
// verifiers and the copy are wiped.
const { AuthGate } = require('./authLink');

class SignIn {
  constructor(secure, supabaseHost, windowMs, onEnd = () => {}) {
    this.secure = secure;
    this.copy = null;
    this.gate = new AuthGate(supabaseHost, windowMs, (reason) => {
      this.copy = null;
      this.secure.wipeVerifiers();
      onEnd(reason);
    });
  }

  // The renderer has already asked auth-js for the URL, which stored a verifier.
  begin(url, now) {
    const result = this.gate.begin(url, now);
    if (result.ok) {
      this.copy = this.secure.snapshotVerifiers();
    } else if (result.reason === 'busy') {
      // A second begin must not damage the running one.
      this.secure.restoreVerifiers(this.copy);
    } else {
      this.secure.wipeVerifiers();
    }
    return result;
  }

  // A link arrived. A good one takes the private copy just before the exchange.
  onLink(raw, now) {
    const result = this.gate.accept(raw, now);
    if (result.ok) this.copy = this.secure.snapshotVerifiers();
    return result;
  }

  finish(success, now) {
    const result = this.gate.finish(success, now);
    if (!result.ended && !success) this.secure.restoreVerifiers(this.copy);
    return result;
  }

  cancel() {
    this.gate.cancel();
    // A cancel before any begin (a failed begin in the page) still wipes.
    this.copy = null;
    this.secure.wipeVerifiers();
  }

  sweep(now) {
    this.gate.sweep(now);
  }
}

module.exports = { SignIn };
