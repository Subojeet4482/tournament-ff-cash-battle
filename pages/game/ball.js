/**
 * 4 Ball Match — client. The server (Main admin panel) runs all rules & money; this file only
 * shows the board (live from Firestore ball_games/{gid}) and sends "drop in column N".
 */
import { authService, dbService, doc, onSnapshot } from '../../js/core/firebase.js';
import { GAME_API } from '../../js/core/app-config.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
const W = 6, H = 6, CIRC = 2 * Math.PI * 44;
const inr = (n) => '₹' + (Math.round(n * 100) / 100).toLocaleString('en-IN');
const st = { cfg: null, practiceLeft: 0, stats: {}, skew: 0, entry: 0, practice: false, ticket: null, gid: null, game: null, me: -1, shown: 0, unsub: null, pollT: null, tickT: null, timerT: null, searchT: null, busy: false, queue: [], playing: false, board: Array(36).fill(0), lastTick: 0, fallbackT: null, balT: null, resultShown: false, endAt: 0 };
const now = () => Date.now() + st.skew;
const uid = () => authService.currentUser && authService.currentUser.uid;

/* ---------- API ---------- */
async function api(path, body, ms = 75000) {
    if (!GAME_API) throw new Error('Game server is not set up yet (admin: set CHAT_TOKEN_URL in app-config.js)');
    const u = authService.currentUser; if (!u) throw new Error('Please log in first');
    const tok = await u.getIdToken(); const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), ms);
    let r; try { r = await fetch(`${GAME_API}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify(body || {}), signal: ctl.signal }); }
    catch (e) { clearTimeout(tm); throw new Error(e && e.name === 'AbortError' ? 'Game server is waking up — try again in a minute' : 'Cannot reach the game server'); }
    clearTimeout(tm); let j = {}; try { j = await r.json(); } catch (e) {}
    if (j.now) st.skew = j.now - Date.now();
    if (!r.ok && !j.status) throw new Error(j.error || 'Server error ' + r.status);
    return j;
}
const toast = (m) => { const t = $('bl-toast'); t.textContent = m; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 2600); };
const sfx = (n) => { try { window.sfx && window.sfx.play(n); } catch (e) {} };
const showS = (id) => { document.querySelectorAll('#ball .bl-s').forEach(s => s.classList.toggle('on', s.id === id)); };
const myInfo = () => { const d = window.db || {}; const name = d.appName || d.userName || (authService.currentUser && authService.currentUser.displayName) || 'Player'; return { name, photo: d.photoUrl || (authService.currentUser && authService.currentUser.photoURL) || '' }; };
const avatarOf = (p) => p.bot ? `assets/img/game/bots/b${p.avatar || 1}.webp` : (p.photo || window.gameArt.avatar(p.name));
const balance = () => Number((window.db && window.db.balance) || 0);

/* ---------- lobby ---------- */
function paintLobby() {
    const c = st.cfg; if (!c) return;
    const me = myInfo();
    $('bl-me').innerHTML = `<img src="${esc(me.photo || window.gameArt.avatar(me.name))}" alt="" onerror="gameArtFb(this)" data-seed="${esc(me.name)}"><div><b>${esc(me.name)}</b><small>Playing as you · real wallet</small></div>`;
    $('bl-cut').textContent = `Winner gets ${(2 * (100 - c.cutPct) / 100).toFixed(1)}× entry`;
    if (!st.entry || !c.entries.includes(st.entry)) st.entry = c.entries[Math.min(1, c.entries.length - 1)] || c.entries[0];
    $('bl-entries').innerHTML = c.entries.map(e => `<button type="button" class="bl-ent ${e === st.entry ? 'on' : ''}" onclick="ballGame.pick(${e})"><b>₹${e}</b><small>Win <em>${inr(e * 2 * (100 - c.cutPct) / 100)}</em></small></button>`).join('');
    const can = balance() >= st.entry;
    $('bl-play-t').textContent = c.enabled ? (can ? `Play ₹${st.entry}` : 'Add money to play') : 'Game is off';
    $('bl-play').disabled = !c.enabled;
    $('bl-prac-n').textContent = `(${st.practiceLeft} left today)`; $('bl-prac').disabled = !c.enabled || st.practiceLeft <= 0;
    const s = st.stats || {};
    $('bl-stats').innerHTML = `<div><b>${s.games || 0}</b><small>Games</small></div><div><b>${s.wins || 0}</b><small>Wins</small></div><div><b>${inr(s.won || 0)}</b><small>Won</small></div>`;
    $('bl-bal').textContent = (Math.round(balance() * 100) / 100).toLocaleString('en-IN');
}
async function loadCfg() {
    const r = await api('config', {}, 70000); if (!r.ok) throw new Error(r.error || 'Server error');
    st.cfg = r.cfg; st.practiceLeft = r.practiceLeft; st.stats = r.stats; return r;
}

/* ---------- search ---------- */
function seat(p, cls) { return `<img class="av" src="${esc(avatarOf(p))}" alt="" onerror="gameArtFb(this)" data-seed="${esc(p.name)}"><b>${esc(p.name)}${p.bot ? ' <span class="bot-tag">BOT</span>' : ''}</b><small>${p.bot ? 'Bot player' : 'Real player'}</small>`; }
function startSearch(attempt) {
    showS('bl-search'); const me = myInfo(), c = st.cfg;
    $('bls-me').innerHTML = seat({ name: me.name, photo: me.photo }); $('bls-me').className = 'bl-pl';
    $('bls-op').className = 'bl-pl wait'; $('bls-op').innerHTML = `<div class="av q">?</div><b>Searching…</b><small>real player</small>`;
    $('bls-h').textContent = 'Finding a real player…'; $('bls-p').textContent = `Attempt ${attempt} of ${c.botAfterFails}`;
    $('bls-pot').innerHTML = st.practice ? '<i class="fa-solid fa-flask"></i> Practice · free' : `<img src="assets/img/ff-coin.png" alt=""> Entry ${inr(st.entry)} · Win ${inr(st.entry * 2 * (100 - c.cutPct) / 100)}`;
    $('bls-retry').classList.add('hidden'); $('bls-cancel').classList.remove('hidden');
    const total = c.searchSec, t0 = Date.now(); clearInterval(st.searchT);
    const ring = $('bls-ring'); ring.style.transition = 'none'; ring.style.strokeDashoffset = 0; void ring.getBoundingClientRect(); ring.style.transition = 'stroke-dashoffset 1s linear';
    st.searchT = setInterval(() => { const left = Math.max(0, total - Math.floor((Date.now() - t0) / 1000)); $('bls-t').textContent = left; ring.style.strokeDashoffset = String(276.5 * (1 - left / total)); }, 250);
    $('bls-t').textContent = total;
}
async function doFind() {
    try {
        const r = await api('find', { entry: st.practice ? 0 : st.entry, practice: st.practice });
        if (!r.ok) { toast(r.error || 'Cannot start'); back(true); return; }
        if (r.status === 'matched') return attach(r.gid);
        st.ticket = r.ticket; startSearch(r.attempt || 1); pollLoop();
    } catch (e) { toast(e.message); back(true); }
}
function pollLoop() {
    clearTimeout(st.pollT);
    st.pollT = setTimeout(async () => {
        if (!st.ticket) return;
        try {
            const r = await api('poll', { ticket: st.ticket }, 20000);
            if (r.status === 'matched') { st.ticket = null; clearInterval(st.searchT); return attach(r.gid, r.bot); }
            if (r.status === 'nomatch') { st.ticket = null; clearInterval(st.searchT); $('bls-h').textContent = 'No real player found'; $('bls-p').textContent = r.fails >= r.botAfter - 0 ? 'A bot will join…' : `Try once more — if nobody joins, a BOT (clearly marked) will play you.`; $('bls-retry').classList.remove('hidden'); $('bls-t').textContent = '0'; return; }
            if (r.status === 'error') { toast(r.error); return back(true); }
            if (r.status === 'none' || r.status === 'cancelled') return;
        } catch (e) { /* keep trying */ }
        pollLoop();
    }, 1500);
}

/* ---------- game ---------- */
function buildBoard() {
    const b = $('bl-board'); b.innerHTML = Array.from({ length: 36 }, (_, i) => `<div class="bl-cell" id="blc-${i}"></div>`).join('');
    $('bl-cols').innerHTML = Array.from({ length: W }, (_, c) => `<button type="button" class="bl-col" data-c="${c}" onclick="ballGame.drop(${c})" aria-label="Drop in column ${c + 1}"></button>`).join('');
    st.board = Array(36).fill(0);
}
async function attach(gid, isBot) {
    clearTimeout(st.pollT); clearInterval(st.searchT); st.gid = gid; st.shown = 0; st.queue = []; st.resultShown = false; st.game = null; st.me = -1; st.playing = false;
    $('bl-res').classList.remove('on'); buildBoard();
    try { const r = await api('game', { gid }, 30000); if (r.ok) { st.me = r.game.uids.indexOf(uid()); st.game = r.game; revealOpponent(r.game, () => start(r.game)); } else throw new Error(r.error); }
    catch (e) { toast(e.message || 'Could not load the game'); return back(true); }
}
function revealOpponent(g, done) {
    showS('bl-search'); const mi = st.me, op = g.players[1 - mi], me = g.players[mi];
    $('bls-me').className = 'bl-pl'; $('bls-me').innerHTML = seat(me);
    $('bls-op').className = 'bl-pl reveal'; $('bls-op').innerHTML = seat(op);
    $('bls-h').textContent = op.bot ? 'A bot joined the match' : 'Player found!'; $('bls-p').textContent = op.bot ? 'This opponent is a BOT (no real player was available).' : 'Get ready…';
    $('bls-retry').classList.add('hidden'); $('bls-cancel').classList.add('hidden'); $('bls-t').textContent = '✓'; $('bls-ring').style.strokeDashoffset = 0;
    sfx('setting'); setTimeout(done, 1900);
}
function start(g) {
    showS('bl-play-s'); st.playing = true; paintSeats(g);
    $('blp-pot').textContent = g.practice ? 'Practice · no money' : `Prize ${inr(g.stake * 2 * (100 - g.cutPct) / 100)}`;
    watch(g.id); onGame(g, true); clearInterval(st.timerT); st.timerT = setInterval(tickUI, 250);
}
function watch(gid) {
    if (st.unsub) { try { st.unsub(); } catch (e) {} st.unsub = null; } clearInterval(st.fallbackT);
    try { st.unsub = onSnapshot(doc(dbService, 'ball_games', gid), (s) => { if (s.exists()) onGame({ id: gid, ...s.data() }); }, () => fallbackPoll()); } catch (e) { fallbackPoll(); }
}
function fallbackPoll() { clearInterval(st.fallbackT); st.fallbackT = setInterval(async () => { if (!st.gid || !st.playing) return; try { const r = await api('game', { gid: st.gid }, 15000); if (r.ok) onGame(r.game); } catch (e) {} }, 2000); }

function paintSeats(g) {
    const mi = st.me, me = g.players[mi], op = g.players[1 - mi];
    const seatH = (p, cls) => `<div class="ava"><img src="${esc(avatarOf(p))}" alt="" onerror="gameArtFb(this)" data-seed="${esc(p.name)}"><svg viewBox="0 0 50 50"><circle cx="25" cy="25" r="22" class="ring" stroke-dashoffset="138.2"/></svg></div><div class="nm"><b>${esc(p.name)}${p.bot ? ' <span class="bot-tag">BOT</span>' : ''}</b><small>${p.bot ? 'Bot player' : (cls === 'me' ? 'You' : 'Real player')}</small></div><span class="pc ${cls}"></span>`;
    $('blp-me').innerHTML = seatH(me, 'me'); $('blp-op').innerHTML = seatH(op, 'op');
}
function onGame(g, first) {
    if (!g || g.id !== st.gid) return;
    if (!st.game || (g.moves || []).length >= (st.game.moves || []).length || g.status === 'done') st.game = g;
    const mv = g.moves || [];
    if (first) { for (let i = 0; i < mv.length; i++) place(mv[i], false); st.shown = mv.length; }
    else if (mv.length > st.shown + st.queue.length) { mv.slice(st.shown + st.queue.length).forEach(m => st.queue.push(m)); pump(); }
    tickUI();
    if (g.status === 'done') maybeResult();
}
function pump() {
    if (st.pumping || !st.queue.length) return; st.pumping = true;
    const m = st.queue[0]; const delay = (m.p === st.me) ? 0 : Math.min(1700, m.d || 0);
    setTimeout(() => { place(m, true); st.queue.shift(); st.shown++; st.pumping = false; if (st.queue.length) pump(); else if (st.game && st.game.status === 'done') maybeResult(); }, delay);
}
function place(m, animate) {
    const i = m.r * W + m.c, cell = $('blc-' + i); if (!cell || st.board[i]) return; st.board[i] = m.p + 1;
    const mine = m.p === st.me; const b = document.createElement('div'); b.className = 'ball ' + (mine ? 'me' : 'op') + (animate ? ' now' : '');
    b.style.setProperty('--fall', String(m.r + 1.2)); b.style.setProperty('--t', (animate ? 0.38 + m.r * 0.045 : 0.001) + 's'); cell.appendChild(b); if (animate) sfx('touch');
}
function tickUI() {
    const g = st.game; if (!g || !st.playing) return;
    const done = g.status === 'done', myTurn = !done && g.turn === st.me && st.queue.length === 0 && !st.pumping;
    const left = Math.max(0, Math.ceil(((g.deadline || 0) - now()) / 1000)), total = g.turnSec || 15;
    [['blp-me', st.me], ['blp-op', 1 - st.me]].forEach(([id, idx]) => {
        const el = $(id); if (!el) return; const active = !done && g.turn === idx && st.queue.length === 0; el.classList.toggle('active', active);
        const c = el.querySelector('circle.ring'); if (c) c.style.strokeDashoffset = String(active ? 138.2 * (1 - Math.min(1, left / total)) : 138.2);
    });
    const t = $('bl-turn'), animating = !done && g.turn === st.me && (st.queue.length > 0 || st.pumping);
    if (animating) { t.className = 'bl-turn them'; t.textContent = `${g.players[1 - st.me].name} is playing…`; }
    else if (done) { t.className = 'bl-turn'; t.textContent = g.winner === -1 ? 'Draw' : (g.winner === st.me ? '🏆 You win!' : 'Game over'); }
    else if (myTurn) { t.className = 'bl-turn you'; t.innerHTML = `Your turn · ${left}s`; } else { t.className = 'bl-turn them'; t.innerHTML = `${esc(g.players[g.turn].name)}'s turn · ${left}s`; }
    document.querySelectorAll('#bl-cols .bl-col').forEach((b, c) => { const full = st.board[c] !== 0; b.disabled = !myTurn || full || st.busy; b.classList.toggle('can', myTurn && !full); });
    if (!done && (g.deadline || 0) + 1200 < now() && Date.now() - st.lastTick > 3500) { st.lastTick = Date.now(); api('tick', { gid: g.id }, 20000).then(r => r.ok && r.game && onGame(r.game)).catch(() => {}); }
}
async function drop(c) {
    const g = st.game; if (!g || g.status === 'done' || g.turn !== st.me || st.busy || st.board[c]) return; st.busy = true;
    try { const r = await api('move', { gid: g.id, col: c }, 25000); if (r.game) onGame(r.game); if (!r.ok && r.error) toast(r.error); }
    catch (e) { toast(e.message); } finally { st.busy = false; tickUI(); }
}

/* ---------- result ---------- */
function maybeResult() {
    if (st.resultShown || st.queue.length || st.pumping) return; const g = st.game; if (!g || g.status !== 'done') return;
    st.resultShown = true; (g.winCells || []).forEach(i => { const c = $('blc-' + i); if (c) c.classList.add('win'); });
    setTimeout(() => showResult(g), 1300);
}
function showResult(g) {
    clearInterval(st.timerT); const won = g.winner === st.me, draw = g.winner === -1, prize = g.prize || 0;
    const why = { connect4: '', afk: g.winner === st.me ? 'Opponent missed too many turns' : 'You missed too many turns', forfeit: g.winner === st.me ? 'Opponent left the match' : 'You left the match', draw: 'Board full' }[g.reason] || '';
    let html;
    if (draw) html = `<div class="bl-card"><div class="big">🤝</div><h2>Draw</h2><p>${g.practice ? 'Nobody wins this one.' : 'Your entry was refunded to your wallet.'}</p>${g.practice ? '' : `<div class="bl-amt"><img src="assets/img/ff-coin.png" alt="">+${inr(g.stake)}</div>`}`;
    else if (won) { const coins = Array.from({ length: 14 }, () => `<img class="bl-coin" src="assets/img/ff-coin.png" alt="" style="left:${Math.random() * 92}%;--d:${2 + Math.random() * 2}s;--w:${Math.random() * 1.6}s">`).join(''); html = `<div class="bl-card win">${coins}<div class="big">🏆</div><h2>You won!</h2><p>${why || 'Four balls in a row — perfect!'}</p>${g.practice ? '<p>Practice win — no money involved.</p>' : `<div class="bl-amt"><img src="assets/img/ff-coin.png" alt="">+${inr(prize)}</div><p>Added to your winnings · shown on the Leaderboard</p>`}`; sfx('clear'); }
    else html = `<div class="bl-card lose"><div class="big">💥</div><h2>You lost</h2><p>${why || 'Better luck next round!'}</p>${g.practice ? '' : `<div class="bl-amt minus">−${inr(g.stake)}</div>`}`;
    html += `<div class="bl-btns"><button type="button" class="bl-b2" onclick="ballGame.toLobby()">Lobby</button><button type="button" class="bl-b1" onclick="ballGame.again()"><i class="fa-solid fa-rotate"></i> Play again</button></div></div>`;
    $('bl-res').innerHTML = html; $('bl-res').classList.add('on');
    if (won && !draw && !g.practice && window.confetti) { try { window.confetti(); } catch (e) {} }
}
function cleanup() { clearTimeout(st.pollT); clearInterval(st.searchT); clearInterval(st.timerT); clearInterval(st.fallbackT); clearInterval(st.balT); if (st.unsub) { try { st.unsub(); } catch (e) {} st.unsub = null; } st.playing = false; st.queue = []; st.pumping = false; }

/* ---------- public ---------- */
async function toLobby() {
    cleanup(); $('bl-res').classList.remove('on'); st.gid = null; st.game = null; st.ticket = null; showS('bl-lobby');
    try { await loadCfg(); } catch (e) { toast(e.message); } paintLobby(); st.balT = setInterval(() => { if ($('bl-lobby').classList.contains('on')) { $('bl-bal').textContent = (Math.round(balance() * 100) / 100).toLocaleString('en-IN'); const p = $('bl-play-t'); if (st.cfg && st.cfg.enabled) p.textContent = balance() >= st.entry ? `Play ₹${st.entry}` : 'Add money to play'; } }, 1000);
}
function back(silent) {
    if (st.playing && st.game && st.game.status === 'playing') return toast('Game in progress — use Leave to quit (you lose your entry)');
    if (st.ticket) cancel(true);
    if ($('bl-lobby').classList.contains('on') || !silent && !st.gid) return close();
    toLobby();
}
function close() { cleanup(); $('ball').classList.remove('on'); $('ball').setAttribute('aria-hidden', 'true'); document.body.classList.remove('ball-open'); }
async function cancel(quiet) { const t = st.ticket; st.ticket = null; clearTimeout(st.pollT); clearInterval(st.searchT); if (t) { try { await api('cancel', { ticket: t }, 8000); } catch (e) {} } if (!quiet) toLobby(); }
function mkCard() {
    return `<div class="gc-list"><button type="button" class="gc" onclick="ballGame.open()"><img src="assets/img/game/4ball-logo-sm.webp" alt="4 Ball Match" draggable="false"><div><b>4 Ball Match</b><span>Line up 4 balls and win cash</span><em>Entry from ₹2 · Win up to 1.8×</em></div><i class="fa-solid fa-play"></i></button><div class="gc soon"><i class="fa-solid fa-lock"></i><div><b>More games</b><span>Coming soon</span></div></div></div>`;
}
window.ballGame = {
    card: mkCard,
    async open() {
        if (!authService.currentUser) { try { window.app.checkLogin(() => window.ballGame.open()); } catch (e) { toast('Please log in'); } return; }
        $('ball').classList.add('on'); $('ball').setAttribute('aria-hidden', 'false'); document.body.classList.add('ball-open'); showS('bl-lobby'); $('bl-bal').textContent = (Math.round(balance() * 100) / 100).toLocaleString('en-IN');
        $('bl-entries').innerHTML = '<div style="grid-column:1/-1;text-align:center;opacity:.7;padding:18px"><i class="fa-solid fa-spinner fa-spin"></i> Connecting to game server…<br><small>First connection can take up to a minute</small></div>';
        try { const r = await loadCfg(); if (r.active) { st.entry = 0; return attach(r.active); } paintLobby(); st.balT = setInterval(() => { if ($('bl-lobby').classList.contains('on')) { $('bl-bal').textContent = (Math.round(balance() * 100) / 100).toLocaleString('en-IN'); const p = $('bl-play-t'); if (st.cfg && st.cfg.enabled) p.textContent = balance() >= st.entry ? `Play ₹${st.entry}` : 'Add money to play'; } }, 1000); }
        catch (e) { $('bl-entries').innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:14px;color:#fecaca">${esc(e.message)}</div>`; }
    },
    pick(e) { st.entry = e; paintLobby(); sfx('touch'); },
    play(practice) {
        if (!st.cfg) return; st.practice = !!practice;
        if (!st.practice && balance() < st.entry) return window.ballGame.addMoney();
        doFindStart();
    },
    retry() { doFindStart(true); },
    cancel: () => cancel(false), back, drop, leave: async () => {
        const g = st.game; if (!g || g.status !== 'playing') return toLobby();
        const ok = await (window.ui && window.ui.confirm ? window.ui.confirm({ title: 'Leave the match?', text: g.practice ? 'You will lose this practice game.' : `You will lose your ${inr(g.stake)} entry.`, yes: 'Leave' }) : Promise.resolve(confirm('Leave the match? You lose your entry.')));
        if (!ok) return; try { const r = await api('leave', { gid: g.id }, 15000); if (r.game) onGame(r.game); } catch (e) { toast(e.message); }
    },
    again() { $('bl-res').classList.remove('on'); cleanup(); if (st.practice && st.practiceLeft <= 1) return toLobby(); window.ballGame.play(st.practice); },
    toLobby, addMoney() { close(); try { window.ui.openModal('modal-deposit'); } catch (e) {} }, close,
};
function doFindStart(again) { doFind(); }
// Game tab dot while a game is running (resume) — lightweight check when chat opens
document.addEventListener('visibilitychange', () => {});
