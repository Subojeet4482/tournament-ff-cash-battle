# Fampay UPI credit watcher — Render-ready version.

import os
import re
import sys
import json
import time
import base64
import threading

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

import firebase_admin
from firebase_admin import credentials as fb_credentials, firestore

from flask import Flask, jsonify

app = Flask(__name__)

_state = {
    "status": "starting",
    "last_run": None,
    "last_saved": 0,
    "total_saved": 0,
    "errors": [],
    "gmail_connected": False,
    "emails_found": 0,
}


def _require(name):
    v = os.environ.get(name)
    if not v:
        print(f"[fatal] Missing required environment variable: {name}")
        sys.exit(1)
    return v


CLIENT_ID     = _require("GMAIL_CLIENT_ID")
CLIENT_SECRET = _require("GMAIL_CLIENT_SECRET")
REFRESH_TOKEN = _require("GMAIL_REFRESH_TOKEN")
TOKEN_URI     = "https://oauth2.googleapis.com/token"
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL", "15"))

GMAIL_QUERY = "from:no-reply@famapp.in newer_than:30d"

MAX_PROCESSED_CACHE = 2000


# ── Firebase ──────────────────────────────────────────────────────────────────────
def init_firebase():
    if firebase_admin._apps:
        return firestore.client()
    creds_b64 = os.environ.get("FIREBASE_CREDENTIALS_B64")
    if not creds_b64:
        print("[fatal] Missing FIREBASE_CREDENTIALS_B64")
        sys.exit(1)
    try:
        creds_json = json.loads(base64.b64decode(creds_b64).decode("utf-8"))
    except Exception as e:
        print(f"[fatal] Could not decode FIREBASE_CREDENTIALS_B64: {e}")
        sys.exit(1)
    cred = fb_credentials.Certificate(creds_json)
    firebase_admin.initialize_app(cred)
    print("[firebase] initialised OK")
    return firestore.client()


def load_processed(db):
    try:
        doc = db.collection("bot_meta").document("processed_ids").get()
        if doc.exists:
            return set(doc.to_dict().get("ids", []))
    except Exception as e:
        print(f"[warn] load processed: {e}")
    return set()


def save_processed(db, s):
    try:
        db.collection("bot_meta").document("processed_ids").set(
            {"ids": list(s)[-MAX_PROCESSED_CACHE:]}
        )
    except Exception as e:
        print(f"[warn] save processed: {e}")


# ── Gmail ─────────────────────────────────────────────────────────────────────────
def gmail_service():
    print("[gmail] building service...")
    creds = Credentials(
        token=None,
        refresh_token=REFRESH_TOKEN,
        token_uri=TOKEN_URI,
        client_id=CLIENT_ID,
        client_secret=CLIENT_SECRET,
        scopes=["https://www.googleapis.com/auth/gmail.readonly"],
    )
    svc = build("gmail", "v1", credentials=creds, cache_discovery=False)
    profile = svc.users().getProfile(userId="me").execute()
    print(f"[gmail] connected OK — account: {profile.get('emailAddress')}")
    return svc


def extract_text(payload):
    parts = []
    def walk(p):
        mime = p.get("mimeType", "")
        body = p.get("body", {})
        data = body.get("data")
        if data and mime.startswith("text/"):
            try:
                parts.append(
                    base64.urlsafe_b64decode(data + "===").decode("utf-8", "ignore")
                )
            except Exception:
                pass
        for sub in p.get("parts", []) or []:
            walk(sub)
    walk(payload)
    return "\n".join(parts)


UTR_PATTERNS = [
    re.compile(r"UTR[^A-Za-z0-9]{0,5}([A-Za-z0-9]{10,22})", re.I),
    re.compile(r"\bRRN[^A-Za-z0-9]{0,5}([0-9]{10,18})", re.I),
    re.compile(
        r"\b(?:Transaction|Txn|Ref(?:erence)?)\s*(?:ID|No\.?|#)?[^A-Za-z0-9]{0,5}"
        r"([A-Za-z0-9]{10,22})",
        re.I,
    ),
]
AMOUNT_PATTERNS = [
    re.compile(
        r"(?:received|credited|got)[^\d₹Rs.]{0,30}"
        r"(?:Rs\.?|₹|INR)\s*([0-9]+(?:[.,][0-9]{1,2})?)",
        re.I,
    ),
    re.compile(r"(?:Rs\.?|₹|INR)\s*([0-9]+(?:[.,][0-9]{1,2})?)", re.I),
]


