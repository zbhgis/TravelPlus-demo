/**
 * 【演示版拦截层】fetch 全量 Mock——纯前端运行，无需任何后端服务
 * 实现方式：包装 window.fetch，凡命中 API 的请求一律由本地内存数据应答；
 * 非 API 请求（picsum 图片 / 高德地图 CDN）放行真实网络。
 * - REST：返回 Result{success:true, data}，统一 150ms 左右延迟模拟真实感
 * - SSE：/search/summary 与 /ai/chat 返回 ReadableStream 模拟流式输出（逐字推送）
 * - 写操作（点赞/下单/发评论/签到…）全部落地内存状态，页面刷新前一致
 * 兜底原则：未识别的 API 路由返回空数据（success），绝不抛错——保证演示页永不崩
 */
import * as D from './mock-data.js';

/* ============ 可变内存状态 ============ */
const state = {
  notes: D.NOTES.map(n => ({ ...n })),
  noteComments: Object.fromEntries(Object.entries(D.NOTE_COMMENTS).map(([k, v]) => [k, v.map(c => ({ ...c }))])),
  attractionComments: Object.fromEntries(Object.entries(D.ATTRACTION_COMMENTS).map(([k, v]) => [k, v.map(c => ({ ...c }))])),
  attractions: D.ATTRACTIONS.map(a => ({ ...a, liked: false, myRating: 0, ratingCount: Math.floor(a.checkinCount / 220) })),
  orders: D.ORDERS.map(o => ({ ...o })),
  trips: D.TRIPS.map(t => ({ ...t })),
  favorites: [],
  follows: new Set([2, 7]),
  noteLikes: new Set(),
  chatSessions: D.CHAT_SESSIONS.map(s => ({ ...s })),
  chatMessages: Object.fromEntries(Object.entries(D.CHAT_MESSAGES).map(([k, v]) => [k, v.map(m => ({ ...m }))])),
  notifications: D.NOTIFICATIONS.map(n => ({ ...n })),
  wallet: { ...D.WALLET },
  balanceRecords: D.BALANCE_RECORDS.map(r => ({ ...r })),
  pointsRecords: D.POINTS_RECORDS.map(r => ({ ...r })),
  signDays: [...D.SIGN_DAYS],
  boughtTickets: new Set(),
  checkins: [{ attractionId: 1, createTime: '2026-11-06 10:02' }],
  nextId: 9000
};

/* ============ 工具函数 ============ */
const uid = () => ++state.nextId;
const now = () => new Date().toISOString().slice(0, 16).replace('T', ' ');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ok = data => ({ success: true, data: data === undefined ? null : data });

/** 深拷贝 + 拼装用户公开信息（评论/通知列表用） */
const withUser = (item, users) => {
  const u = users.find(x => x.id === item.userId) ||
    (item.userId === 1 ? D.ME : { id: item.userId, nickName: '旅行者' + item.userId, avatar: `img/u2.svg` });
  /* icon 为评论/通知列表的头像字段名（note-detail/messages 消费端用 c.icon） */
  return { ...item, name: u.nickName, avatar: u.avatar, icon: u.avatar };
};

/** 分页：list + current → records（每页 10；页 1 也可直接返回数组，消费端两种都兼容） */
const page = (list, current = 1, size = 10) => ({
  records: list.slice((current - 1) * size, current * size),
  total: list.length
});

/** 简易中文名模糊匹配 */
const matchKw = (text, kw) => !kw || String(text || '').includes(kw);

