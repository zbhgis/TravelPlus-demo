"""TravelPlus 前端开发服务器：带 no-cache 头的静态文件服务（替代 python -m http.server）。

背景：python http.server 不发 Cache-Control 头，浏览器按 Last-Modified 做「启发式缓存」，
开发中改了 JS/CSS 后普通刷新可能拿到旧文件（子模块版本号双 bump 也救不了 index.html 自身）。
本服务器对所有响应加 no-cache 头，浏览器每次导航都会向服务器验证新鲜度（mtime 未变回 304，
零流量开销），彻底消除"改了代码页面没变"的问题。

用法：python serve-dev.py [port] （默认 8090，服务本文件所在目录）
"""
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    """静态文件处理器：响应统一附加 no-cache 头"""

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8090
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    server = ThreadingHTTPServer(("127.0.0.1", port), NoCacheHandler)
    print(f"TravelPlus dev server (no-cache) on http://127.0.0.1:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
