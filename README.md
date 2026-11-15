# TravelPlus 演示版（纯前端 Demo）

TravelPlus 旅游平台的**纯静态演示版**：全部接口由内置 Mock 数据层应答，**无需任何后端服务**，
可直接部署到 GitHub Pages 等任意静态托管平台在线演示。

> 数据均为虚构演示数据；AI 总结 / AI 助手为预置文案的流式模拟；地图使用高德 JS API 真实渲染。

## 在线体验

- **登录**：任意手机号 + 任意 6 位验证码即可进入（登录页有提示）
- **可以体验**：首页三频道（关注/游记/景点）、景点详情与秒杀下单、游记发布与互动、
  全局搜索 + AI 总结（流式）、旅游 AI 助手（可说「帮我买一张西湖的秒杀票」）、
  路线规划（旅行页地图）、钱包/积分/签到、订单管理、私信与通知、收藏/粉丝等全部功能
- **说明**：客服工作台为特殊账号专属功能，演示账号不开放

## 本地运行

```bash
cd TravelPlus-demo
python -m http.server 19609
# 浏览器打开 http://localhost:19609
```

或使用仓库自带的 `serve_no_cache.py`（带 no-cache 头，改代码后刷新即生效）：

```bash
python serve_no_cache.py 19609
```

## 部署到 GitHub Pages

1. 把本目录推送到一个 GitHub 仓库（保持 `index.html` 在根目录）：

```bash
git init
git add .
git commit -m "TravelPlus demo"
git remote add origin https://github.com/<你的用户名>/travelplus-demo.git
git push -u origin main
```

2. 仓库 **Settings → Pages → Build and deployment → Source** 选 `Deploy from a branch`，
   分支选 `main`、目录选 `/ (root)`，保存。
3. 约 1 分钟后访问 `https://<你的用户名>.github.io/travelplus-demo/` 即可。

`.nojekyll` 已内置（跳过 Jekyll 处理，保证 JS 模块原样下发）。

## 目录结构

```
index.html            入口（注入 mock 拦截层，先于 main.js 执行）
js/mock/mock-data.js  演示数据（景点/游记/用户/订单/消息等，含真实经纬度）
js/mock/mock-install.js  fetch 拦截层：REST 应答 + SSE 流式模拟 + 内存写操作
img/*.svg             本地占位图（渐变装饰图，零外部依赖，离线可用）
js/ css/              前端业务代码（与完整版同构）
```

## 与完整版的差异

| 项 | 完整版 | 演示版 |
|---|---|---|
| 后端 | Spring Boot + MySQL/Redis/Kafka | 无（fetch 全量 Mock） |
| 数据 | 真实数据库 | 内置内存数据，刷新页面重置 |
| AI 总结/助手 | DeepSeek 流式 | 预置文案逐字推送 |
| 登录 | 真实短信/密码 | 任意输入即可进入 |
| 地图 | 高德 JS API | 高德 JS API（真实渲染） |
