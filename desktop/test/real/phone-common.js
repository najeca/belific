'use strict';
// The phone touch harness (PLAN_phone P2). The web export draws the phone layout below 640 px
// (lib/useIsDesktop.ts), so the real app can be driven as an iPhone: the window's page is emulated
// at 390 x 844 (Chrome DevTools Protocol, Emulation.setDeviceMetricsOverride, mobile) and fingers
// are real touch events (Input.dispatchTouchEvent: touchStart, touchMove in small timed steps,
// touchEnd). Gesture handler's web build reads these as pointer events, the same path a finger takes.
// What this cannot prove (native gesture feel, haptics, notifications): docs/PLAN_phone.md section 7.
const C = require('./common');

async function phoneWindow(win, { width = 390, height = 844 } = {}) {
  const dbg = win.webContents.debugger;
  if (!dbg.isAttached()) dbg.attach('1.3');
  const send = (method, params = {}) => dbg.sendCommand(method, params);
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  const js = (code) => win.webContents.executeJavaScript(code, true);

  const point = async (expr) => {
    const r = await js(`(() => { const e = ${expr}; if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height, top: b.top, left: b.left }; })()`);
    if (!r) throw new Error(`no element for ${expr}`);
    return r;
  };
  const touch = (type, x, y) => send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: Math.round(x), y: Math.round(y), id: 1, radiusX: 4, radiusY: 4, force: 1 }] });

  // A finger down, a path of small timed moves, and up. `hold` waits before the first move.
  async function gesture(x, y, { dx = 0, dy = 0, ms = 80, hold = 0, steps = 10 } = {}) {
    await touch('touchStart', x, y);
    if (hold) await C.sleep(hold);
    if (dx || dy) {
      for (let i = 1; i <= steps; i++) {
        await C.sleep(ms / steps);
        await touch('touchMove', x + (dx * i) / steps, y + (dy * i) / steps);
      }
    } else if (!hold) {
      await C.sleep(ms);
    }
    await touch('touchEnd', x + dx, y + dy);
  }

  const finger = {
    // A quick still tap.
    tap: async (expr, wait = 400) => {
      const p = await point(expr);
      await gesture(p.x, p.y, { ms: 70 });
      await C.sleep(wait);
    },
    tapAt: async (x, y, wait = 400) => {
      await gesture(x, y, { ms: 70 });
      await C.sleep(wait);
    },
    // A still touch held, then lifted.
    hold: async (expr, ms = 480, wait = 400) => {
      const p = await point(expr);
      await gesture(p.x, p.y, { hold: ms });
      await C.sleep(wait);
    },
    // A finger that starts on an element and moves.
    drag: async (expr, dx, dy, ms = 220, wait = 400, from) => {
      const p = await point(expr);
      const x = from ? p.left + from.x : p.x;
      const y = from ? p.top + from.y : p.y;
      await gesture(x, y, { dx, dy, ms, steps: Math.max(8, Math.round(ms / 16)) });
      await C.sleep(wait);
    },
    // Hold still, then move without lifting (a block drag).
    holdDrag: async (expr, dx, dy, holdMs = 480, ms = 400, wait = 500) => {
      const p = await point(expr);
      await touch('touchStart', p.x, p.y);
      await C.sleep(holdMs);
      const steps = Math.max(10, Math.round(ms / 16));
      for (let i = 1; i <= steps; i++) {
        await C.sleep(ms / steps);
        await touch('touchMove', p.x + (dx * i) / steps, p.y + (dy * i) / steps);
      }
      await C.sleep(120);
      await touch('touchEnd', p.x + dx, p.y + dy);
      await C.sleep(wait);
    },
    // A slow lift: too long for a tap, too short for a hold.
    slow: async (expr, ms = 320, wait = 400) => {
      const p = await point(expr);
      await gesture(p.x, p.y, { hold: ms });
      await C.sleep(wait);
    },
  };
  return { js, point, finger, send };
}

module.exports = { phoneWindow };
