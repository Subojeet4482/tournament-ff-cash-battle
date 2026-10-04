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
js/core/                   -> firebase, state, timers, ui, nav, auth-state, presence, auto-refresh ...
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
| chat (+ hub, profile, search, world, friends, thread, discover) | `pages/chat/` |
| withdrawal (+ success popup) | `pages/withdrawal/` |
| history (wallet history) | `pages/history/` |
| loading (payment verify overlay + skeletons) | `pages/loading/` |

## How to add a new page / feature
1. Create `pages/xyz/xyz.html`, `xyz.css`, `xyz.js`
2. Add the `<link>` and `<div data-include="pages/xyz/xyz.html"></div>` to `index.html`
3. Add `import '../pages/xyz/xyz.js';` to `js/modules.js`

## What's new (v2)
- **rules.txt** — Firestore + Storage rules (matched to the app + admin.html). Read the notes before publishing.
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

## What's new (v4 — Chat)
- **pages/chat/chat-ui.css** (new): full chat redesign + animations (hub, world, friends, search, discover, profile, thread, sheets, dark mode).
- **pages/chat/fixes.js** (new): bug fixes + smart message render (only new messages animate), thread header (photo/online/last seen), back navigation, debounce, parallel loading.
- Fix: `openSheet/closeSheet` were not global -> Edit Profile, Blocked list, Emoji and Contact card were broken.
- Fix: the composer disappeared on scroll, the message list flickered on every snapshot, and the profile friends list flickered "Loading...".

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

