'use strict';
// Real input helpers shared by the phase 4 and 5 real checks (p2 and p3 keep
// their own copies). Real mouse and keyboard events through sendInputEvent,
// text through insertText; reads through executeJavaScript.
const fs = require('node:fs');
const path = require('node:path');
const C = require('./common');

function makeInput(win, shotsDir) {
  const js = (code) => win.webContents.executeJavaScript(code, true);
  const body = () => js('document.body.innerText');
  const waitBody = (text, ms = 15000) => C.waitFor(async () => (await body()).includes(text), ms);
  const visible = (sel) => `Array.from(document.querySelectorAll(${JSON.stringify(sel)})).find((e) => e.getBoundingClientRect().width > 0)`;
  const byLabel = (label) => visible(`[aria-label=${JSON.stringify(label)}]`);
  const rectOf = (expr) =>
    js(`(() => { const el = ${expr}; if (!el) return null; el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const r = el.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
  const click = async (expr, wait = 350) => {
    let r = await rectOf(expr);
    if (!r) throw new Error(`no element for ${expr}`);
    for (let i = 0; i < 10; i++) {
      win.webContents.sendInputEvent({ type: 'mouseMove', x: r.x, y: r.y });
      await C.sleep(120);
      const again = await rectOf(expr);
      const same = again && again.x === r.x && again.y === r.y;
      r = again || r;
      if (same) break;
    }
    win.webContents.sendInputEvent({ type: 'mouseDown', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    win.webContents.sendInputEvent({ type: 'mouseUp', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    await C.sleep(wait);
  };
  // Moves the real mouse over an element without pressing it (a hover).
  const hover = async (expr, wait = 300) => {
    const r = await rectOf(expr);
    if (!r) throw new Error(`no element for ${expr}`);
    win.webContents.sendInputEvent({ type: 'mouseMove', x: r.x - 1, y: r.y });
    await C.sleep(100);
    win.webContents.sendInputEvent({ type: 'mouseMove', x: r.x, y: r.y });
    await C.sleep(wait);
  };
  const key = async (keyCode, modifiers = [], wait = 250) => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
    await C.sleep(wait);
  };
  const enter = async (modifiers = [], wait = 400) => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return', modifiers });
    win.webContents.sendInputEvent({ type: 'char', keyCode: String.fromCharCode(13), modifiers });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return', modifiers });
    await C.sleep(wait);
  };
  const type = async (text, wait = 150) => {
    await win.webContents.insertText(text);
    await C.sleep(wait);
  };
  const exists = (expr) => js(`!!${expr}`);
  const activeLabel = () => js(`document.activeElement && document.activeElement.getAttribute('aria-label')`);
  const blur = () => js('document.activeElement && document.activeElement.blur()');
  const dialog = (name) => `document.querySelector('[role="dialog"][aria-label=${JSON.stringify(name)}]')`;
  const textOf = (expr) => js(`(${expr} || {}).innerText || ''`);
  const shot = async (name) => {
    if (!shotsDir) return;
    fs.mkdirSync(shotsDir, { recursive: true });
    fs.writeFileSync(path.join(shotsDir, `${name}.png`), (await win.webContents.capturePage()).toPNG());
  };
  // 3.35.0: a drag driven by PointerEvents dispatched in the page (the app's own drag code reads them), so the real
  // mouse never moves and a check can run quiet. Pressed on `expr` at the time `fromMin` of the visible grid
  // `gridSel` (56 px an hour), moved to `toMin` (in the column under `toXExpr`, else straight down), held `holdMs`,
  // then released unless `release` is false (`dragRelease` does it later). Returns the lifted card's text.
  const drag = (expr, gridSel, fromMin, toMin, { toXExpr = null, holdMs = 250, release = true, steps = 8 } = {}) =>
    js(`(async () => {
      const el = ${expr};
      const grid = [...document.querySelectorAll(${JSON.stringify(gridSel)})].find((e) => e.getBoundingClientRect().width > 0);
      if (!el || !grid) return null;
      const r = el.getBoundingClientRect();
      const x0 = r.left + r.width / 2;
      const tx = ${toXExpr ? `(${toXExpr})` : 'null'};
      const x1 = tx ? tx.getBoundingClientRect().left + tx.getBoundingClientRect().width / 2 : x0;
      const top = grid.getBoundingClientRect().top;
      const yOf = (m) => top + (m / 60) * 56;
      const o = (x, y) => ({ bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 0, buttons: 1, pointerId: 7, pointerType: 'mouse', isPrimary: true });
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      el.dispatchEvent(new PointerEvent('pointerdown', o(x0, yOf(${fromMin}))));
      for (let i = 1; i <= ${steps}; i++) {
        window.dispatchEvent(new PointerEvent('pointermove', o(x0 + ((x1 - x0) * i) / ${steps}, yOf(${fromMin} + ((${toMin} - ${fromMin}) * i) / ${steps}))));
        await wait(40);
      }
      await wait(${holdMs});
      window.dispatchEvent(new PointerEvent('pointermove', o(x1, yOf(${toMin}))));
      await wait(60);
      const hint = (document.querySelector('[data-lifted-card]') || {}).innerText || '';
      window.__belificDragAt = o(x1, yOf(${toMin}));
      if (${release ? 'true' : 'false'}) window.dispatchEvent(new PointerEvent('pointerup', window.__belificDragAt));
      return hint;
    })()`);
  const dragRelease = () => js(`(() => { if (window.__belificDragAt) window.dispatchEvent(new PointerEvent('pointerup', window.__belificDragAt)); return true; })()`);
  return { js, body, waitBody, visible, byLabel, click, hover, key, enter, type, exists, activeLabel, blur, dialog, textOf, shot, drag, dragRelease };
}

// Local date keys, shifted by whole days (calendar arithmetic).
function dayKeyFrom(now) {
  const pad = (n) => String(n).padStart(2, '0');
  return (shift) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + shift);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
}

function readKv(dataDir) {
  return (key) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dataDir, `${key}.kv`), 'utf8'));
    } catch {
      return null;
    }
  };
}

module.exports = { makeInput, dayKeyFrom, readKv };