/* ============ REST 路由表 ============ */
/** @type {Array<{m:string, re:RegExp, h:Function}>} */
const routes = [
  /* --- 用户/登录 --- */
  { m: 'POST', re: /^\/user\/login$/, h: () => 'demo-token-' + uid() },
  { m: 'POST', re: /^\/user\/register$/, h: () => 'demo-token-' + uid() },
  { m: 'POST', re: /^\/user\/code/, h: () => null },
  { m: 'POST', re: /^\/user\/logout$/, h: () => null },
  { m: 'GET', re: /^\/user\/me$/, h: () => D.ME },

  /* --- 景点 --- */
  { m: 'GET', re: /^\/attraction\/destinations$/, h: () => ['杭州', '厦门'] },
  { m: 'GET', re: /^\/attraction-type\/list$/, h: () => D.TYPES },
  {
    m: 'GET', re: /^\/attraction\/of\/destination$/, h: (p, body, q) => {
      let list = state.attractions.filter(a => q.city.split(',').some(c => a.destination === c));
      if (q.typeId) list = list.filter(a => a.typeId === Number(q.typeId));
      if (q.excludeTypeIds) list = list.filter(a => !q.excludeTypeIds.split(',').map(Number).includes(a.typeId));
      const meLoc = q.x ? { x: +q.x, y: +q.y } : { x: 120.15507, y: 30.274085 }; // 无定位默认杭州市中心
      const dist = a => Math.hypot((a.x - meLoc.x) * 111, (a.y - meLoc.y) * 96);
      const dir = (q.order === 'asc') ? 1 : -1;
      const cmp = {
        score: (a, b) => (a.avgScore - b.avgScore) * dir,
        price: (a, b) => ((a.avgPrice || 1e9) - (b.avgPrice || 1e9)) * dir,
        distance: (a, b) => (dist(a) - dist(b)) * dir
      }[q.sort || 'comprehensive'];
      if (cmp) list = [...list].sort(cmp);
      else list = [...list].sort((a, b) => b.checkinCount - a.checkinCount);
      return page(list, +q.current || 1);
    }
  },
  { m: 'GET', re: /^\/attraction\/of\/type$/, h: (p, b, q) => page(state.attractions.filter(a => !q.typeId || a.typeId === Number(q.typeId)), +q.current || 1) },
  { m: 'GET', re: /^\/attraction\/of\/name$/, h: (p, b, q) => page(state.attractions.filter(a => matchKw(a.name, q.name) || matchKw(a.destination, q.name)), +q.current || 1) },
  {
    m: 'GET', re: /^\/attraction\/(\d+)$/, h: m => {
      const a = state.attractions.find(x => x.id === +m[1]);
      if (!a) throw new Error('景点不存在');
      return { ...a, ratingCount: a.ratingCount || 100 };
    }
  },
  { m: 'PUT', re: /^\/attraction\/like\/(\d+)$/, h: m => { const a = state.attractions.find(x => x.id === +m[1]); if (a) a.liked = !a.liked; return !a.liked; } },
  { m: 'POST', re: /^\/attraction\/checkin\/(\d+)$/, h: m => { state.checkins.unshift({ attractionId: +m[1], createTime: now() }); const a = state.attractions.find(x => x.id === +m[1]); if (a) a.checkinCount++; return null; } },
  { m: 'POST', re: /^\/attraction\/rate$/, h: (p, body) => { const a = state.attractions.find(x => x.id === body.attractionId); if (a) { a.myRating = body.score; a.ratingCount++; } return null; } },

  /* --- 景点评论 --- */
  { m: 'GET', re: /^\/attraction-comment\/of\/(\d+)/, h: (m, b, q) => page((state.attractionComments[m[1]] || []).map(c => withUser(c, [...D.USERS, D.ME])), +q.current || 1) },
  { m: 'POST', re: /^\/attraction-comment$/, h: (p, body) => { const k = String(body.attractionId); (state.attractionComments[k] = state.attractionComments[k] || []).unshift({ id: uid(), userId: 1, score: 5, content: body.content, createTime: now() }); return null; } },

  /* --- 游记 --- */
  { m: 'GET', re: /^\/note\/hot/, h: (p, b, q) => page([...state.notes].sort((a, b) => b.liked - a.liked), +q.current || 1) },
  { m: 'GET', re: /^\/note\/of\/follow/, h: (p, b, q) => page(state.notes.filter(n => state.follows.has(n.userId)), +q.current || 1) },
  { m: 'GET', re: /^\/note\/of\/user/, h: (p, b, q) => page(state.notes.filter(n => n.userId === +q.id), +q.current || 1) },
  { m: 'GET', re: /^\/note\/of\/attraction\/(\d+)/, h: (m, b, q) => page(state.notes.filter(n => n.attractionId === +m[1]), +q.current || 1) },
  { m: 'GET', re: /^\/note\/likes\/(\d+)$/, h: m => { const n = state.notes.find(x => x.id === +m[1]); return (n ? [{ id: 2, nickName: '西湖漫步者', avatar: D.USERS[0].avatar }] : []); } },
  {
    m: 'GET', re: /^\/note\/(\d+)$/, h: m => {
      const n = state.notes.find(x => x.id === +m[1]);
      if (!n) throw new Error('游记不存在');
      return { ...n, likedByMe: state.noteLikes.has(n.id), commentCount: (state.noteComments[n.id] || []).length, viewCount: n.liked * 7 };
    }
  },
  { m: 'PUT', re: /^\/note\/like\/(\d+)$/, h: m => { const n = state.notes.find(x => x.id === +m[1]); if (n) { state.noteLikes.has(n.id) ? (state.noteLikes.delete(n.id), n.liked--) : (state.noteLikes.add(n.id), n.liked++); } return null; } },
  { m: 'POST', re: /^\/note$/, h: (p, body) => { const n = { id: uid(), userId: 1, title: body.title || '无标题', content: body.content || '', images: body.images || '', liked: 0, likedByMe: false, attractionId: body.attractionId || null, createTime: now() }; state.notes.unshift(n); return n.id; } },
  { m: 'PUT', re: /^\/note\/(\d+)$/, h: (m, body) => { const n = state.notes.find(x => x.id === +m[1]); if (n) Object.assign(n, body); return null; } },
  { m: 'DELETE', re: /^\/note\/(\d+)$/, h: m => { state.notes = state.notes.filter(x => x.id !== +m[1]); return null; } },

  /* --- 游记评论 --- */
  { m: 'GET', re: /^\/note-comments\/of\/(\d+)/, h: (m, b, q) => page((state.noteComments[m[1]] || []).map(c => withUser(c, [...D.USERS, D.ME])), +q.current || 1) },
  { m: 'POST', re: /^\/note-comments$/, h: (p, body) => { const k = String(body.noteId); (state.noteComments[k] = state.noteComments[k] || []).unshift({ id: uid(), userId: 1, content: body.content, createTime: now() }); return null; } },
  { m: 'PUT', re: /^\/note-comments\/top\/(\d+)$/, h: () => null },
  { m: 'DELETE', re: /^\/note-comments\/(\d+)$/, h: m => { for (const k in state.noteComments) state.noteComments[k] = state.noteComments[k].filter(c => c.id !== +m[1]); return null; } },

  /* --- 搜索 --- */
  { m: 'GET', re: /^\/search\/hot$/, h: () => D.HOT_KEYWORDS },
  { m: 'GET', re: /^\/search\/suggest/, h: (p, b, q) => [...new Set([...state.attractions.filter(a => matchKw(a.name, q.keyword)).map(a => a.name), ...state.notes.filter(n => matchKw(n.title, q.keyword)).map(n => n.title.slice(0, 12))])].slice(0, 8) },
  {
    m: 'GET', re: /^\/search\?|\/search$/, h: (p, b, q) => {
      const kw = q.keyword || '';
      return {
        attractions: state.attractions.filter(a => matchKw(a.name, kw) || matchKw(a.destination, kw) || matchKw(a.description, kw)).slice(0, 10),
        notes: state.notes.filter(n => matchKw(n.title, kw) || matchKw(n.content, kw)).slice(0, 10),
        users: D.USERS.filter(u => matchKw(u.nickName, kw)).slice(0, 5)
      };
    }
  },
  { m: 'POST', re: /^\/search\/summary\/feedback/, h: () => ({ recorded: true }) },
  { m: 'POST', re: /^\/search\/summary\/feedback\/cancel$/, h: () => null },

  /* --- 门票/订单 --- */
  { m: 'GET', re: /^\/ticket\/list\/(\d+)$/, h: m => D.TICKETS.filter(t => t.attractionId === +m[1]) },
  {
    m: 'POST', re: /^\/ticket-order\/seckill\/(\d+)$/, h: m => {
      const tid = +m[1];
      if (state.boughtTickets.has(tid)) throw new Error('重复下单：你已购买过该票（一人一单）');
      const t = D.TICKETS.find(x => x.id === tid);
      if (!t) throw new Error('门票不存在');
      const sk = D.SECKILL_TICKETS.find(s => s.ticketId === tid);
      if (sk && sk.stock <= 0) throw new Error('库存不足');
      state.boughtTickets.add(tid);
      if (sk) sk.stock--;
      const order = { id: String(660496237035782000n + BigInt(uid())), userId: 1, ticketId: tid, ticketName: t.title, ticketPrice: t.payValue, payType: 1, status: 1, createTime: now() };
      state.orders.unshift(order);
      return order.id;
    }
  },
  { m: 'GET', re: /^\/ticket-order\/list/, h: (p, b, q) => page(state.orders.filter(o => !q.status || o.status === +q.status), +q.current || 1) },
  {
    m: 'GET', re: /^\/ticket-order\/(\d+)$/, h: m => {
      const o = state.orders.find(x => x.id === m[1] || x.id === +m[1]);
      if (!o) throw new Error('订单不存在');
      const t = D.TICKETS.find(x => x.id === o.ticketId);
      const a = t ? state.attractions.find(x => x.id === t.attractionId) : null;
      return { ...o, rules: t ? t.rules : '凭二维码核销', attractionName: a ? a.name : '' };
    }
  },
  { m: 'POST', re: /^\/ticket-order\/pay\/(\d+)$/, h: m => { const o = state.orders.find(x => x.id === m[1] || x.id === +m[1]); if (o) { o.status = 2; o.payTime = now(); state.wallet.balance -= o.ticketPrice; state.balanceRecords.unshift({ id: uid(), type: 'pay', title: o.ticketName, amount: -o.ticketPrice, createTime: now() }); state.pointsRecords.unshift({ id: uid(), type: 'order', title: '下单奖励', amount: Math.floor(o.ticketPrice / 100), createTime: now() }); } return { paid: true }; } },

  /* --- 钱包/积分/签到 --- */
  { m: 'GET', re: /^\/user\/wallet$/, h: () => state.wallet },
  { m: 'GET', re: /^\/user\/balance\/records/, h: (p, b, q) => page(state.balanceRecords, +q.current || 1, 15) },
  { m: 'GET', re: /^\/user\/points\/records/, h: (p, b, q) => page(state.pointsRecords, +q.current || 1, 15) },
  { m: 'POST', re: /^\/user\/recharge$/, h: (p, body) => { state.wallet.balance += (body.amount || 0); state.balanceRecords.unshift({ id: uid(), type: 'recharge', title: '余额充值', amount: body.amount || 0, createTime: now() }); return { paid: true }; } },
  { m: 'GET', re: /^\/user\/sign\/count$/, h: () => state.signDays.length },
  { m: 'GET', re: /^\/user\/sign\/list$/, h: (p, b, q) => { if (q.month) return state.signDays.filter(d => d.startsWith(q.month)); return state.signDays; } },
  { m: 'POST', re: /^\/user\/sign$/, h: () => { const d = now().slice(0, 10); if (!state.signDays.includes(d)) { state.signDays.push(d); state.wallet.points += 5; state.pointsRecords.unshift({ id: uid(), type: 'sign', title: '每日签到', amount: 5, createTime: now() }); } return null; } },

  /* --- 用户主页/资料 --- */
  {
    m: 'GET', re: /^\/user\/home\/(\d+)$/, h: m => {
      const id = +m[1];
      const user = id === 1 ? D.ME : D.USERS.find(u => u.id === id) || { id, nickName: '旅行者' + id, avatar: `img/u2.svg`, signature: '' };
      const myNotes = state.notes.filter(n => n.userId === id);
      return {
        user,
        info: { id: user.id, phone: '138****0000' },
        fans: id === 1 ? 36 : 12 + id * 7,
        followee: id === 1 ? 8 : 5 + id,
        likedCount: myNotes.reduce((s, n) => s + n.liked, 0),
        followed: state.follows.has(id) || id === 1
      };
    }
  },
  { m: 'GET', re: /^\/user\/info\/(\d+)$/, h: m => { const user = +m[1] === 1 ? D.ME : (D.USERS.find(u => u.id === +m[1]) || D.ME); return { id: user.id, nickName: user.nickName, avatar: user.avatar, signature: user.signature, phone: user.phone || '13800000000' }; } },
  { m: 'PUT', re: /^\/user\/info$/, h: () => null },
  { m: 'GET', re: /^\/user\/browse\/list$/, h: () => D.BROWSE_RECORDS.map(b => ({ ...b, attraction: state.attractions.find(a => a.id === b.attractionId) })) },
  { m: 'GET', re: /^\/user\/liked-notes\/(\d+)$/, h: () => state.notes.filter(n => state.noteLikes.has(n.id)) },
  { m: 'GET', re: /^\/user\/liked-attractions\/(\d+)$/, h: () => state.attractions.filter(a => a.liked) },
  { m: 'GET', re: /^\/user\/checkins\/(\d+)/, h: (p, b, q) => page(state.checkins.map(c => ({ ...c, attraction: state.attractions.find(a => a.id === c.attractionId) })), +q.current || 1) },
  { m: 'GET', re: /^\/user\/comments\/(\d+)/, h: () => [] },

  /* --- 关注 --- */
  { m: 'GET', re: /^\/follow\/list\/(\d+)/, h: (m, b, q) => { const ids = q.type === 'fans' ? [3, 4, 9] : [...state.follows]; return page(ids.map(id => D.USERS.find(u => u.id === id)).filter(Boolean)); } },
  { m: 'GET', re: /^\/follow\/or\/not\/(\d+)$/, h: m => state.follows.has(+m[1]) },
  { m: 'PUT', re: /^\/follow\/(\d+)\/(\d+)$/, h: m => { +m[2] === 1 ? state.follows.add(+m[1]) : state.follows.delete(+m[1]); return null; } },

  /* --- 收藏 --- */
  { m: 'GET', re: /^\/favorite\/list/, h: (p, b, q) => { let list = state.favorites; if (q.type) list = list.filter(f => f.targetType === q.type); return page(list, +q.current || 1); } },
  { m: 'POST', re: /^\/favorite$/, h: (p, body) => { const ex = state.favorites.find(f => f.targetType === body.targetType && f.targetId === body.targetId); if (ex) return null; const f = { id: uid(), userId: 1, targetType: body.targetType, targetId: body.targetId, createTime: now() }; if (body.targetType === 'attraction') { const a = state.attractions.find(x => x.id === body.targetId); Object.assign(f, { title: a.name, image: a.images.split(',')[0], destination: a.destination, avgScore: a.avgScore }); } else { const n = state.notes.find(x => x.id === body.targetId); Object.assign(f, { title: n.title, image: (n.images || '').split(',')[0], nickName: '演示旅行家' }); } state.favorites.unshift(f); return null; } },
  { m: 'DELETE', re: /^\/favorite\/(attraction|note)\/(\d+)$/, h: m => { state.favorites = state.favorites.filter(f => !(f.targetType === m[1] && f.targetId === +m[2])); return null; } },

  /* --- 私信 --- */
  { m: 'GET', re: /^\/chat\/sessions$/, h: () => state.chatSessions.map(s => { const peer = D.USERS.find(u => u.id === s.peerId); return { ...s, peer: peer ? { ...peer, icon: peer.avatar } : null, icon: peer ? peer.avatar : 'img/u2.svg' }; }) },
  { m: 'GET', re: /^\/chat\/list/, h: (p, b, q) => page(state.chatMessages[q.peerId] || [], +q.current || 1) },
  { m: 'GET', re: /^\/chat\/mutual-status/, h: () => ({ mutual: true }) },
  {
    m: 'POST', re: /^\/chat\/send$/, h: (p, body) => {
      const k = String(body.toUserId);
      (state.chatMessages[k] = state.chatMessages[k] || []).push({ id: uid(), fromUserId: 1, content: body.content, createTime: now() });
      const peer = D.USERS.find(u => u.id === +k);
      const reply = { id: uid(), fromUserId: +k, content: peer ? `收到～我晚点看下「${body.content.slice(0, 12)}」😄` : '好的！', createTime: now() };
      setTimeout(() => { (state.chatMessages[k] = state.chatMessages[k] || []).push(reply); const s = state.chatSessions.find(x => x.peerId === +k); if (s) { s.lastMessage = reply.content; s.lastTime = now(); } }, 1200);
      return null;
    }
  },
  { m: 'PUT', re: /^\/chat\/pin\/(\d+)$/, h: m => { const s = state.chatSessions.find(x => x.peerId === +m[1]); if (s) s.pinned = true; return null; } },
  { m: 'DELETE', re: /^\/chat\/pin\/(\d+)$/, h: m => { const s = state.chatSessions.find(x => x.peerId === +m[1]); if (s) s.pinned = false; return null; } },
  { m: 'DELETE', re: /^\/chat\/session\/(\d+)$/, h: m => { state.chatSessions = state.chatSessions.filter(s => s.peerId !== +m[1]); delete state.chatMessages[m[1]]; return null; } },

  /* --- 通知 --- */
  { m: 'GET', re: /^\/notify\/list/, h: (p, b, q) => page(state.notifications.filter(n => !q.category || n.category === q.category).map(n => withUser(n, [...D.USERS, D.ME])), +q.current || 1) },
  { m: 'GET', re: /^\/notify\/category-unread-count$/, h: () => ({ likes: 1, follows: 1, comments: 1 }) },
  { m: 'PUT', re: /^\/notify\/read$/, h: () => null },

  /* --- 旅行计划 --- */
  { m: 'GET', re: /^\/trip\/list/, h: () => state.trips },
  { m: 'GET', re: /^\/trip\/(\d+)$/, h: m => state.trips.find(t => t.id === +m[1]) || (() => { throw new Error('计划不存在'); })() },
  { m: 'POST', re: /^\/trip$/, h: (p, body) => { const t = { id: uid(), userId: 1, title: body.title || '新计划', destination: body.destination || '', startDate: body.startDate || '', days: body.days || [], status: 1 }; state.trips.unshift(t); return t.id; } },
  { m: 'DELETE', re: /^\/trip\/(\d+)$/, h: m => { state.trips = state.trips.filter(t => t.id !== +m[1]); return null; } },

  /* --- 地图 --- */
  { m: 'GET', re: /^\/map\/points$/, h: () => state.attractions.map(a => ({ id: a.id, name: a.name, x: a.x, y: a.y, avgScore: a.avgScore })) },

  /* --- 上传（FormData → 返回 picsum 文件名） --- */
  { m: 'POST', re: /^\/upload\/note$/, h: () => `img/up.svg` },
  { m: 'POST', re: /^\/upload\/user$/, h: () => `img/av.svg` },
  { m: 'GET', re: /^\/upload\/note\/delete/, h: () => null },

  /* --- 客服 --- */
  { m: 'GET', re: /^\/support\/status$/, h: () => ({ aiMode: true, humanMode: false }) },
  { m: 'POST', re: /^\/support\/handoff$/, h: () => null },
  { m: 'POST', re: /^\/support\/resume$/, h: () => null },
  { m: 'POST', re: /^\/support\/feedback$/, h: () => ({ recorded: true }) },
  { m: 'DELETE', re: /^\/support\/feedback/, h: () => null },
  { m: 'GET', re: /^\/support\/admin\/me$/, h: () => ({ admin: false }) },

  /* --- AI 助手（/ai/chat 与 /search/summary 在上方 SSE 分支单独处理） --- */
  { m: 'GET', re: /^\/ai\/history$/, h: () => [] },
  { m: 'POST', re: /^\/ai\/followups$/, h: () => ['杭州两天怎么安排？', '带爸妈去哪里玩轻松？', '帮我订西湖的秒杀票'] }
];

