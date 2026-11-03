/** Home-screen shortcuts (manifest): ?go=wallet | chat | matches | leaderboard */
const go = new URLSearchParams(location.search).get('go');
if (go) { const t = setInterval(() => { if (window.nav && window.nav.goto && window.db && window.db.user_uid) { clearInterval(t); try { window.nav.goto(go); } catch (e) {} } }, 500); setTimeout(() => clearInterval(t), 20000); }