def parse_email(text):
    amount = utr = None
    for pat in AMOUNT_PATTERNS:
        m = pat.search(text)
        if m:
            try:
                amount = float(m.group(1).replace(",", ""))
                break
            except Exception:
                continue
    for pat in UTR_PATTERNS:
        m = pat.search(text)
        if m:
            utr = m.group(1).strip()
            break
    return amount, utr


def process_once(gmail, db):
    processed = load_processed(db)
    try:
        res = (
            gmail.users()
            .messages()
            .list(userId="me", q=GMAIL_QUERY, maxResults=50)
            .execute()
        )
    except HttpError as e:
        raise RuntimeError(f"Gmail API error: {e}") from e

    msgs = res.get("messages", []) or []
    _state["emails_found"] = len(msgs)

    if not msgs:
        print(f"[gmail] no matching messages — query: {GMAIL_QUERY}")
        return 0

    print(f"[gmail] found {len(msgs)} message(s)")

    new_count = 0
    for m in msgs:
        mid = m["id"]
        if mid in processed:
            continue

        try:
            full = (
                gmail.users()
                .messages()
                .get(userId="me", id=mid, format="full")
                .execute()
            )
        except HttpError as e:
            print(f"[err ] fetch {mid}: {e}")
            continue

        text    = extract_text(full.get("payload", {}))
        snippet = full.get("snippet", "")
        body    = text + "\n" + snippet

        print(f"[debug] msg={mid} snippet={snippet[:150]!r}")

        # ── only RECEIVED mails are saved, PAID mails are skipped ──────────────
        low = body.lower()
        if "successfully paid" in low:
            print(f"[skip-paid] {mid}: paid mail, ignoring")
            processed.add(mid)
            continue
        if "successfully received" not in low:
            print(f"[skip] {mid}: not a received mail")
            processed.add(mid)
            continue
        # ──────────────────────────────────────────────────────────────────

        amount, utr = parse_email(body)

        if not (amount and utr):
            print(f"[skip] {mid}: amount={amount} utr={utr}")
            processed.add(mid)
            continue

        try:
            ref = db.collection("fampay_deposits").document(utr)
            if ref.get().exists:
                print(f"[dup ] utr={utr}")
            else:
                ref.set({
                    "utr":            utr,
                    "amount":         amount,
                    "source":         "famapp-gmail",
                    "gmailMessageId": mid,
                    "receivedAt":     int(time.time() * 1000),
                    "rawSnippet":     snippet[:300],
                })
                print(f"[save] utr={utr} amount=Rs.{amount}")
                new_count += 1
            processed.add(mid)
        except Exception as e:
            print(f"[err ] firestore: {e}")
            _state["errors"].append(str(e))

    save_processed(db, processed)
    return new_count


def polling_loop():
    print("[loop] initialising Firebase...")
    db = init_firebase()

    print("[loop] initialising Gmail...")
    while True:
        try:
            gmail = gmail_service()
            _state["gmail_connected"] = True
            break
        except Exception as e:
            print(f"[loop] Gmail init failed: {e}")
            _state["errors"] = (_state["errors"] + [str(e)])[-20:]
            print("[loop] retrying in 30s...")
            time.sleep(30)

    _state["status"] = "running"
    print(f"[loop] started — polling every {POLL_INTERVAL}s")
    print(f"[loop] query: {GMAIL_QUERY}")

    while True:
        try:
            n = process_once(gmail, db)
            _state["last_run"]    = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            _state["last_saved"]  = n
            _state["total_saved"] += n
        except Exception as e:
            err = str(e)
            print(f"[loop-err] {err}")
            _state["errors"] = (_state["errors"] + [err])[-20:]
        time.sleep(POLL_INTERVAL)


@app.route("/")
def index():
    return jsonify({
        "service":         "famapp-gmail-watcher",
        "status":          _state["status"],
        "gmail_connected": _state["gmail_connected"],
        "emails_found":    _state["emails_found"],
        "last_run":        _state["last_run"],
        "last_saved":      _state["last_saved"],
        "total_saved":     _state["total_saved"],
        "gmail_query":     GMAIL_QUERY,
        "recent_errors":   _state["errors"][-5:],
    })


@app.route("/health")
def health():
    return jsonify({"ok": True}), 200


_poll_thread = threading.Thread(target=polling_loop, daemon=True)
_poll_thread.start()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    print(f"[web] listening on port {port}")
    app.run(host="0.0.0.0", port=port)
