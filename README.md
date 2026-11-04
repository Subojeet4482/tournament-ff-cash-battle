# FF Cash Battle — user app (updated)

## What's new in this version
* **Desktop / tablet / phone layouts** — phone UI unchanged; tablet gets a centred column + dialog-style popups; desktop gets a left navigation rail, a 2-column match grid and a floating chat window. Safe-areas (notch), on-screen keyboard and very small 320px phones are handled.
* **Gaming art everywhere** — hero banner, match banners per mode (Battle Royale / Clash Squad / Lone Wolf), 12 gaming avatars, empty-state art, app icons. All local SVG (`assets/img/game/`), so nothing depends on external image sites. Broken images fall back to matching art automatically.
* **Search with pictures** — Home has a search bar (title, mode, map, `#ID`, fee, prize); results show the gaming banners, empty result shows an illustration. Chat user search shows gaming avatars.
* **Smooth motion** — page/card entrances, hover lift (desktop), press feedback, shimmer on buttons, animated hero & search focus, respects "reduce motion".
* **Chat** uses the chat Firebase project `tournament2-75029` (config in `js/core/app-config.js`).
  * Browser **notifications** + sound for new messages (service worker `sw.js`; tapping opens that chat).
  * **Red dots**: Chat icon in the bottom bar (with count), conversation rows, World room, tab title `(3) FF Cash Battle`. They clear when you open the chat.
  * Messages **live 24 hours** (admin can change 1–168 h in Admin → Chat Manager → World room). Expired messages are hidden at once and deleted from the database (by phones + the Backup Center job).
  * **Save on this device** — tap a message → *Save on this device*, or ⋮ → *Keep a copy on device* (auto-saves that chat). Saved messages live in the phone/PC storage (IndexedDB) and stay after the server deletes them. Export to .txt. Mute alerts per chat.
* PWA: installable (`manifest.webmanifest`).

## Added in this round
* **PNG artwork** from `wallet_icons`: new `ff-coin.png` everywhere, wallet rows use deposit / withdraw / gift / admin-add / admin-cut icons (layout like `example.png`), **Redeem Gift Code** popup rebuilt to match `gift-reedme-poppup.png`, `main-png.png` is the favicon / home-screen icon / login logo (+ home-screen shortcuts Wallet & Chat).
* **Wallet is always newest-first** — new credits/debits appear on top (flash + NEW tag). Old locale-date rows are sorted correctly too.
* **Players & slots** button on every match card: everyone who joined and the slot they picked (live). Admin Main panel shows the same on each match in its list.
* **Chat**: DM from World (tap a name/avatar → Message / Add friend / Report; public profiles can be messaged, private ones need friend), Edit / Delete (10 min), **drag a message to reply** (any direction), reply quotes, **emoji picker** + big animated emoji, red dot + notification when someone replies to you in World, DM list now also shows chats with non-friends.
* **Coin Battle** (Chat → Game): real wallet entry ₹2/5/10, real names + avatars, real-player matchmaking; after 2 failed searches a **BOT** (always labelled, separate bot avatar set) joins; winner credited 1.8× entry; wins appear on the Leaderboard ("won ₹X in 4 Ball"). Rules, timers and money run on the server (Main admin panel) — the phone cannot cheat.

## 4 things YOU must do
1. **`js/core/app-config.js` → set `CHAT_TOKEN_URL`** to your Main Admin Panel (service 1): `https://YOUR-MAIN-PANEL.onrender.com/api/chat/token`. (Until then chat keeps working inside the main project.)
2. **Publish the updated chat rules** (`firestore-rules/FIREBASE_CREDENTIALS_B641.txt`) in the chat project `tournament2-75029` — they add "delete a message once it is older than 24h". Chat works without it; the cleanup just relies on the Backup Center then.
3. Publish the updated **main-project rules** too (`firestore-rules/firestore.rules` / `FIREBASE_CREDENTIALS_B64.txt`) — adds read access to `ball_games`.
4. Host the app on **HTTPS** (Firebase Hosting / Netlify / Render static). Notifications and the service worker only work on HTTPS (or localhost).

> Browser notifications arrive while the site/app is open or in a background tab. Alerts when the browser is fully closed need Firebase Cloud Messaging + a server sender — `sw.js` already has the `push` handler ready for that.

---

# FF Cash Battle — Modular Project

The original single `index.html` has been split into page / component folders. Design, logic and behaviour are **unchanged**.

