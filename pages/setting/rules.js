/**
 * Fair Play Rules popup: loads config/rules (set from the admin panel), up to 3 language buttons.
 */
import { doc, getDoc, dbService } from '../../js/core/firebase.js';

const DEFAULT = [{ code: 'en', label: 'English', items: [
    'No Emulators Allowed (Mobile Only).', 'No Hacks, Scripts, or Team-ups.', 'Level 25+ ID Required.',
    'Wait in lobby 5 minutes before start.', 'Winners must take Screenshot of Booyah.'] }];
let LANGS = DEFAULT, loadedAt = 0;
const esc = (x) => String(x == null ? '' : x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

Object.assign(window.app, {
    paintRules: (code) => {
        let cur = code || localStorage.getItem('rules_lang');
        if (!LANGS.find(l => l.code === cur)) cur = LANGS[0].code;
        localStorage.setItem('rules_lang', cur);
        document.getElementById('rules-tabs').innerHTML = LANGS.length > 1 ? LANGS.map(l =>
            `<button type="button" class="rules-tab ${l.code === cur ? 'on' : ''}" onclick="app.paintRules('${esc(l.code)}')">${esc(l.label)}</button>`).join('') : '';
        const L = LANGS.find(l => l.code === cur) || LANGS[0];
        const box = document.getElementById('rules-box');
        box.innerHTML = '<ol>' + L.items.map((x, i) => `<li style="animation-delay:${i * 70}ms">${esc(x)}</li>`).join('') + '</ol>';
    },
    loadRules: async () => {
        window.app.paintRules();                                   // show the last known list instantly
        if (Date.now() - loadedAt < 60000) return;
        try {
            const s = await getDoc(doc(dbService, 'config', 'rules'));
            if (s.exists() && Array.isArray(s.data().langs) && s.data().langs.length) { LANGS = s.data().langs.filter(l => l.items && l.items.length).slice(0, 3); if (!LANGS.length) LANGS = DEFAULT; }
            loadedAt = Date.now();
            window.app.paintRules();
        } catch (e) {}
    }
});
