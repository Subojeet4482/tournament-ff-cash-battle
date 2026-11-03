/**
 * Sound manager — one place that plays every sound reliably.
 *  - Unlocks audio on the very first tap (iOS / Chrome block sounds that start after an async call otherwise)
 *  - Uses the <audio> files from components/audio/audio.html and falls back to a synthesized sound if a file is missing
 *  - "coin" sounds are synthesized with WebAudio, so they work even without a file
 */
(() => {
    let ctx = null, unlocked = false;
    const vol = (key, def) => { const v = parseInt(localStorage.getItem(key) || def); return isNaN(v) ? def / 100 : v / 100; };
    const getCtx = () => {
        if (!ctx) { const C = window.AudioContext || window.webkitAudioContext; if (C) { try { ctx = new C(); } catch (e) {} } }
        if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
        return ctx;
    };
    // one short note
    const note = (freq, t0, dur, type, gain) => {
        const c = getCtx(); if (!c) return;
        const o = c.createOscillator(), g = c.createGain();
        o.type = type || 'sine'; o.frequency.setValueAtTime(freq, c.currentTime + t0);
        g.gain.setValueAtTime(0.0001, c.currentTime + t0);
        g.gain.exponentialRampToValueAtTime(gain, c.currentTime + t0 + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + t0 + dur);
        o.connect(g); g.connect(c.destination);
        o.start(c.currentTime + t0); o.stop(c.currentTime + t0 + dur + 0.05);
    };
    const synth = {
        // "ka-ching" — money received
        coin: (v) => { note(987.8, 0, 0.12, 'square', 0.18 * v); note(1318.5, 0.09, 0.45, 'square', 0.18 * v); note(1975, 0.09, 0.35, 'sine', 0.12 * v); },
        // coins dropping — money leaving
        coinOut: (v) => { [1568, 1318.5, 1046.5, 784, 659].forEach((f, i) => { note(f, i * 0.09, 0.22, 'triangle', 0.2 * v); note(f * 2, i * 0.09, 0.12, 'sine', 0.08 * v); }); },
        tick: (v) => note(1200, 0, 0.05, 'sine', 0.1 * v)
    };
    const FILES = { touch: ['audio-touch', 'vol_touch', 50], withdrawal: ['audio-withdrawal', 'vol_withdrawal', 80], notification: ['audio-notification', 'vol_notification', 80], settings: ['audio-settings', 'vol_settings', 80], clear: ['audio-clear', 'vol_clear', 80] };

    const sfx = {
        unlock() {
            if (unlocked) return; unlocked = true;
            getCtx();
            document.querySelectorAll('audio').forEach(a => {
                if (a.id === 'audio-bg') return;
                try { a.muted = true; const p = a.play(); if (p && p.then) p.then(() => { a.pause(); a.currentTime = 0; a.muted = false; }).catch(() => { a.muted = false; }); else { a.pause(); a.muted = false; } } catch (e) { a.muted = false; }
            });
        },
        play(name) {
            try {
                const f = FILES[name];
                if (f) {
                    const v = vol(f[1], f[2]); if (v <= 0) return;
                    const a = document.getElementById(f[0]);
                    if (a && !a.error) { a.muted = false; a.volume = v; a.currentTime = 0; const p = a.play(); if (p && p.catch) p.catch(() => synth.tick(v)); return; }
                    synth.tick(v); return;
                }
                if (synth[name]) synth[name](vol('vol_withdrawal', 80));
            } catch (e) {}
        },
        // money sounds: file + synthesized layer
        deposit() { this.play('coin'); },
        withdraw() { this.play('coinOut'); setTimeout(() => this.play('withdrawal'), 120); }
    };
    window.sfx = sfx;
    ['pointerdown', 'touchstart', 'click', 'keydown'].forEach(ev => document.addEventListener(ev, () => sfx.unlock(), { once: false, passive: true, capture: true }));
})();
