 (function () {
    const CFG = {
      vars: {
        journeyType: 'booking_journey_type', 
        asap: 'booking_pickup_asap', 
        pickupAt: 'booking_pickup_at', 
        pickupAtUtc: 'booking_pickup_at_utc',
        returnAt: 'booking_return_at',
        returnAtUtc: 'booking_return_at_utc',
      },
      oneWayOnly: '#add-return-date, [data-dtp-one-way-only]', 
      hideClass: 'hide',
      clearButton: '[data-dtp-clear]',
      listenForJobs: true,
      startAsap: true, 
      timeZone: 'Europe/London', 
      leadMins: 0, 
      minGapMins: 30,
      defaultReturnMins: 120,
      defaultTime: '09:00',
      minuteStep: 5,
      monthsAhead: 18, 
      sheetBelow: 480, 
      followField: 'single',
      closeOnAsap: true,
      debug: false,
      weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
      monthsShort: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      daysShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      text: {
        asap: 'As soon as possible',
        tabAsap: 'Now',
        noTime: '--:--',
        pickDateOut: 'Pick a pickup date',
        pickDateRet: 'Pick a return date',
        labelOut: 'Pickup',
        labelRet: 'Return',
        errEarliest: 'Earliest {t}',
        errReturn: 'Return from {t}',
        errGap: 'Clocks go forward then',
        errHour: 'Hours 0–23',
        errMinute: 'Minutes 00–59',
      },
      // combo classes the code adds/removes — design each one in Webflow
      cls: {
        active: 'is-active',
        empty: 'is-empty',
        idle: 'is-idle',
        selected: 'is-selected',
        disabled: 'is-disabled',
        today: 'is-today',
        pickup: 'is-pickup',
        ret: 'is-return',
        range: 'is-range',
        same: 'is-same-day',
        error: 'is-error',
        rowStart: '',
        rowEnd: '', 
        blank: 'is-blank',
      },
    };
    const MIN = 60000,
      HOUR = 3600000,
      DAY = 86400000,
      STEP = CFG.minuteStep * MIN;
    const W = (y, m, d, h = 0, mi = 0) => Date.UTC(y, m, d, h, mi);
    const P = (w) => {
      const x = new Date(w);
      return { y: x.getUTCFullYear(), m: x.getUTCMonth(), d: x.getUTCDate(), h: x.getUTCHours(), mi: x.getUTCMinutes(), dow: x.getUTCDay() };
    };
    const sod = (w) => {
      const p = P(w);
      return W(p.y, p.m, p.d);
    };
    const som = (w) => {
      const p = P(w);
      return W(p.y, p.m, 1);
    };
    const addMonths = (w, n) => {
      const p = P(w);
      return W(p.y, p.m + n, 1);
    };
    const daysIn = (w) => {
      const p = P(w);
      return new Date(W(p.y, p.m + 1, 0)).getUTCDate();
    };
    const pad = (n) => String(n).padStart(2, '0');

    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: CFG.timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    });
    const fmtZone = new Intl.DateTimeFormat('en-GB', { timeZone: CFG.timeZone, timeZoneName: 'short' });

    const wallCache = new Map();
    function toWall(i) {
      const k = Math.floor(i / MIN);
      if (wallCache.has(k)) return wallCache.get(k);
      const o = {};
      fmt.formatToParts(new Date(k * MIN)).forEach((p) => {
        if (p.type !== 'literal') o[p.type] = +p.value;
      });
      const w = W(o.year, o.month - 1, o.day, o.hour === 24 ? 0 : o.hour, o.minute);
      if (wallCache.size > 5000) wallCache.clear();
      wallCache.set(k, w);
      return w;
    }
    function toInstant(w) {
      let i = w;
      for (let k = 0; k < 3; k++) i += w - toWall(i);
      if (toWall(i - HOUR) === w) i -= HOUR;
      return i;
    }
    const zoneOf = (i) => (fmtZone.formatToParts(new Date(i)).find((p) => p.type === 'timeZoneName') || {}).value || '';
    const isDoubled = (i) => toWall(i + HOUR) === toWall(i) || toWall(i - HOUR) === toWall(i);
    const dayOf = (i) => sod(toWall(i)); // instant -> wall day
    const sameDay = (a, b) => dayOf(a) === dayOf(b);
    const ceilStep = (i) => Math.ceil(i / STEP) * STEP;
    const isoWall = (i) => {
      const p = P(toWall(i));
      return `${p.y}-${pad(p.m + 1)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}`;
    };
    const hm = (i) => {
      const p = P(toWall(i));
      return pad(p.h) + ':' + pad(p.mi) + (isDoubled(i) ? ' ' + zoneOf(i) : '');
    };
    const hmShort = (i) => {
      const p = P(toWall(i));
      return pad(p.h) + ':' + pad(p.mi);
    };
    const dayLabel = (i) => {
      const p = P(toWall(i));
      return `${CFG.daysShort[p.dow]} ${p.d} ${CFG.monthsShort[p.m]}`;
    };
    const dayStart = (dayW) => toInstant(dayW); // UK midnight always exists
    const dayEnd = (dayW) => toInstant(dayW + DAY);

    const VERSION = '2026-10-08c';
    window.dtpVersion = VERSION;
    function init() {
      const root = document.querySelector('[data-dtp]');
      console.info('[dtp] picker', VERSION);
      if (!root) return;
      const q = (s) => root.querySelector(s);
      const C = CFG.cls;

      const field = { out: q('[data-dtp-field="out"]'), ret: q('[data-dtp-field="ret"]') };
      const tab = { out: q('[data-dtp-tab="out"]'), ret: q('[data-dtp-tab="ret"]') };
      const pop = q('[data-dtp-pop]'),
        monthsWrap = q('[data-dtp-months]');
      const prevBtn = q('[data-dtp-prev]'),
        nextBtn = q('[data-dtp-next]');
      const nowBtn = q('[data-dtp-now]');
      const clock = q('[data-dtp-clock]'),
        label = q('[data-dtp-label]'),
        timeWrap = q('[data-dtp-time]');
      const hourIn = q('[data-dtp-hour]'),
        minIn = q('[data-dtp-minute]'),
        ringLit = q('[data-dtp-ring-lit]');
      const tabsWrap = q('[data-dtp-tabs]');
      const status = q('[data-dtp-status]'),
        doneBtn = q('[data-dtp-done]'); 

      function take(parent, attr) {
        const el = parent && parent.querySelector(`[${attr}]`);
        if (!el) return null;
        el.remove();
        el.removeAttribute(attr);
        el.hidden = false;
        return el;
      }
      const monthTpl = take(monthsWrap, 'data-dtp-month-template');
      const weekdayTpl = take(monthTpl, 'data-dtp-weekday-template');
      const dayTpl = take(monthTpl, 'data-dtp-day-template');

      const required = { fieldOut: field.out, fieldRet: field.ret, pop, monthsWrap, prevBtn, nextBtn, nowBtn, clock, hourIn, minIn, monthTpl, weekdayTpl, dayTpl, monthTitle: monthTpl && monthTpl.querySelector('[data-dtp-month-title]'), weekdaysRow: monthTpl && monthTpl.querySelector('[data-dtp-weekdays]'), grid: monthTpl && monthTpl.querySelector('[data-dtp-grid]') };
      const missing = Object.keys(required).filter((k) => !required[k]);
      if (missing.length) {
        console.warn('[dtp] missing elements:', missing.join(', '));
        return;
      }

      pop.hidden = true;

      function mark(el, cls, on) {
        if (!el || !cls) return;
        el.classList.toggle(cls, !!on);
        el.querySelectorAll('*').forEach((n) => n.classList.toggle(cls, !!on));
      }
      function setText(el, attr, text) {
        const t = el.querySelector(`[${attr}]`) || el;
        t.textContent = text;
      }
      function clickable(el, fn) {
        if (!el) return;
        if (el.tagName !== 'BUTTON' && el.tagName !== 'A') {
          el.setAttribute('role', 'button');
          el.tabIndex = 0;
          el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fn(e);
            }
          });
        }
        el.addEventListener('click', fn);
      }
      function navReady(el, off) {
        // month arrow: focusable + disabled state
        if (el.tagName !== 'BUTTON' && el.tagName !== 'A') {
          el.setAttribute('role', 'button');
          el.tabIndex = off ? -1 : 0;
        }
        mark(el, C.disabled, off);
        el.setAttribute('aria-disabled', String(off));
        if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', el.hasAttribute('data-dtp-prev') ? 'Previous month' : 'Next month');
      }
      [field.out, field.ret].forEach((f) => {
        const v = f.querySelector('[data-dtp-value]');
        if (v) v.dataset.placeholder = v.textContent.trim();
      });
      const S = { type: 'one_way', asap: CFG.startAsap, out: null, ret: null, target: 'out', leg: 'out', view: som(toWall(Date.now())), err: '' };
      const isReturn = () => S.type === 'return';
      const hasOut = () => S.asap || S.out !== null;
      const outEff = () => (S.asap ? Date.now() : S.out);
      const monthsShown = () => 1; 

      const earliest = (leg) => (leg === 'out' ? ceilStep(Date.now() + CFG.leadMins * MIN) : ceilStep(outEff() + CFG.minGapMins * MIN));
      const firstValidFrom = (i, leg) => ceilStep(Math.max(i, earliest(leg)));
      const dayBookable = (dayW) => dayEnd(dayW) - STEP >= earliest('out');

      function at(dayW, h, mi) {
        const i = toInstant(W(P(dayW).y, P(dayW).m, P(dayW).d, h, mi));
        return dayOf(i) === dayW ? i : dayStart(dayW);
      }

      function clamp() {
        const before = [S.out, S.ret].join();
        if (S.out !== null && !S.asap && S.out < earliest('out')) S.out = firstValidFrom(S.out, 'out');
        if (!isReturn()) S.ret = null;
        else if (S.ret !== null && hasOut() && S.ret < earliest('ret')) {
          S.ret = firstValidFrom(sameDay(S.ret, outEff()) ? outEff() + CFG.defaultReturnMins * MIN : S.ret, 'ret');
        }
        return before !== [S.out, S.ret].join();
      }
      function defaultReturn() {
        return firstValidFrom(outEff() + CFG.defaultReturnMins * MIN, 'ret');
      }
      function pickDate(dayW) {
        S.err = '';
        if (S.leg === 'ret' && isReturn() && hasOut()) {
          if (dayW < dayOf(outEff())) return; // can't return before the pickup day
          const ref = S.ret !== null ? S.ret : defaultReturn();
          const t = P(toWall(ref));
          let i = at(dayW, t.h, t.mi);
          if (i < earliest('ret')) i = firstValidFrom(dayW === dayOf(outEff()) ? outEff() + CFG.defaultReturnMins * MIN : i, 'ret');
          S.ret = i;
        } else {
          S.asap = false;
          const [dh, dm] = CFG.defaultTime.split(':').map(Number);
          const t = S.out !== null ? P(toWall(S.out)) : { h: dh, mi: dm };
          let i = at(dayW, t.h, t.mi);
          if (i < earliest('out')) i = firstValidFrom(i, 'out');
          S.out = i;
          S.leg = 'out';
          if (isReturn() && S.ret !== null && dayOf(S.ret) < dayOf(S.out)) S.ret = null; // return now before pickup: clear it
        }
        S.target = S.leg;
        clamp();
        showMonthOf(S.leg === 'ret' ? S.ret : S.out);
        render(true);
        publish();
      }

      function listDay(leg) {
        if (leg === 'out' && S.asap) return dayOf(Date.now());
        return S[leg] !== null ? dayOf(S[leg]) : null;
      }

      // ---------- calendar render ----------
      function showMonthOf(i) {
        if (i === null || i === undefined) return;
        const m = som(toWall(i)),
          n = monthsShown();
        if (m < S.view || m > addMonths(S.view, n - 1)) S.view = m;
      }
      function clampView() {
        const n = monthsShown(),
          min = som(toWall(Date.now())),
          max = addMonths(min, CFG.monthsAhead - n);
        if (S.view < min) S.view = min;
        if (S.view > max) S.view = max;
        return { min, max };
      }

      function renderCal() {
        const { min, max } = clampView();
        const n = monthsShown(),
          today = dayOf(Date.now());
        const a = hasOut() ? dayOf(outEff()) : null,
          b = S.ret !== null ? dayOf(S.ret) : null;
        const minDay = S.leg === 'ret' && a !== null ? a : null; // return open: days before pickup are off
        monthsWrap.innerHTML = '';

        for (let k = 0; k < n; k++) {
          const mw = addMonths(S.view, k),
            mp = P(mw);
          const month = monthTpl.cloneNode(true);
          month.querySelector('[data-dtp-month-title]').textContent = `${CFG.months[mp.m]} ${mp.y}`;

          const wdRow = month.querySelector('[data-dtp-weekdays]');
          wdRow.innerHTML = '';
          CFG.weekdays.forEach((lbl) => {
            const w = weekdayTpl.cloneNode(true);
            setText(w, 'data-dtp-weekday-label', lbl);
            wdRow.append(w);
          });

          const grid = month.querySelector('[data-dtp-grid]');
          grid.innerHTML = '';
          const lead = (mp.dow + 6) % 7,
            dim = daysIn(mw);
          for (let c = 0; c < 42; c++) {
            // always 6 rows so height never jumps
            const cell = dayTpl.cloneNode(true),
              num = c - lead + 1;
            mark(cell, C.rowStart, c % 7 === 0);
            mark(cell, C.rowEnd, c % 7 === 6);
            if (num < 1 || num > dim) {
              setText(cell, 'data-dtp-day-num', '');
              mark(cell, C.blank, true);
              cell.setAttribute('aria-hidden', 'true');
              grid.append(cell);
              continue;
            }
            const dW = W(mp.y, mp.m, num),
              p = P(dW);
            setText(cell, 'data-dtp-day-num', String(num));
            const disabled = !dayBookable(dW) || (minDay !== null && dW < minDay);
            mark(cell, C.disabled, disabled);
            mark(cell, C.today, dW === today);
            mark(cell, C.pickup, dW === a);
            mark(cell, C.ret, dW === b);
            mark(cell, C.same, a !== null && a === b && dW === a);
            mark(cell, C.range, a !== null && b !== null && dW > a && dW < b);
            cell.setAttribute('aria-label', `${CFG.daysShort[p.dow]} ${num} ${CFG.months[mp.m]} ${mp.y}`);
            if (dW === a || dW === b) cell.setAttribute('aria-pressed', 'true');
            if (disabled) cell.setAttribute('aria-disabled', 'true');
            else clickable(cell, () => pickDate(dW));
            grid.append(cell);
          }
          monthsWrap.append(month);
        }
        root.querySelectorAll('[data-dtp-prev]').forEach((el) => navReady(el, S.view <= min));
        root.querySelectorAll('[data-dtp-next]').forEach((el) => navReady(el, S.view >= max));
      }

      function shownTime() {
        const leg = S.leg,
          cur = leg === 'out' && S.asap ? null : S[leg];
        if (cur !== null) return { i: cur, idle: false };
        if (listDay(leg) === null) return { i: null, idle: true };
        return { i: earliest(leg), idle: true };
      }

      function fail(msg) {
        S.err = msg;
        render(false);
      }

      function commitTime(h, mi) {
        const leg = S.leg;
        if (h > 23) return fail(CFG.text.errHour);
        if (mi > 59) return fail(CFG.text.errMinute);
        const dayW = listDay(leg);
        if (dayW === null) return fail(leg === 'ret' ? CFG.text.pickDateRet : CFG.text.pickDateOut);
        const wall = W(P(dayW).y, P(dayW).m, P(dayW).d, h, mi),
          i = toInstant(wall);
        if (toWall(i) !== wall) return fail(CFG.text.errGap);
        const e = earliest(leg);
        if (i < e) return fail((leg === 'out' ? CFG.text.errEarliest : CFG.text.errReturn).replace('{t}', hmShort(e)));
        S.err = '';
        S[leg] = i;
        if (leg === 'out') S.asap = false;
        clamp();
        render(false);
        publish();
      }

      function shownHM() {
        const s = shownTime();
        return s.i === null ? null : { h: P(toWall(s.i)).h, mi: P(toWall(s.i)).mi };
      }
      function stepTime(part, dir) {
        const t = shownHM();
        if (!t) return;
        let { h, mi } = t;
        if (part === 'h') h = (h + dir + 24) % 24;
        else {
          mi = mi - (mi % CFG.minuteStep) + (dir > 0 ? CFG.minuteStep : mi % CFG.minuteStep ? 0 : -CFG.minuteStep);
          if (mi >= 60) {
            mi -= 60;
            h = (h + 1) % 24;
          }
          if (mi < 0) {
            mi += 60;
            h = (h + 23) % 24;
          }
        }
        commitTime(h, mi);
      }
      function applyHour() {
        const v = hourIn.value.replace(/\D/g, '');
        const t = shownHM();
        if (v === '' || !t) return renderClock();
        if (+v === t.h && !S.err) return renderClock();
        commitTime(+v, t.mi);
      }
      function applyMinute() {
        const v = minIn.value.replace(/\D/g, '');
        const t = shownHM();
        if (v === '' || !t) return renderClock();
        let mi = +v,
          h = t.h;
        if (mi > 59) return fail(CFG.text.errMinute);
        mi = Math.round(mi / CFG.minuteStep) * CFG.minuteStep; // 32 -> 30, 33 -> 35
        if (mi === 60) {
          mi = 0;
          h = (h + 1) % 24;
        } // 58 -> next hour :00
        if (h === t.h && mi === t.mi && !S.err) return renderClock();
        commitTime(h, mi);
      }

      // focusing the time while ASAP is on switches to a scheduled time (the earliest slot)
      function onFocusTime(e) {
        if (S.leg === 'out' && S.asap) {
          S.asap = false;
          S.out = earliest('out');
          S.err = '';
          clamp();
          render(false);
          publish();
        }
        e.target.select();
      }
      let skipHourBlur = false;
      hourIn.addEventListener('focus', onFocusTime);
      minIn.addEventListener('focus', onFocusTime);
      hourIn.addEventListener('input', () => {
        const v = hourIn.value.replace(/\D/g, '').slice(0, 2);
        hourIn.value = v;
        sizeHour();
        const done = v.length === 2 || (v.length === 1 && +v > 2); // "14", "07" or "7" is a whole hour, "0"/"1"/"2" might not be
        if (!done) return;
        skipHourBlur = true;
        minIn.focus();
        skipHourBlur = false; // jump to minutes, then set the hour
        applyHour();
        minIn.select();
      });
      hourIn.addEventListener('blur', () => {
        if (!skipHourBlur) applyHour();
      });
      minIn.addEventListener('input', () => {
        minIn.value = minIn.value.replace(/\D/g, '').slice(0, 2);
      });
      minIn.addEventListener('blur', applyMinute);
      [
        [hourIn, 'h'],
        [minIn, 'm'],
      ].forEach(([el, part]) => {
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            el.blur();
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            part === 'h' ? applyHour() : applyMinute();
            stepTime(part, e.key === 'ArrowUp' ? 1 : -1);
            el.select();
          }
        });
      });

      // always two digits each (24h "01:45"), so both boxes are a fixed 2 characters wide
      function sizeHour() {
        hourIn.style.width = '2ch';
        minIn.style.width = '2ch';
      }

      function renderClock() {
        const s = shownTime(),
          focused = document.activeElement;
        if (label) {
          label.textContent = S.err || (S.leg === 'ret' ? CFG.text.labelRet : CFG.text.labelOut);
          mark(label, C.error, !!S.err);
        }
        // ASAP on: grey the time. Toggled on the time wrapper and the digits only, never on the arrow buttons
        const idleRoot = timeWrap || clock;
        if (C.idle) {
          idleRoot.classList.toggle(C.idle, s.idle);
          idleRoot.querySelectorAll('*').forEach((n) => {
            if (!n.closest('[data-dtp-step]')) n.classList.toggle(C.idle, s.idle);
          });
          idleRoot.querySelectorAll('[data-dtp-step], [data-dtp-step] *').forEach((n) => n.classList.remove(C.idle));
        }
        if (s.i === null) {
          if (focused !== hourIn) hourIn.value = '';
          if (focused !== minIn) minIn.value = '';
        } else {
          const p = P(toWall(s.i));
          if (focused !== hourIn) hourIn.value = pad(p.h);
          if (focused !== minIn) minIn.value = pad(p.mi);
        }
        sizeHour();
        if (ringLit) {
          // light ticks up to and including the shown minute
          const mi = s.i === null ? 0 : P(toWall(s.i)).mi;
          ringLit.setAttribute('stroke-dasharray', `${mi * 10 + 2} 600`);
        }
      }

      // ---------- whole render ----------
      const describe = (i) => `${dayLabel(i)}, ${hm(i)}`;
      function setField(f, text) {
        const v = f.querySelector('[data-dtp-value]');
        if (!v) return;
        v.textContent = text || v.dataset.placeholder;
        mark(v, C.empty, !text);
      }
      function statusText() {
        if (!hasOut()) return CFG.text.pickDateOut;
        if (isReturn() && S.ret === null) return S.target === 'ret' ? 'Now pick a return date. Tap the same day for a same-day return.' : CFG.text.pickDateRet;
        if (!isReturn()) return S.asap ? 'Car sent as soon as possible' : '';
        const mins = Math.round((S.ret - outEff()) / MIN);
        if (sameDay(outEff(), S.ret)) {
          const h = Math.floor(mins / 60),
            m = mins % 60;
          return `Same-day return, ${h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`} after pickup`;
        }
        const days = Math.round((dayOf(S.ret) - dayOf(outEff())) / DAY);
        return days === 1 ? 'Return the next day' : `Return ${days} days later`;
      }

      function render(scroll) {
        const open = !pop.hidden;
        field.ret.hidden = !isReturn();
        document.querySelectorAll('[data-dtp-return-only]').forEach((el) => {
          el.hidden = !isReturn();
        }); // label wraps etc.
        document.querySelectorAll(CFG.oneWayOnly).forEach((el) => {
          // e.g. "Add return date"
          el.classList.toggle(CFG.hideClass, isReturn());
          el.hidden = isReturn();
        });
        setField(field.out, S.asap ? CFG.text.asap : S.out !== null ? describe(S.out) : '');
        setField(field.ret, S.ret !== null ? describe(S.ret) : '');
        mark(field.out, C.active, open && S.leg === 'out');
        mark(field.ret, C.active, open && S.leg === 'ret');
        field.out.setAttribute('aria-expanded', String(open && S.leg === 'out'));
        field.ret.setAttribute('aria-expanded', String(open && S.leg === 'ret'));
        if (!open) return;

        if (tabsWrap) tabsWrap.hidden = !isReturn(); // one way: only one leg, so no tabs
        if (tab.ret) tab.ret.hidden = !isReturn();
        if (tab.out) {
          setText(tab.out, 'data-dtp-tab-time', S.asap ? CFG.text.tabAsap : S.out !== null ? hm(S.out) : CFG.text.noTime);
          mark(tab.out, C.active, S.leg === 'out');
        }
        if (tab.ret) {
          setText(tab.ret, 'data-dtp-tab-time', S.ret !== null ? hm(S.ret) : CFG.text.noTime);
          mark(tab.ret, C.active, S.leg === 'ret');
        }

        nowBtn.hidden = S.leg !== 'out';
        mark(nowBtn, C.active, S.asap);
        nowBtn.setAttribute('aria-pressed', String(S.asap));
        if (status) status.textContent = statusText();

        renderCal();
        renderClock();
        position();
      }

      function position() {
        if (pop.hidden) return;
        const follow = CFG.followField === 'always' || (CFG.followField === 'single' && monthsShown() === 1);
        if (window.innerWidth < CFG.sheetBelow || !follow) {
          pop.style.left = '';
          return;
        }
        const f = !field[S.leg].hidden ? field[S.leg] : field.out;
        const rootLeft = root.getBoundingClientRect().left;
        const fLeft = f.getBoundingClientRect().left - rootLeft;
        const maxLeft = window.innerWidth - 12 - rootLeft - pop.offsetWidth;
        pop.style.left = Math.max(12 - rootLeft, Math.min(fLeft, maxLeft)) + 'px';
      }

      let lastSent = '',
        lastWritten = null,
        writing = false;
      const datesKey = (v) => {
        const V = CFG.vars;
        return JSON.stringify([v[V.asap] ?? null, v[V.pickupAtUtc] ?? null, v[V.pickupAt] ?? null, v[V.returnAtUtc] ?? null, v[V.returnAt] ?? null]);
      };
      function publish() {
        const out = !S.asap && S.out !== null ? S.out : null;
        const ret = isReturn() && S.ret !== null ? S.ret : null;
        const payload = {
          pickup_asap: S.asap,
          pickup_at: out !== null ? isoWall(out) : null,
          pickup_at_utc: out !== null ? new Date(out).toISOString() : null, 
          return_at: ret !== null ? isoWall(ret) : null,
          return_at_utc: ret !== null ? new Date(ret).toISOString() : null,
        };
        const key = JSON.stringify(payload);
        if (key === lastSent) return;
        lastSent = key;
        window.Wized = window.Wized || [];
        const V = CFG.vars,
          named = {
            [V.asap]: payload.pickup_asap,
            [V.pickupAt]: payload.pickup_at,
            [V.pickupAtUtc]: payload.pickup_at_utc,
            [V.returnAt]: payload.return_at,
            [V.returnAtUtc]: payload.return_at_utc,
          };
        lastWritten = datesKey(named);
        window.Wized.push((Wized) => {
          writing = true; 
          try {
            Object.keys(named).forEach((k) => {
              Wized.data.v[k] = named[k];
            });
          } finally {
            writing = false;
          }
        });
        root.dispatchEvent(new CustomEvent('dtp:change', { detail: payload, bubbles: true }));
      }

      function setType(t) {
        const next = t === 'return' ? 'return' : 'one_way';
        if (next === S.type) return;
        S.type = next;
        S.err = '';
        if (next === 'one_way') {
          if (!pop.hidden && S.leg === 'ret') pop.hidden = true;
          S.ret = null;
          S.target = 'out';
          S.leg = 'out';
        }
        clamp();
        render(false);
        publish();
      }
      function parseTime(utc, local) {
        if (utc) {
          const t = Date.parse(utc);
          if (!isNaN(t)) return Math.round(t / STEP) * STEP;
        }
        const m = typeof local === 'string' && local.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
        if (m) return Math.round(toInstant(W(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])) / STEP) * STEP;
        return null;
      }
      function load(job) {
        const V = CFG.vars,
          v = job || {};
        if (v[V.journeyType] !== undefined) S.type = v[V.journeyType] === 'return' ? 'return' : 'one_way';
        const asap = v[V.asap] === true || v[V.asap] === 'true';
        const out = asap ? null : parseTime(v[V.pickupAtUtc], v[V.pickupAt]);
        const ret = parseTime(v[V.returnAtUtc], v[V.returnAt]);
        S.out = out;
        S.asap = asap || (out === null && CFG.startAsap);
        S.ret = isReturn() ? ret : null;
        S.leg = 'out';
        S.err = '';
        S.target = 'out';
        clamp();
        showMonthOf(S.out !== null ? S.out : Date.now());
        render(false);
        publish();
      }
      window.dtpLoad = load;
      window.dtpSetJourneyType = setType;
      window.dtpVars = CFG.vars;
      window.dtpState = () => ({ ...S, outLocal: S.out && isoWall(S.out), retLocal: S.ret && isoWall(S.ret) });
      
      window.Wized = window.Wized || [];
      window.Wized.push((Wized) => {
        const v = Wized.data.v,
          V = CFG.vars;
        const watched = () => JSON.stringify([v[V.journeyType] ?? null, datesKey(v)]);
        const sameAsState = () => {
          // values already match what's on screen? nothing to load
          const asap = v[V.asap] === true || v[V.asap] === 'true';
          const out = asap ? null : parseTime(v[V.pickupAtUtc], v[V.pickupAt]);
          const ret = parseTime(v[V.returnAtUtc], v[V.returnAt]);
          return asap === S.asap && out === (S.asap ? null : S.out) && (ret === S.ret || (!isReturn() && S.ret === null));
        };
        const sync = () => {
          if (datesKey(v) !== lastWritten && !sameAsState() && (v[V.pickupAtUtc] || v[V.pickupAt] || v[V.returnAtUtc] || v[V.returnAt] || v[V.asap] === true)) load(v);
          else {
            setType(v[V.journeyType]);
            publish();
          } 
        };
 
        let queued = false,
          burst = 0,
          burstStart = 0,
          stopped = false;
        const schedule = () => {
          if (writing || queued || stopped) return;
          const t = performance.now();
          if (t - burstStart > 1000) {
            burstStart = t;
            burst = 0;
          }
          if (++burst > 25) {
            stopped = true;
            console.warn('[dtp] variables changing in a loop: stopped listening to Wized. Check for Wized actions that set the booking time variables on change.');
            return;
          }
          queued = true;
          setTimeout(() => {
            queued = false;
            sync();
          }, 0);
        };
        sync();
        if (!CFG.listenForJobs) {
          const jt = () => v[V.journeyType];
          if (Wized.reactivity && Wized.reactivity.watch) Wized.reactivity.watch(jt, () => setTimeout(() => setType(jt()), 0));
          else setInterval(() => setType(jt()), 300);
          return;
        }
        if (Wized.reactivity && Wized.reactivity.watch) Wized.reactivity.watch(watched, schedule);
        else {
          let last = watched();
          setInterval(() => {
            const n = watched();
            if (n !== last) {
              last = n;
              schedule();
            }
          }, 300);
        }
      });

      function openFor(leg) {
        let changed = false;
        if (!hasOut()) {
          S.asap = true;
          changed = true;
        }
        S.target = leg;
        S.leg = leg;
        S.err = '';
        if (leg === 'ret' && isReturn() && S.ret === null) {
          S.ret = defaultReturn();
          changed = true;
        } 
        if (clamp() || changed) publish();
        pop.hidden = false;
        showMonthOf(leg === 'ret' && S.ret !== null ? S.ret : S.out !== null && !S.asap ? S.out : Date.now());
        render(true);
      }
      function focusLeg(leg) {
        if (leg === 'ret' && (!isReturn() || !hasOut())) return;
        S.leg = leg;
        S.target = leg;
        S.err = '';
        if (leg === 'ret' && S.ret === null) {
          S.ret = defaultReturn();
          clamp();
          publish();
        }
        showMonthOf(leg === 'ret' ? S.ret : S.out);
        render(true);
      }
      function close() {
        if (document.activeElement === hourIn || document.activeElement === minIn) document.activeElement.blur();
        S.err = '';
        pop.hidden = true;
        render(false);
      }

      const fromClear = (e) => !!(e && e.target && e.target.closest && e.target.closest(CFG.clearButton));
      clickable(field.out, (e) => {
        if (fromClear(e)) return;
        if (pop.hidden) openFor('out');
        else if (S.leg === 'out') close();
        else focusLeg('out');
      });
      clickable(field.ret, (e) => {
        if (fromClear(e)) return;
        if (pop.hidden) openFor('ret');
        else if (S.leg === 'ret') close();
        else focusLeg('ret');
      });
      clickable(tab.out, () => focusLeg('out'));
      clickable(tab.ret, () => focusLeg('ret'));
      function navFrom(e) {
        const b = e.target.closest('[data-dtp-prev],[data-dtp-next]');
        if (!b || !root.contains(b) || b.classList.contains(C.disabled)) return false;
        S.view = addMonths(S.view, b.hasAttribute('data-dtp-prev') ? -1 : 1);
        render(false);
        return true;
      }
      root.addEventListener('click', navFrom);

      let holdT = 0,
        holdI = 0;
      function stepFrom(btn) {
        const v = (btn.getAttribute('data-dtp-step') || '').replace(/[^hm+-]/gi, '').toLowerCase(),
          part = v[0] === 'm' ? 'm' : 'h',
          dir = v.slice(-1) === '-' ? -1 : 1;
        if (S.leg === 'out' && S.asap) {
          S.asap = false;
          S.out = earliest('out');
          S.err = '';
          clamp();
          render(false);
          publish();
          return false;
        }
        stepTime(part, dir);
        return true;
      }
      function stopHold() {
        clearTimeout(holdT);
        clearInterval(holdI);
      }
      const stepBtn = (e) => {
        const b = e.target && e.target.closest && e.target.closest('[data-dtp-step]');
        return b && root.contains(b) ? b : null;
      };
      function prepStepButtons() {
        root.querySelectorAll('[data-dtp-step]').forEach((btn) => {
          if (btn._dtpReady) return;
          btn._dtpReady = true;
          if (btn.tagName !== 'BUTTON') {
            btn.setAttribute('role', 'button');
            btn.tabIndex = 0;
          }
          if (!btn.getAttribute('aria-label')) {
            const v = btn.getAttribute('data-dtp-step') || '';
            btn.setAttribute('aria-label', (v.trim()[0] === 'm' ? 'Minutes ' : 'Hour ') + (v.trim().slice(-1) === '-' ? 'earlier' : 'later'));
          }
        });
      }
      prepStepButtons();
      root.addEventListener(
        'pointerdown',
        (e) => {
          const btn = stepBtn(e);
          if (CFG.debug && btn) console.log('[dtp] arrow', btn.getAttribute('data-dtp-step'), { asap: S.asap, leg: S.leg, out: S.out && isoWall(S.out) });
          if (!btn || (e.button !== undefined && e.button !== 0)) return;
          e.preventDefault();
          if (document.activeElement === hourIn) applyHour();
          if (document.activeElement === minIn) applyMinute();
          stopHold();
          if (!stepFrom(btn)) return;
          holdT = setTimeout(() => {
            holdI = setInterval(() => stepFrom(btn), 90);
          }, 400);
        },
        true,
      );
      ['pointerup', 'pointercancel'].forEach((t) => root.addEventListener(t, stopHold));
      root.addEventListener('pointerout', (e) => {
        if (stepBtn(e)) stopHold();
      });
      root.addEventListener('click', (e) => {
        const btn = stepBtn(e);
        if (btn && e.detail === 0) stepFrom(btn);
      }); // keyboard Enter/Space on <button>
      root.addEventListener('keydown', (e) => {
        const btn = stepBtn(e);
        if (btn && btn.tagName !== 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          stepFrom(btn);
        }
      });
      window.addEventListener('blur', stopHold);
      root.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('[data-dtp-prev],[data-dtp-next]')) {
          e.preventDefault();
          navFrom(e);
        }
      });
      clickable(nowBtn, () => {
        S.asap = !S.asap;
        S.err = '';
        if (S.asap) S.out = null;
        else S.out = earliest('out');
        clamp();
        render(false);
        publish();
        if (S.asap && !isReturn() && CFG.closeOnAsap) close();
      });
      clickable(doneBtn, close);

      let eating = false,
        eatTimer = 0;
      const eat = (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      };
      const startEating = () => {
        eating = true;
        clearTimeout(eatTimer);
        eatTimer = setTimeout(() => {
          eating = false;
        }, 700);
      };
      window.addEventListener(
        'pointerdown',
        (e) => {
          if (pop.hidden || root.contains(e.target)) return;
          eat(e);
          startEating();
          close();
        },
        { capture: true },
      );
      ['mousedown', 'touchstart', 'pointerup', 'mouseup', 'touchend', 'click', 'dblclick', 'contextmenu'].forEach((type) => {
        window.addEventListener(
          type,
          (e) => {
            if (!eating) return;
            eat(e);
            if (type === 'click') {
              eating = false;
              clearTimeout(eatTimer);
            }
          },
          { capture: true, passive: false },
        );
      });
      window.addEventListener('focusin', (e) => {
        if (!pop.hidden && !root.contains(e.target)) close();
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !pop.hidden) close();
      });

      let shown = monthsShown();
      window.addEventListener('resize', () => {
        if (monthsShown() !== shown) {
          shown = monthsShown();
          if (!pop.hidden) render(false);
        } else position();
      });

      function refresh() {
        if (clamp()) publish();
        render(false);
      }
      setInterval(() => {
        if (!pop.hidden || S.out !== null) refresh();
      }, 30000);
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) refresh();
      });

      render(false); // starting state is sent to Wized from the sync above, once Wized is ready
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  })();
  document.addEventListener('DOMContentLoaded', () => {
    gsap.registerPlugin(Draggable);

    function initSlider() {
      const list = document.querySelector('[data-slider="list"]');
      if (!list) return;

      const viewport = list.parentElement;
      const nextButton = document.querySelector('[data-slider="button-next"]');
      const prevButton = document.querySelector('[data-slider="button-prev"]');

      let slides = [];
      let positions = [];
      let maxScroll = 0;
      let curIndex = 0;
      let wasDragged = false;
      let draggable;

      function measure() {
        slides = gsap.utils.toArray('[data-slider="slide"]');

        if (!slides.length) {
          positions = [];
          maxScroll = 0;
          return;
        }

        gsap.set(slides, { touchAction: 'auto' });

        const startLeft = slides[0].offsetLeft;
        maxScroll = Math.max(0, list.scrollWidth - viewport.offsetWidth);
        positions = slides.map((s) => s.offsetLeft - startLeft);
      }

      function targetFor(i) {
        return Math.min(positions[i], maxScroll);
      }

      function setActive(i) {
        slides.forEach((s, idx) => s.classList.toggle('active', idx === i));
        if (prevButton) prevButton.classList.toggle('is-disabled', targetFor(i) <= 0);
        if (nextButton) nextButton.classList.toggle('is-disabled', targetFor(i) >= maxScroll);
      }

      function goTo(i, duration = 0.725) {
        if (!slides.length) return;
        i = gsap.utils.clamp(0, slides.length - 1, i);
        curIndex = i;
        setActive(i);
        gsap.to(list, {
          x: -targetFor(i),
          duration: duration,
          ease: 'power3',
          overwrite: true,
          onComplete: () => draggable && draggable.update(),
        });
      }

      function step(dir) {
        if (!slides.length) return;
        const from = targetFor(curIndex);
        let i = curIndex + dir;
        while (i > 0 && i < slides.length - 1 && targetFor(i) === from) i += dir;
        goTo(i);
      }

      function closestIndex(x) {
        const target = -x;
        let best = 0,
          bestDist = Infinity;
        positions.forEach((p, i) => {
          const d = Math.abs(Math.min(p, maxScroll) - target);
          if (d < bestDist) {
            bestDist = d;
            best = i;
          }
        });
        return best;
      }

      function refresh(keepIndex = true) {
        measure();
        if (draggable) {
          draggable.applyBounds({ minX: -maxScroll, maxX: 0 });
          draggable.enabled(maxScroll > 0);
        }
        goTo(keepIndex ? curIndex : 0, 0);
      }

      measure();

      draggable = Draggable.create(list, {
        type: 'x',
        bounds: { minX: -maxScroll, maxX: 0 },
        edgeResistance: 0.9,
        allowNativeTouchScrolling: true,
        onPress() {
          wasDragged = false;
          gsap.killTweensOf(list);
        },
        onDrag() {
          if (Math.abs(this.x - this.startX) > 5) wasDragged = true;
        },
        onDragEnd() {
          let i = closestIndex(this.x);
          const dist = this.startX - this.x;
          if (Math.abs(dist) > 20 && i === curIndex) {
            i = dist > 0 ? curIndex + 1 : curIndex - 1;
          }
          goTo(i);
        },
      })[0];

      list.addEventListener('click', (e) => {
        if (wasDragged) return;
        const slide = e.target.closest('[data-slider="slide"]');
        if (!slide) return;
        const i = slides.indexOf(slide);
        if (i > -1) goTo(i);
      });

      if (nextButton) nextButton.addEventListener('click', () => step(1));
      if (prevButton) prevButton.addEventListener('click', () => step(-1));

      let roTimer;
      new ResizeObserver(() => {
        clearTimeout(roTimer);
        roTimer = setTimeout(() => refresh(false), 100);
      }).observe(list);

      let resizeTimer;
      window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => refresh(true), 150);
      });

      window.sliderRefresh = refresh;

      refresh(false);
    }

    initSlider();
  });

  window.Wized = window.Wized || [];

  function initStopsSortable() {
    const listElement = document.getElementById('address_list');
    if (!listElement) return;

    new Sortable(listElement, {
      animation: 150,
      ghostClass: 'dragging',
      chosenClass: 'chosen_row',
      handle: '[data-sortable=drag-handle]',

      forceFallback: true,
      fallbackOnBody: true,
      fallbackTolerance: 3,

      onEnd: function (evt) {
        const oldIndex = evt.oldIndex;
        const newIndex = evt.newIndex;
        if (oldIndex === newIndex) return;

        const from = evt.from;
        const item = evt.item;
        if (newIndex > oldIndex) {
          from.insertBefore(item, from.children[oldIndex]);
        } else {
          from.insertBefore(item, from.children[oldIndex + 1]);
        }
        window.Wized.push((Wized) => {
          const currentStops = Wized.data.v.address_input_stops;
          if (!Array.isArray(currentStops)) return;
          const next = [...currentStops];
          const [movedItem] = next.splice(oldIndex, 1);
          next.splice(newIndex, 0, movedItem);
          Wized.data.v.address_input_stops = next;
          // window.Wized.requests.execute("get_quote");
        });
      },
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initStopsSortable);
  } else {
    initStopsSortable();
  }