## How to run (important)
This project now loads separate files, so `index.html` will not work when opened by double-click (file://). Open it through a local server:

```bash
npx serve .          # or
python3 -m http.server 8000
```
The VS Code "Live Server" extension works too. It deploys to Firebase Hosting / Netlify / GitHub Pages with no changes.

Put sound files in `assets/sounds/` (there is a README there).

## Folder structure
```
index.html                 -> shell: CSS links + <div data-include="..."> placeholders + js/main.js
css/base/                  -> variables, reset, layout, shared components
css/themes/dark.css        -> dark mode (loaded last)
js/main.js                 -> entry: loads the HTML fragments first, then the modules
js/modules.js              -> list of all JS modules (ORDER MATTERS)
js/core/                   -> firebase, state, timers, ui, nav, auth-state, auto-refresh, chat-firebase ...
pages/<name>/              -> every page has its own .html + .css + .js
components/<name>/         -> shared pieces (header, drawer, nav-bar, deposit, join, transfer ...)
```

| File / Page | Folder |
|---|---|
| home | `pages/home/` |
| match (My Matches) | `pages/match/` |
| rank (Leaderboard) | `pages/rank/` |
| wallet | `pages/wallet/` |
| login (+ forgot password) | `pages/login/` |
| register | `pages/register/` |
| setting (settings, edit-profile, rules, sound) | `pages/setting/` |
| chat (World room, friends, groups, profile, game, search) | `pages/chat/` |
| withdrawal (+ success popup) | `pages/withdrawal/` |
| history (wallet history) | `pages/history/` |
| loading (payment verify overlay + skeletons) | `pages/loading/` |

## How to add a new page / feature
1. Create `pages/xyz/xyz.html`, `xyz.css`, `xyz.js`
2. Add the `<link>` and `<div data-include="pages/xyz/xyz.html"></div>` to `index.html`
3. Add `import '../pages/xyz/xyz.js';` to `js/modules.js`

## What's new (v2)
- Firestore rules are no longer inside this folder: use `FIREBASE_CREDENTIALS_B64.txt` (main project) and `FIREBASE_CREDENTIALS_B641.txt` (chat project) from the rules zip.
- **css/base/animations.css + js/core/animate.js** — animations for the whole app (page enter, card stagger, modal spring, drawer, toggles, nav, podium). `prefers-reduced-motion` is respected.
- Match join now opens instantly (from cached data); the fresh check runs in the background.
- Withdrawal bank/crypto form redesign (labels, icons, live validation). AI Mode has been removed completely.
- Join / withdraw are now atomic batches, and the deposit credit is written together with `lastDepositUtr` (the rules depend on this).

## What's new (v3)
- **Login / Sign Up redesign** (`pages/login`, `pages/register`): animated backdrop, spring card, sliding Login/Sign Up tabs, password eye, strength meter, Enter-key submit, loading button, shake on error, green check success animation, welcome chip.
- **Logout** (`components/session/`): animated confirm sheet -> goodbye overlay (spinner -> check -> "See you soon").
- **Join modal** (`components/join/`): step indicator, fee count-up, custom checkbox, payment-success overlay, slot pop-in + pick bounce, confetti on slot confirm.
- Shared helpers: `js/core/fx.js` (countUp, confetti, joinDone).

## Notes
- `window.app`, `window.chat` and `window.auth` are created in one file first, and the other files extend them with `Object.assign`. So do not change the order in `js/modules.js`.
- Shared CSS: `register.css` only holds the auth-switch links; the rest of the auth card style is in `login.css` (both forms use the same card). `history.css` holds the transaction-item styles used by both Wallet and History.

## Chat (current)
- Code: `pages/chat/` (`chat.js` = data + actions, `chat-ui.js` = screens, `chat.html`, `chat.css`). It uses its OWN Firestore: fill in
  `js/core/chat-firebase.js` (chat project web config + `CHAT_TOKEN_URL` of the admin server). Rules: `FIREBASE_CREDENTIALS_B641.txt`.
- Max 20 friends, edit/delete a message only within 10 minutes, every risky action asks for confirmation.

## Messages (withdrawal / deposit / refund)
All default messages live in one file: `js/core/messages.js` (`window.msg`).
To show a reason on a transaction, the admin sets `reasonCode` on that transaction
(a key of `msg.reasons.withdraw | deposit | refund`, e.g. `name_mismatch`, `utr_not_found`, `match_cancelled`)
or writes a free-text `reason`. Status: pending, processing, success, failed, rejected, refunded, cancelled.

## What's new (v5 — English cleanup + UI polish)
- All Hinglish comments, notes and the one user-visible string ("Name change limit reached") are now English (code, `rules.txt`, README files).
- **Notifications** (`components/notifications/`): redesigned sheet — icon + colour per type, "NEW" badges, relative time, shimmer skeleton, animated empty state.
  Clear now uses an animated inline confirm (no browser `confirm()`); cards fly out one by one, then the empty state pops in. Message text lives in `msg.notif` (`js/core/messages.js`).
  The header dot now shows only for notifications you have not opened yet.
- **css/base/polish.css + js/core/polish.js**: glass header / bottom nav with sliding indicator, richer match + wallet cards, button ripple, balance "bump" animation. Respects `prefers-reduced-motion`.

