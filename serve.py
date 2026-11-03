#!/usr/bin/env python3
"""
Local dev server for FF Cash Battle.

Same as `python -m http.server`, but it tells the browser to NEVER cache anything, so a JS/CSS file you just
replaced is always loaded fresh (plain http.server sends no cache header, and Chrome then re-uses old copies
of the .js modules for hours without even asking the server).

Usage (from anywhere):   python serve.py [port]        # default port 8080
"""
import http.server
import os
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))  # always serve the folder this file lives in
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    http.server.test(HandlerClass=NoCacheHandler, port=port)  # dual-stack (IPv4 + IPv6) like `python -m http.server`
