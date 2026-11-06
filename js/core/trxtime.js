/**
 * One reliable way to read a transaction's time (classic script — loaded in <head>).
 * Handles Firestore Timestamp, millisecond numbers, ISO strings and the locale date strings the app has stored
 * ("31/10/2026", "10/31/2026", "31/10/2026, 9:58:30 pm") so the wallet is ALWAYS newest-first.
 */
(function () {
    const parseDate = (s) => {
        s = String(s || '').trim(); if (!s) return 0;
        let n = Date.parse(s); if (!isNaN(n) && /\d{4}-\d{2}-\d{2}|T\d{2}:/.test(s)) return n;
        const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]m)?)?/i);
        if (m) {
            let a = +m[1], b = +m[2], y = +m[3]; if (y < 100) y += 2000;
            let d = a, mo = b; if (b > 12 && a <= 12) { d = b; mo = a; }          // mm/dd/yyyy
            let h = m[4] ? +m[4] : 0; const mi = m[5] ? +m[5] : 0, se = m[6] ? +m[6] : 0, ap = (m[7] || '').toLowerCase();
            if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0;
            const t = new Date(y, mo - 1, d, h, mi, se).getTime(); return isNaN(t) ? 0 : t;
        }
        return isNaN(n) ? 0 : n;
    };
    window.trxMs = (t) => {
        if (!t) return 0;
        const ts = t.timestamp;
        if (ts) { if (typeof ts.toMillis === 'function') { try { return ts.toMillis(); } catch (e) {} } if (ts.seconds) return ts.seconds * 1000 + Math.floor((ts.nanoseconds || 0) / 1e6); if (typeof ts === 'number') return ts; }
        for (const k of ['createdAt', 'at', 'ts', 'time']) { const v = t[k]; if (typeof v === 'number' && v > 1e11) return v; if (v && v.seconds) return v.seconds * 1000; }
        return parseDate(t.date) || parseDate(t.createdAt) || 0;
    };
    window.trxSort = (list) => list.map((t, i) => [t, i]).sort((a, b) => ((b[0]._ms || 0) - (a[0]._ms || 0)) || (b[1] - a[1])).map(x => x[0]);
})();