/* ============ SSE 模拟 ============ */
/** 构造 SSE Response：events 数组逐个按延时推送（data: JSON\n\n） */
function sseResponse(events) {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      for (const ev of events) {
        if (ev.delay) await sleep(ev.delay);
        if (ev.raw === 'DONE') { controller.enqueue(enc.encode('data: [DONE]\n\n')); continue; }
        controller.enqueue(enc.encode('data: ' + JSON.stringify(ev.data) + '\n\n'));
      }
      controller.close();
    }
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
}

/** 文本 → 逐字 delta 事件序列（每片 6 字，间隔 28ms 模拟打字机） */
function deltaEvents(text) {
  const out = [];
  for (let i = 0; i < text.length; i += 6) {
    out.push({ data: { delta: text.slice(i, i + 6) }, delay: 24 });
  }
  return out;
}

const SUMMARY_TEMPLATES = {
  西湖: '想来杭州玩，西湖一定是首选！**西湖风景名胜区**评分 4.6，环湖免费开放[1]，苏堤春晓、断桥残雪等十景串联，四时风光不同。游记里推荐从断桥进白堤走到孤山，再沿苏堤南下接花港观鱼，全程不走回头路，出片机位密集[2]。**灵隐寺**（4.6 分）清晨 6 点半体验最佳，香火混着山雾禅意十足[3]。预算参考：游船 ¥55 起，雷峰塔登塔 ¥40，一天人均 200 可以玩得很舒服。',
  厦门: '厦门的关键词是「海边慢生活」。**鼓浪屿**评分 4.7，万国建筑与琴声小岛，游记建议赶早上 7 点的船、走笔山路一侧避开人流[1]。**厦门园林植物园**的多肉区与雨林喷雾是出片顶流（门票 ¥30）[2]。**沙坡尾**日落时分避风坞渔船配晚霞最好看，拍完直接在大学路吃海蛎煎[3]。住宿推荐中山路附近，三天两晚人均 800 舒服够用。'
};
const SUMMARY_FALLBACK = kw => `关于「${kw}」，平台收录了不少相关内容。**热门景点**以杭州西湖（4.6 分，免费开放）和厦门鼓浪屿（4.7 分）为代表，适合慢节奏 citywalk[1]。**游记攻略**里高频出现的关键词是「不走回头路」「避开人流」「出片机位」——路线规划上尽量把同片区景点安排在同一天[2]。**预算参考**：不含大交通，杭州/厦门两天人均 500-800 可以玩得比较从容。下滑可查看全部结果，或点击「换一换」重新生成。`;

