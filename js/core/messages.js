/**
 * Central message catalog (English) — withdrawal, deposit, refund.
 *
 * One place for every default message the app shows: popups, toasts, notifications and the
 * transaction-detail sheet. Admin can attach a reason to any transaction with ONE of:
 *   reasonCode : a key from msg.reasons.<withdraw|deposit|refund>   (recommended)
 *   reason / rejectReason / failReason / remark / adminNote : free text
 * If neither is present, a sensible default reason for that status is shown.
 */
(() => {
    const num = (v) => { const n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : Math.abs(n); };
    const inr = (v) => { const n = num(v); return '₹' + (Number.isInteger(n) ? n : n.toFixed(2)); };

    // ------------------------------------------------------------------ status look & feel
    const STATUS = {
        pending:    { label: 'Pending',    tone: 'warn',    icon: 'fa-hourglass-half' },
        processing: { label: 'Processing', tone: 'info',    icon: 'fa-spinner' },
        success:    { label: 'Successful', tone: 'success', icon: 'fa-circle-check' },
        failed:     { label: 'Failed',     tone: 'danger',  icon: 'fa-circle-xmark' },
        rejected:   { label: 'Rejected',   tone: 'danger',  icon: 'fa-circle-xmark' },
        refunded:   { label: 'Refunded',   tone: 'info',    icon: 'fa-rotate-left' },
        cancelled:  { label: 'Cancelled',  tone: 'muted',   icon: 'fa-ban' },
    };
    const normStatus = (s) => {
        s = String(s || 'pending').toLowerCase().trim();
        if (['completed', 'complete', 'paid', 'approved', 'done', 'credited'].includes(s)) return 'success';
        if (['mismatch', 'error', 'declined', 'expired'].includes(s)) return 'failed';
        if (['canceled'].includes(s)) return 'cancelled';
        if (['refund', 'returned'].includes(s)) return 'refunded';
        return STATUS[s] ? s : 'pending';
    };

    // ------------------------------------------------------------------ reasons (why something failed / was refunded)
    const reasons = {
        withdraw: {
            invalid_account:   { label: 'Invalid bank details',        text: 'The account number or IFSC code does not match a valid bank account. Please double-check both and place a new request.' },
            name_mismatch:     { label: 'Account name mismatch',       text: 'The account holder name does not match the name on your profile. Withdrawals can only be sent to an account in your own name.' },
            account_closed:    { label: 'Account unavailable',         text: 'The receiving bank account is closed, frozen or not accepting credits. Please use a different, active account.' },
            bank_declined:     { label: 'Declined by your bank',       text: 'Your bank declined the incoming transfer. This is usually temporary — please try again later or use another account.' },
            limit_exceeded:    { label: 'Bank limit exceeded',         text: 'The transfer crossed the receiving limit of your account or bank. Try a smaller amount or another account.' },
            invalid_wallet:    { label: 'Invalid wallet address',      text: 'The crypto wallet address is not valid. Please copy it again directly from your wallet app and retry.' },
            wrong_network:     { label: 'Wrong network selected',      text: 'The address does not belong to the network you selected (e.g. TRC20 vs BEP20). Sending on the wrong network can lose funds, so we stopped the payout.' },
            below_minimum:     { label: 'Below minimum amount',        text: 'The requested amount is below the minimum withdrawal of ₹20, or too low to cover the processing fee.' },
            not_verified:      { label: 'Profile not verified',        text: 'Your phone number or game UID is not verified yet. Please complete verification from your profile and try again.' },
            under_review:      { label: 'Account under review',        text: 'Our security team is reviewing recent activity on your account. Withdrawals resume as soon as the review is complete.' },
            duplicate:         { label: 'Duplicate request',           text: 'A similar withdrawal request was already submitted. Please wait for the first one to be completed before sending another.' },
            technical:         { label: 'Technical issue',             text: 'Our payment partner had a temporary technical problem while sending your money. This is not your fault — please try again.' },
            other:             { label: 'Could not be completed',      text: 'Our payments team was unable to complete this withdrawal. Please contact support with your reference ID for details.' },
        },
        deposit: {
            utr_not_found:     { label: 'Payment not found',           text: 'We could not find a payment with this UTR / Transaction ID in our bank records. Please check that you typed the 12-digit UTR correctly.' },
            amount_mismatch:   { label: 'Amount mismatch',             text: 'The amount you entered does not match the amount we received for this payment. Please contact support with your payment screenshot.' },
            utr_used:          { label: 'UTR already used',            text: 'This UTR / Transaction ID has already been used for a deposit, so it cannot be credited again.' },
            utr_other_user:    { label: 'UTR belongs to another user', text: 'This UTR / Transaction ID is already linked to a different account. Please use only your own payment details.' },
            bank_pending:      { label: 'Bank confirmation pending',   text: 'Your bank has not confirmed this payment yet. UPI payments sometimes take a little while — if the money was debited it will be credited or returned automatically.' },
            bank_failed:       { label: 'Payment failed at bank',      text: 'The payment did not complete on the bank side, so no money was received. If any amount was debited, your bank normally reverses it within 3–5 working days.' },
            wrong_receiver:    { label: 'Paid to a different UPI ID',  text: 'The payment was sent to a UPI ID other than the one shown in the app. Always pay only to the UPI ID displayed on the deposit screen.' },
            timeout:           { label: 'Verification timed out',      text: 'We waited for the payment to appear in our records but it did not arrive in time. If the money was debited, contact support — we will verify it manually.' },
            hash_not_found:    { label: 'Transaction hash not found',  text: 'We could not find this transaction hash on the blockchain. Please check the hash and the network you used.' },
            low_confirmations: { label: 'Waiting for confirmations',   text: 'Your crypto transfer has not received enough network confirmations yet. It will be credited automatically once confirmed.' },
            wrong_network:     { label: 'Wrong network used',          text: 'The transfer was sent on a different network than the one shown in the app, so it could not be matched to your account.' },
            below_minimum:     { label: 'Below minimum deposit',       text: 'The deposited amount is below the minimum deposit of ₹5.' },
            other:             { label: 'Could not be verified',       text: 'We could not verify this payment automatically. Please contact support with your UTR / hash and a screenshot of the payment.' },
        },
        refund: {
            match_cancelled:   { label: 'Match cancelled',             text: 'This match was cancelled by the organisers, so your entry fee has been returned in full.' },
            match_not_started: { label: 'Not enough players',          text: 'The match did not get enough players to start on time, so it was cancelled and your entry fee was returned.' },
            room_issue:        { label: 'Room could not be created',   text: 'We were unable to create or share the custom room for this match. Your entry fee has been returned.' },
            slot_conflict:     { label: 'Slot conflict',               text: 'Your slot was taken by another player at the same moment. Your entry fee for the unused slot has been returned.' },
            duplicate_payment: { label: 'Duplicate payment',           text: 'You were charged more than once for the same payment. The extra amount has been returned to you.' },
            withdrawal_failed: { label: 'Withdrawal not completed',    text: 'Your withdrawal could not be completed, so the full amount has been returned to your Withdrawal Balance.' },
            deposit_excess:    { label: 'Extra amount received',       text: 'We received more than the amount you entered. The extra amount has been returned to you.' },
            technical_error:   { label: 'Technical error',             text: 'A technical error affected this transaction. We have reversed it and returned your money.' },
            admin_adjustment:  { label: 'Support adjustment',          text: 'This amount was returned to your wallet by our support team after reviewing your request.' },
            other:             { label: 'Refund issued',               text: 'This amount has been refunded to your wallet. Contact support if you have any questions.' },
        },
    };

    // ------------------------------------------------------------------ helpers
    const destOf = (t) => {
        if (!t) return 'account';
        const m = String(t.method || '').toUpperCase();
        if (m === 'CRYPTO') return `${t.coin || 'crypto'}${t.network ? ' (' + t.network + ')' : ''} wallet`;
        if (m === 'BANK') return 'bank account';
        return 'account';
    };
    const refOf = (t) => (t && (t.ref || t._id)) ? String(t.ref || t._id).slice(0, 8).toUpperCase() : '';

    const pickReason = (t, kind) => {
        if (!t) return null;
        const cat = reasons[kind] || {};
        if (t.reasonCode && cat[t.reasonCode]) return { code: t.reasonCode, ...cat[t.reasonCode] };
        const free = t.reason || t.rejectReason || t.failReason || t.remark || t.adminNote || t.note;
        if (free) return { code: 'custom', label: 'Reason', text: String(free) };
        return null;
    };

    // ------------------------------------------------------------------ public API
    const msg = {
        inr, reasons, STATUS, normStatus, refOf,

        // ---------- WITHDRAWAL ----------
        withdraw: {
            minAmount:    () => 'The minimum withdrawal amount is ₹20.',
            fillAll:      () => 'Please fill in all the fields to continue.',
            shortName:    () => 'Account holder name looks too short. Please enter the full name as per your bank.',
            badAccount:   () => 'Account number must be 9 to 18 digits.',
            badIfsc:      () => 'Invalid IFSC code. It should look like SBIN0001234.',
            insufficient: (bal) => `Insufficient Withdrawal Balance${bal != null ? ' — you can withdraw up to ' + inr(bal) : ''}. Only winnings can be withdrawn.`,
            processing:   () => 'Placing your withdrawal request…',
            // neutral list title (status badge shows the real state, so it never contradicts it)
            title:        (amt, masked) => `Withdrawal ${inr(amt)} · ${masked}`,
            popupTitle:   () => 'Withdrawal Request Successful',
            popupBody:    (amt, net, t) => `Your request to withdraw ${inr(amt)} has been received and sent to our payments team. After the ₹2 processing fee you will receive ${inr(net)} in your ${destOf(t)}, usually within 1–3 working days.`,
            popupSteps:   ['Request received', 'Under review by our team', 'Money sent to you'],
            popupFoot:    () => 'We will notify you the moment your payment is sent. Thank you for playing with us!',
            toastFallback:() => 'Withdrawal request placed successfully.',
            notifyOk:     (amt, net) => ({ title: 'Withdrawal Request Received', body: `We have received your request to withdraw ${inr(amt)}. You will receive ${inr(net)} within 1–3 working days.` }),
        },

        // ---------- DEPOSIT ----------
        deposit: {
            enterAmount:  () => 'Please enter the amount you paid.',
            minAmount:    () => 'The minimum deposit amount is ₹5.',
            badUtr:       () => 'Please enter a valid UTR / Transaction ID (at least 6 characters).',
            needHash:     () => 'Please enter the transaction hash of your crypto transfer.',
            needLogin:    () => 'Please log in to add money to your wallet.',
            submitFailed: () => 'We could not submit your deposit. Please check your connection and try again.',
            utrUsed:      () => 'This UTR has already been used for a deposit.',
            utrOther:     () => 'This UTR is linked to a different account.',
            utrRejected:  () => 'This UTR was already reviewed and could not be verified. Please contact support.',
            utrAmount:    () => 'A different amount was already submitted for this UTR. Please enter the exact amount you paid.',
            cryptoSent:   () => 'Deposit request submitted. We will credit your wallet after the network confirms your transfer.',
            title: {
                pending:  (amt) => `Deposit ${inr(amt)} · verifying`,
                review:   (amt) => `Deposit ${inr(amt)} · under review`,
                success:  (amt) => `Deposit ${inr(amt)} · credited`,
                failed:   (amt) => `Deposit ${inr(amt)} · not verified`,
            },
            verifying:    { title: 'Verifying your payment…', sub: 'We are matching your UTR with our bank record. This takes about 10 seconds — please do not close the app.' },
            alreadyChecking: { title: 'Still verifying…', sub: 'We are already checking this UTR. Please wait a moment.' },
            processingToast: () => 'Your payment is still being confirmed by the bank. We will keep checking for about a minute and notify you.',
            success:      (amt) => ({ title: 'Payment Verified!', sub: `${inr(amt)} has been added to your Deposit Balance. You can use it to join matches right away.` }),
            successToast: (amt) => `${inr(amt)} has been added to your wallet.`,
            successNotify:(amt, utr) => ({ title: 'Deposit Successful', body: `${inr(amt)} has been credited to your Deposit Balance (UTR: ${utr}). Good luck in your next match!` }),
            // fail text depends on what we saw (e.g. an amount mismatch)
            fail:         (amt, utr, seen) => {
                const code = seen && seen.received != null && !isNaN(seen.received) ? 'amount_mismatch' : 'utr_not_found';
                const extra = code === 'amount_mismatch' ? ` We received ${inr(seen.received)} but you entered ${inr(amt)}.` : '';
                return {
                    code,
                    title: 'Deposit Could Not Be Verified',
                    sub: `We could not verify your payment of ${inr(amt)}.${extra} If money was debited, don't worry — contact support with your UTR and screenshot and we will resolve it.`,
                    body: `We could not verify your payment of ${inr(amt)} (UTR: ${utr}). ${reasons.deposit[code].text}${extra} If the money was debited from your account, contact support with your UTR and a payment screenshot — verified payments are always credited or refunded.`,
                    toast: 'We could not verify your deposit. Please contact support — your money is safe.',
                };
            },
        },

        // ---------- REFUND ----------
        refund: {
            title:  (amt, kind) => `Refund ${inr(amt)}${kind ? ' · ' + kind : ''}`,
            credited:(amt, code) => ({ title: 'Refund Credited', body: `${inr(amt)} has been credited back to your wallet. ${(reasons.refund[code] || reasons.refund.other).text}` }),
        },

        // ---------- LIVE (realtime top-right toasts) ----------
        live: {
            depositCredited: (amt) => ({ title: 'Deposit Credited', body: `${inr(amt)} has been added to your Deposit Balance.` }),
            balanceCredited: (amt) => ({ title: 'Balance Credited', body: `${inr(amt)} has been added to your Withdrawal Balance.` }),
            withdrawPaid:    (t) => ({ title: 'Withdrawal Successful', body: `${inr(t && t.net != null ? t.net : (t && t.amount))} has been sent to your ${destOf(t)}.` }),
        },

        // ---------- notifications default text ----------
        notif: {
            emptyBody: () => 'You have a new update on your account.',
            claimBody: () => 'Tap claim to add this amount to your wallet.',
            claimInfo: () => 'Rewards are credited to your wallet by our team. Nothing more is needed from you.',
            clearConfirm: () => 'Delete all notifications permanently? This cannot be undone.',
            loadFailed: () => 'Could not load notifications. Please check your connection.',
            title:        () => 'Notifications',
            emptyTitle:   () => "You're all caught up",
            emptySub:     () => 'No notifications yet. New updates will appear here.',
            clearTitle:   () => 'Clear all notifications?',
            clearYes:     () => 'Yes, delete all',
            clearNo:      () => 'Keep them',
            clearNothing: () => 'There is nothing to clear.',
            cleared:      () => 'All notifications have been deleted.',
        },

        /**
         * Describe any wallet transaction for UI.
         * returns { status, label, tone, icon, headline, message, reason:{label,text}|null, next:[], short }
         */
        describe: (t) => {
            t = t || {};
            const type = String(t.type || '').toLowerCase();
            const st = normStatus(t.status);
            const meta = STATUS[st];
            const amt = num(t.amount);
            const net = t.net != null ? num(t.net) : Math.max(0, amt - 2);
            const ref = refOf(t);
            const out = { status: st, label: meta.label, tone: meta.tone, icon: meta.icon, headline: '', message: '', reason: null, next: [], short: '' };
            const contact = 'Need help? Contact support from the menu and share your reference ID' + (ref ? ` (${ref})` : '') + '.';

            if (type === 'withdraw') {
                const d = destOf(t);
                if (st === 'pending') {
                    out.headline = 'Withdrawal request received';
                    out.message = `Your request to withdraw ${inr(amt)} is in our payout queue. Every request is reviewed for your safety, and ${inr(net)} (after the ₹2 fee) will reach your ${d} within 1–3 working days.`;
                    out.next = ['No action is needed from you.', 'We will notify you as soon as the payment is sent.'];
                    out.short = 'Awaiting payout';
                } else if (st === 'processing') {
                    out.headline = 'Payment in progress';
                    out.message = `We have started sending ${inr(net)} to your ${d}. Depending on your bank it can take a few hours to show up.`;
                    out.next = ['Keep an eye on your bank statement or wallet.'];
                    out.short = 'Sending to your ' + d;
                } else if (st === 'success') {
                    out.headline = 'Withdrawal paid';
                    out.message = `${inr(net)} has been sent to your ${d}. If you don't see it within 24 hours, please check your statement or contact support.`;
                    out.next = [contact];
                    out.short = 'Paid to your ' + d;
                } else if (st === 'refunded') {
                    out.headline = 'Withdrawal refunded';
                    out.message = `This withdrawal could not be completed, so ${inr(amt)} has been returned to your Withdrawal Balance. You can place a new request any time.`;
                    out.reason = pickReason(t, 'withdraw') || reasons.withdraw.other;
                    out.next = ['Check the reason below, fix the issue and try again.'];
                    out.short = 'Returned to wallet';
                } else if (st === 'cancelled') {
                    out.headline = 'Withdrawal cancelled';
                    out.message = `This withdrawal request was cancelled and ${inr(amt)} is back in your Withdrawal Balance.`;
                    out.reason = pickReason(t, 'withdraw');
                    out.short = 'Cancelled';
                } else {
                    out.headline = 'Withdrawal could not be completed';
                    out.message = `We were unable to complete this withdrawal. Your ${inr(amt)} is safe and is returned to your Withdrawal Balance — if you don't see it within 24 hours, contact support.`;
                    out.reason = pickReason(t, 'withdraw') || reasons.withdraw.other;
                    out.next = ['Review the reason below and place a new request.', contact];
                    out.short = out.reason.label;
                }
            } else if (type === 'deposit') {
                const crypto = String(t.method || '').toUpperCase() === 'CRYPTO';
                if (st === 'pending' || st === 'processing') {
                    out.headline = crypto ? 'Waiting for network confirmation' : 'Verifying your payment';
                    out.message = crypto
                        ? `We received your request to add ${inr(amt)}. It will be credited as soon as our team confirms your transfer on the blockchain.`
                        : `We are matching your payment of ${inr(amt)} with our bank record. UPI payments are usually confirmed within a minute.`;
                    out.next = ['No action is needed — we keep checking automatically.', 'You will be notified once the amount is credited.'];
                    out.short = crypto ? 'Awaiting confirmation' : 'Verifying payment';
                } else if (st === 'success') {
                    out.headline = 'Deposit successful';
                    out.message = `${inr(amt)} has been added to your Deposit Balance and is ready to use for joining matches.`;
                    out.short = 'Added to wallet';
                } else if (st === 'refunded') {
                    out.headline = 'Deposit refunded';
                    out.message = `Your payment of ${inr(amt)} has been refunded. It usually reaches your original payment source within 5–7 working days.`;
                    out.reason = pickReason(t, 'deposit') || pickReason(t, 'refund');
                    out.short = 'Refunded';
                } else if (st === 'cancelled') {
                    out.headline = 'Deposit cancelled';
                    out.message = `This deposit request of ${inr(amt)} was cancelled. No money was added to your wallet.`;
                    out.reason = pickReason(t, 'deposit');
                    out.short = 'Cancelled';
                } else {
                    out.headline = 'Deposit could not be verified';
                    out.message = `We could not verify your payment of ${inr(amt)}, so nothing was added to your wallet yet. If the money was debited from your account, it is safe — we will credit or refund it after checking.`;
                    out.reason = pickReason(t, 'deposit') || reasons.deposit.utr_not_found;
                    out.next = ['Contact support with your UTR / hash and a payment screenshot.', 'Do not pay again for the same amount until this is resolved.'];
                    out.short = out.reason.label;
                }
            } else if (type === 'refund' || st === 'refunded') {
                out.headline = 'Refund credited';
                out.message = `${inr(amt)} has been credited back to your wallet.`;
                out.reason = pickReason(t, 'refund') || reasons.refund.other;
                out.short = out.reason.label;
            } else if (type === 'game') {
                out.headline = 'Match entry';
                out.message = `${inr(amt)} was used as the entry fee for this match.`;
                out.short = '';
            }
            return out;
        },
    };

    window.msg = msg;
})();
