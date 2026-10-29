/**
 * Module manifest — ORDER MATTERS.
 * Objects like window.app / window.chat are created by the first file of a group
 * and extended by the rest, so keep each group in this order.
 */

// Core state
import './core/firebase.js';
import './core/state.js';
import './core/fx.js';
import './core/sfx.js';
import './core/walletfx.js';
import './core/messages.js';
import './core/timers.js';

// Auth (creates window.auth, then extends it)
import '../pages/login/login.js';
import '../pages/register/register.js';
import '../pages/login/forgot.js';
import '../components/session/session.js';

// App core (creates window.app) + feature extensions
import './core/app.js';
import './core/auth-state.js';
import '../pages/setting/setting.js';
import '../pages/setting/rules.js';
import '../components/gift/gift.js';
import '../components/notifications/notifications.js';
import '../components/ban-overlay/ban-overlay.js';
import '../pages/home/home.js';
import '../components/join/join.js';
import '../pages/match/match.js';
import '../pages/rank/rank.js';
import '../pages/wallet/wallet.js';
import '../components/transfer/transfer.js';
import '../components/deposit/deposit.js';
import '../pages/loading/loading.js';
import '../pages/withdrawal/withdrawal.js';
import '../pages/history/history.js';

// UI + navigation
import './core/ui.js';
import './core/nav.js';
import '../components/toast/notify.js';
import './core/polish.js';
import './core/live.js';

// Chat (new system: data in js/core/chat-firebase.js database)
import '../pages/chat/chat-ui.js';

// Shell behaviour
import './core/history-manager.js';
import '../components/header/header.js';
import '../components/drawer/drawer.js';
import '../components/trx-detail/trx-detail.js';

// Background services
import './core/auto-refresh.js';

// Boot
import './core/animate.js';

import './core/start.js';
