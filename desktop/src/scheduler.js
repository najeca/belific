'use strict';
// Notification scheduling for the desktop (decision 017, decision 020).
// Pure Node, no Electron imports: timers, clock and the notify function are
// injected so every rule is unit tested.
//
// The renderer sends a payload whenever data changes:
//   { events:  [{ id, title, icon?, start }],        // CustomEvent starts, epoch ms (local wall time)
//     placed:  [{ id, title, start, completed }],    // tasks with a Day AND a startTime
//     planned: [{ dueDate, completed, startTime? }] } // tasks planned for a day
// and main keeps one timer per notifiable item for the next 48 hours.
// Only user set commitments notify (events and placed tasks), plus one
// grouped daily reminder for planned tasks that have no time (decision 020).
const WINDOW_MS = 48 * 60 * 60 * 1000;
const MAX_ITEMS = 500;
// A timer that fires later than this (the computer was asleep) is dropped
// rather than shown as a stale toast.
const MAX_LATE_MS = { event: 5 * 60 * 1000, task: 5 * 60 * 1000, daily: 3 * 60 * 60 * 1000 };
const HM = /^([01]\d|2[0-3]):([0-5]\d)$/;

const pad = (n) => String(n).padStart(2, '0');

// The machine's own time zone. Tests pass a fixed offset zone instead.
const localZone = {
  dateKey(ms) {
    const d = new Date(ms);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  },
  // Local wall time of `key` at "HH:mm", as epoch ms.
  at(key, hm) {
    const [y, m, d] = key.split('-').map(Number);
    const [h, min] = hm.split(':').map(Number);
    return new Date(y, m - 1, d, h, min, 0, 0).getTime();
  },
  // The date key `n` calendar days after the one containing `ms` (DST safe).
  addDays(ms, n) {
    const d = new Date(ms);
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  },
};

// A zone with a fixed UTC offset in minutes (east positive), for tests.
function fixedZone(offsetMinutes) {
  const shift = offsetMinutes * 60000;
  const key = (ms) => new Date(ms + shift).toISOString().slice(0, 10);
  return {
    dateKey: key,
    at(k, hm) {
      const [y, m, d] = k.split('-').map(Number);
      const [h, min] = hm.split(':').map(Number);
      return Date.UTC(y, m - 1, d, h, min, 0, 0) - shift;
    },
    addDays(ms, n) {
      return key(ms + n * 86400000);
    },
  };
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isStr = (v) => typeof v === 'string';
const clip = (s, n) => (s.length > n ? s.slice(0, n) : s);

function dailyBody(count) {
  return count === 1 ? '1 task planned for today' : `${count} tasks planned for today`;
}

// What should be scheduled right now: [{ key, at, kind, title, body }].
function plan({ payload, settings, now, zone = localZone }) {
  const out = [];
  const p = payload || {};
  const horizon = now + WINDOW_MS;

  if (settings.notifyEvents) {
    for (const e of (Array.isArray(p.events) ? p.events : []).slice(0, MAX_ITEMS)) {
      if (!e || !isStr(e.id) || !isStr(e.title) || !isNum(e.start)) continue;
      if (e.start <= now || e.start > horizon) continue;
      const icon = isStr(e.icon) ? clip(e.icon, 8) : '';
      out.push({ key: `event:${clip(e.id, 120)}`, at: e.start, kind: 'event', title: clip(e.title, 200), body: `${icon ? icon + ' ' : ''}Starting now` });
    }
  }
  if (settings.notifyTasks) {
    for (const t of (Array.isArray(p.placed) ? p.placed : []).slice(0, MAX_ITEMS)) {
      if (!t || !isStr(t.id) || !isStr(t.title) || !isNum(t.start)) continue;
      if (t.completed === true) continue;
      if (t.start <= now || t.start > horizon) continue;
      out.push({ key: `task:${clip(t.id, 120)}`, at: t.start, kind: 'task', title: clip(t.title, 200), body: 'Starting now' });
    }
  }
  if (settings.dailyReminder && HM.test(settings.dailyTime)) {
    const planned = (Array.isArray(p.planned) ? p.planned : []).slice(0, MAX_ITEMS * 4);
    for (let offset = 0; offset <= 2; offset++) {
      const day = zone.addDays(now, offset);
      const at = zone.at(day, settings.dailyTime);
      if (at <= now || at > horizon) continue;
      const count = planned.filter((t) => t && t.dueDate === day && t.completed !== true && !t.startTime).length;
      if (count === 0) continue;
      out.push({ key: `daily:${day}`, at, kind: 'daily', title: 'Belific', body: dailyBody(count) });
    }
  }
  return out;
}

class Scheduler {
  constructor({ notify, settings, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout, zone = localZone, log = () => {} }) {
    this.notify = notify;
    this.settings = settings;
    this.nowFn = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.zone = zone;
    this.log = log;
    this.payload = null;
    this.timers = new Map(); // key -> { sig, at, item, handle }
    this.fired = new Map(); // sig -> at, so a re-send never repeats a toast
  }

  update(payload) {
    this.payload = payload;
    this.reschedule();
  }

  setSettings(settings) {
    this.settings = settings;
    this.reschedule();
  }

  // After the computer wakes: timers that should have fired fire now (if not
  // too late), then everything is re-planned against the real clock.
  refresh() {
    const now = this.nowFn();
    for (const [key, t] of [...this.timers]) {
      if (t.at <= now) {
        this.clearTimer(t.handle);
        this.timers.delete(key);
        this.fire(key, t, now);
      }
    }
    this.reschedule();
  }

  reschedule() {
    const now = this.nowFn();
    const wanted = new Map();
    for (const item of plan({ payload: this.payload, settings: this.settings, now, zone: this.zone })) {
      wanted.set(item.key, { ...item, sig: `${item.key}|${item.at}|${item.title}|${item.body}` });
    }
    for (const [key, t] of [...this.timers]) {
      const w = wanted.get(key);
      if (!w || w.sig !== t.sig) {
        this.clearTimer(t.handle);
        this.timers.delete(key);
      }
    }
    for (const [key, w] of wanted) {
      if (this.timers.has(key)) continue;
      if (this.fired.has(w.sig)) continue;
      const entry = { sig: w.sig, at: w.at, item: w, handle: null };
      entry.handle = this.setTimer(() => {
        this.timers.delete(key);
        this.fire(key, entry, this.nowFn());
      }, Math.max(0, w.at - now));
      this.timers.set(key, entry);
    }
    for (const [sig, at] of [...this.fired]) {
      if (at < now - 3 * WINDOW_MS) this.fired.delete(sig);
    }
  }

  fire(_key, entry, now) {
    this.fired.set(entry.sig, entry.at);
    if (now - entry.at > MAX_LATE_MS[entry.item.kind]) {
      this.log(`skipped a late ${entry.item.kind} notification`);
      return;
    }
    try {
      this.notify({ kind: entry.item.kind, key: entry.item.key, title: entry.item.title, body: entry.item.body });
    } catch (err) {
      this.log(`notify failed: ${err && err.message}`);
    }
  }

  // For tests and the status line: what is scheduled, soonest first.
  pending() {
    return [...this.timers.values()].map((t) => t.item).sort((a, b) => a.at - b.at);
  }

  stop() {
    for (const t of this.timers.values()) this.clearTimer(t.handle);
    this.timers.clear();
  }
}

module.exports = { Scheduler, plan, dailyBody, localZone, fixedZone, WINDOW_MS, MAX_LATE_MS, HM };
