/**
 * Gaming art helpers — every image in the app (avatars, match banners, hero, empty states) is local SVG art,
 * so nothing depends on external image sites (ui-avatars / placehold.co) any more.
 * window.gameArt.avatar(seed) · .banner(match) · .hero · .empty('search'|'matches')
 * A global <img> error handler swaps any broken picture for matching gaming art.
 * Loaded as a CLASSIC script in <head> so inline onerror="gameArtFb(this)" handlers always find it.
 */
(function () {
const BASE = new URL('assets/img/game/', document.baseURI).href;
const hash = (s) => { let h = 7; for (const c of String(s == null ? '' : s)) h = (h * 33 + c.charCodeAt(0)) >>> 0; return h; };
const AV = 12;

const avatar = (seed) => BASE + 'avatars/av' + (hash(seed) % AV + 1) + '.svg';
const modeOf = (m) => {
    const t = String((m && (m.mode || m.modeShort || m.type || m.modeLabel || m.category)) || '').toLowerCase();
    if (/(^|\b)cs\b|clash|squad/.test(t)) return 'cs';
    if (/(^|\b)lw\b|lone|wolf|1v1/.test(t)) return 'lw';
    if (/(^|\b)br\b|battle|royale|solo|duo/.test(t)) return 'br';
    return 'default';
};
const banner = (m) => BASE + 'banner-' + modeOf(m) + '.svg';
const hero = BASE + 'hero.svg';
const empty = (k) => BASE + 'empty-' + (k === 'search' ? 'search' : 'matches') + '.svg';

window.gameArt = { avatar, banner, hero, empty, modeOf, base: BASE };

// Inline helper used by markup (onerror="gameArtFb(this)")
window.gameArtFb = (img) => {
    if (!img || img.dataset.fb === '2') return;
    const ctx = (img.className + ' ' + (img.id || '') + ' ' + (img.alt || '')).toLowerCase();
    const isAv = /av|avatar|profile|photo|pf-|cv-/.test(ctx) || img.closest('.p-avatar,.cv-av,.pf-av,.ct-av,.mg-av,.cs-mem,.rq-row,.lb-av,.podium,.lb-row,.lb-item');
    if (img.dataset.fb === '1') {                       // art itself failed -> letter badge (avatars) or hide
        img.dataset.fb = '2';
        if (isAv && img.dataset.n) { const d = document.createElement('div'); d.className = (img.className || 'av') + ' av-t'; d.textContent = img.dataset.n; img.replaceWith(d); }
        else img.style.visibility = 'hidden';
        return;
    }
    img.dataset.fb = '1';
    const seed = img.dataset.seed || img.alt || img.getAttribute('src') || 'player';
    img.src = isAv ? avatar(seed) : banner({ mode: img.dataset.mode || '' });
};
document.addEventListener('error', (e) => { const t = e.target; if (t && t.tagName === 'IMG' && !t.hasAttribute('onerror')) window.gameArtFb(t); }, true);
})();