const SUMMARY_SOURCES = kw => [
  { index: 1, type: 'attraction', id: 1, title: kw.includes('厦门') ? '鼓浪屿' : '西湖风景名胜区', subtitle: '4.6 分 · 免费' },
  { index: 2, type: 'note', id: 101, title: '杭州一日游不走回头路！亲测这条路线绝了', subtitle: '1280 赞' },
  { index: 3, type: 'note', id: 104, title: '鼓浪屿避开人流的正确姿势', subtitle: '1560 赞' }
];

function summarySse(keyword) {
  const kw = decodeURIComponent(keyword || '');
  const text = SUMMARY_TEMPLATES[kw.includes('西湖') || kw.includes('杭州') ? '西湖' : kw.includes('厦门') || kw.includes('鼓浪屿') ? '厦门' : ''] || SUMMARY_FALLBACK(kw);
  const sources = SUMMARY_SOURCES(kw);
  const suggestions = kw.includes('厦门') ? ['鼓浪屿船票怎么买', '厦门三天怎么排', '雨天备选有哪些'] : ['西湖一日游怎么安排', '有哪些免费景点', '下雨天可以去哪玩'];
  return sseResponse([
    { data: { meta: { cached: false, degraded: false, runId: 'demo' } } },
    { data: { sources }, delay: 120 },
    ...deltaEvents(text),
    { data: { summaryDone: { cached: false } }, delay: 100 },
    { data: { suggestions }, delay: 200 },
    { raw: 'DONE' }
  ]);
}

