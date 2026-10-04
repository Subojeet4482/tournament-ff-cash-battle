# FF Cash Battle — Modular Project

Single `index.html` ko page / component wise folders mein baanta gaya hai. Design, logic aur behaviour **same** hai.

## Kaise chalaye (zaroori)
Ye project ab alag-alag files load karta hai, isliye `index.html` ko double-click (file://) se nahi chalega. Local server se kholo:

```bash
npx serve .          # ya
python3 -m http.server 8000
```
VS Code mein "Live Server" bhi chalega. Firebase Hosting / Netlify / GitHub Pages par bina kisi change ke deploy hota hai.

Sound files `assets/sounds/` mein rakho (README wahin hai).

## Folder structure
```
index.html                 -> shell: CSS links + jagah-jagah <div data-include="..."> + js/main.js
css/base/                  -> variables, reset, layout, shared components
css/themes/dark.css        -> dark mode (sabse last load hota hai)
js/main.js                 -> entry: pehle HTML fragments load, phir modules
js/modules.js              -> saare JS modules ki list (ORDER MATTERS)
js/core/                   -> firebase, state, timers, ui, nav, auth-state, presence, auto-refresh ...
pages/<name>/              -> har page ka apna .html + .css + .js
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

## Naya page / feature kaise add kare
1. `pages/xyz/xyz.html`, `xyz.css`, `xyz.js` banao
2. `index.html` mein `<link>` aur `<div data-include="pages/xyz/xyz.html"></div>` daalo
3. `js/modules.js` mein `import '../pages/xyz/xyz.js';` add karo

## Naya kya hai (v2)
- **rules.txt** — Firestore + Storage rules (app + admin.html ke hisaab se). Top par publish steps aur limitations likhe hain, pehle wo padho.
- **css/base/animations.css + js/core/animate.js** — poore app ki animations (page enter, card stagger, modal spring, drawer, toggles, nav, podium). `prefers-reduced-motion` respect hota hai.
- Match join ab turant khulta hai (cached data se), fresh check background mein hota hai.
- Withdrawal bank/crypto form redesign (labels, icons, live validation). AI Mode poori tarah hata diya gaya.
- Join / withdraw ab atomic batch hain, deposit credit `lastDepositUtr` ke saath likha jaata hai (rules isi par depend karte hain).

## Naya kya hai (v3)
- **Login / Sign Up redesign** (`pages/login`, `pages/register`): animated backdrop, spring card, sliding Login/Sign Up tabs, password eye, strength meter, Enter-key submit, loading button, shake on error, green check success animation, welcome chip.
- **Logout** (`components/session/`): animated confirm sheet -> goodbye overlay (spinner -> check -> "See you soon").
- **Join modal** (`components/join/`): step indicator, fee count-up, custom checkbox, payment-success overlay, slot pop-in + pick bounce, confetti on slot confirm.
- Shared helpers: `js/core/fx.js` (countUp, confetti, joinDone).

## Notes
- `window.app`, `window.chat`, `window.auth` pehle ek file mein bante hain aur baaki files unhe `Object.assign` se extend karti hain. Isliye `js/modules.js` ka order mat badlo.
- Shared CSS: `register.css` sirf auth-switch links ka hai, baaki auth card ka style `login.css` mein (dono forms same card use karte hain). `history.css` mein transaction-item styles hain jo Wallet + History dono use karte hain.

## Naya kya hai (v4 — Chat)
- **pages/chat/chat-ui.css** (naya): chat ka poora redesign + animations (hub, world, friends, search, discover, profile, thread, sheets, dark mode).
- **pages/chat/fixes.js** (naya): bug fixes + smart message render (sirf naye messages animate hote hain), thread header (photo/online/last seen), back navigation, debounce, parallel loading.
- Fix: `openSheet/closeSheet` global nahi the -> Edit Profile, Blocked list, Emoji, Contact card toot rahe the.
- Fix: composer scroll karte hi gayab ho jata tha, message list har snapshot par flicker, profile friends "Loading..." flicker.
