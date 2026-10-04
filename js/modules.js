/**
 * Module manifest — ORDER MATTERS.
 * Objects like window.app / window.chat are created by the first file of a group
 * and extended by the rest, so keep each group in this order.
 */

// Core state
import './core/firebase.js';
import './core/state.js';
import './core/fx.js';
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

// Chat (chat.js creates window.chat, rest extend it)
import '../pages/chat/chat.js';
import '../pages/chat/hub/hub.js';
import '../pages/chat/profile/profile.js';
import '../pages/chat/search/search.js';
import '../pages/chat/messages.js';
import '../pages/chat/world/world.js';
import '../pages/chat/friends/friends.js';
import '../pages/chat/thread/thread.js';
import '../pages/chat/discover/discover.js';

// Shell behaviour
import './core/history-manager.js';
import '../components/header/header.js';
import '../components/drawer/drawer.js';
import '../components/trx-detail/trx-detail.js';

// Chat v2 enhancements (must come after chat parts)
import '../pages/chat/enhancements.js';
import '../pages/chat/fixes.js';

// Background services
import './core/presence.js';
import './core/auto-refresh.js';

// Boot
import './core/animate.js';

import './core/start.js';