/** AI 购票意图：从消息解析「买/订票」→ 复用秒杀下单逻辑 → 回复订单结果 */
function parseTicketIntent(msg) {
  if (!/(买|订|下单|购买)/.test(msg) || !/(票|门票)/.test(msg)) return null;
  const wantXiamen = /厦门|鼓浪屿|植物园/.test(msg);
  const ticket = wantXiamen ? null : D.TICKETS.find(t => t.id === 10);
  if (!ticket) return { ticket: null };
  return { ticket };
}

function aiChatSse(message) {
  const msg = message || '';
  const intent = parseTicketIntent(msg);
  if (intent && intent.ticket) {
    const t = intent.ticket;
    const sk = D.SECKILL_TICKETS.find(s => s.ticketId === t.id);
    let reply;
    if (state.boughtTickets.has(t.id)) {
      reply = `你已经买过「${t.title}」啦（一人一单），订单在「我的-订单」里可以查看和支付。要看看其他门票吗？`;
    } else if (sk && sk.stock <= 0) {
      reply = `抱歉，「${t.title}」刚刚被抢完了（库存不足），可以过一会儿再来看看～`;
    } else {
      state.boughtTickets.add(t.id);
      if (sk) sk.stock--;
      const order = { id: String(660496237035782000n + BigInt(uid())), userId: 1, ticketId: t.id, ticketName: t.title, ticketPrice: t.payValue, payType: 1, status: 1, createTime: now() };
      state.orders.unshift(order);
      reply = `下单成功 🎉\n\n- 票名：${t.title}\n- 金额：¥${(t.payValue / 100).toFixed(2)}\n- 订单号：${order.id}\n- 状态：待支付\n\n请尽快前往「我的-订单」完成支付，逾期订单会自动取消。支付后可在秒杀券页查看核销二维码～`;
    }
    return sseResponse([
      { data: { meta: { runId: 'demo-run', sessionId: 'd3m0-5e5510n-uuid-000000000001' } } },
      { data: { thinking: true }, delay: 200 },
      { data: { tool: { name: 'create_ticket_order', label: '正在为你创建订单…', status: 'running' } }, delay: 150 },
      { data: { tool: { name: 'create_ticket_order', label: '正在为你创建订单…', status: 'done', ms: 280 } }, delay: 300 },
      ...deltaEvents(reply),
      { raw: 'DONE' }
    ]);
  }
  const hit = D.AI_ANSWERS.find(a => a.keywords.some(k => msg.includes(k)));
  const text = hit ? hit.text : D.AI_FALLBACK;
  const tool = hit ? hit.tool : 'search_attractions';
  return sseResponse([
    { data: { meta: { runId: 'demo-run', sessionId: 'd3m0-5e5510n-uuid-000000000001' } } },
    { data: { thinking: true }, delay: 200 },
    { data: { tool: { name: tool, label: '正在搜索平台景点…', status: 'running' } }, delay: 150 },
    { data: { tool: { name: tool, label: '正在搜索平台景点…', status: 'done', ms: 320 } }, delay: 350 },
    ...deltaEvents(text),
    { raw: 'DONE' }
  ]);
}

