"""TravelPlus 开发静态服务器——带 no-cache 响应头。

为什么不用 `python -m http.server`：
- 它不返回 Cache-Control 头，浏览器对模块脚本启用启发式缓存，
  改动 js/css 后刷新页面仍会命中旧模块（前端"改了没生效"的元凶）。
本服务在原功能基础上为每个响应追加 no-store 头，开发期改动即时生效。

用法：python serve_no_cache.py [port]（默认 19608）
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    """每个响应追加 Cache-Control: no-store，禁用浏览器缓存"""

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 19608
    server = ThreadingHTTPServer(('0.0.0.0', port), NoCacheHandler)
    print(f'Serving with no-cache headers at http://localhost:{port}')
    server.serve_forever()