/* ============ fetch 拦截主逻辑 ============ */
const API_PREFIX = 'http://localhost:8081';

const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : (input && input.url) || '';
  const isApi = url.startsWith(API_PREFIX);
  if (!isApi) return realFetch(input, init);

  const u = new URL(url);
  const path = u.pathname;
  const query = Object.fromEntries(u.searchParams.entries());
  const method = ((init && init.method) || 'GET').toUpperCase();

  /* SSE 流式接口 */
  if (path === '/search/summary') {
    let body = {};
    try { body = JSON.parse(init.body || '{}'); } catch { /* ignore */ }
    await sleep(200);
    return summarySse(body.keyword || '');
  }
  if (path === '/ai/chat') {
    let body = {};
    try { body = JSON.parse(init.body || '{}'); } catch { /* ignore */ }
    await sleep(150);
    return aiChatSse(body.message || '');
  }

  /* REST 路由匹配 */
  const route = routes.find(r => r.m === method && r.re.test(path));
  await sleep(120 + Math.random() * 160);
  if (!route) {
    /* 兜底：未识别路由返回空成功——演示页永不崩 */
    return new Response(JSON.stringify(ok(Array.isArray(query.current) ? [] : null)), { headers: { 'Content-Type': 'application/json' } });
  }
  const m = path.match(route.re);
  let body = {};
  if (init && init.body) {
    body = init.body instanceof FormData ? {} : (() => { try { return JSON.parse(init.body); } catch { return {}; } })();
  }
  try {
    const data = route.h(m, body, query);
    return new Response(JSON.stringify(ok(data)), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, errorMsg: e.message || '操作失败' }), { headers: { 'Content-Type': 'application/json' } });
  }
};

/* 演示标识（控制台可辨识 mock 已注入） */
console.log('%c[TravelPlus Demo]%c 已注入模拟数据层 · 纯前端演示，无需后端', 'color:#0E9F8A;font-weight:bold', 'color:#999');
