/**
 * 【全局搜索的实现】#/search 全局搜索页渲染模块
 * 职责：搜索框（自动聚焦）+ 热门词条（未输入时）+ 输入联想（300ms 防抖）+ 三类结果 tab（景点/游记/用户）
 * 依赖：api.js (get)、ui.js (imgUrl/imgError/scoreDisplay/fenToYuan/showLoading/showEmpty/loadMore/toast/getUrlParam/formatDate)
 * 核心链路：
 *   renderSearch(container)
 *     → 读取 getUrlParam('q') 决定初始关键词
 *     → 渲染搜索框（自动聚焦）+ 取消/返回按钮
 *     → 未输入：GET /search/hot → 热门词条 chips（点击=提交搜索）
 *     → 输入中（300ms 防抖）：GET /search/suggest?keyword= → 联想列表（点击填框+搜索）
 *     → 提交/点击词条后：GET /search?keyword=&current= → 三类 tab 结果
 *       - 景点卡片：图/名/评分/免费或¥X起
 *       - 游记卡片：图/标题/作者
 *       - 用户行：头像/昵称
 *       - 空态"未找到相关结果"
 *
 * 设计决策：
 *   - 热门词条和输入联想互斥：有输入时显示联想，无输入时显示热门词条
 *   - 防抖 300ms：避免每次按键都请求
 *   - 三类 tab 页面内切换（不依赖子路由），各 tab 独立分页
 *   - 结果为空显示空态，不显示 tab 栏（待输入时也不显示）
 */
import { get, post } from '../api.js';
import { API_BASE } from '../config.js';
import { getToken } from '../store.js';
import { renderMd } from '../markdown.js';
import { imgUrl, imgError, scoreDisplay, fenToYuan, showLoading, showEmpty, toast, getUrlParam, formatDate } from '../ui.js';

/** 【全局搜索的实现】防抖工具函数
 *  - 返回 debounced 版本函数，延迟 ms 毫秒执行
 *  - 连续调用时取消前一次 setTimeout
 */
function debounce(fn, ms) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

/** 【全局搜索的实现】XSS 防护 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

/** 【全局搜索的实现】搜索页分页观察器（自循环版 loadMore）
 * - 修复：ui.js 的 loadMore 触发一次后不再重新注册（unobserve），tab 切换重建列表后新 sentinel 无人观察，
 *   导致"加载更多"失效；本 helper 在每次 loader 完成后重新观察当前 sentinel，直到 sentinel 被移除（无更多数据）
 * - loader 返回 Promise；无更多数据时 loader 内部移除 sentinel → 重入时 querySelector 为空 → 自然终止
 */
function observeSentinel(listEl, sentinelClass, loader) {
  const sentinel = listEl ? listEl.querySelector('.' + sentinelClass) : null;
  if (!sentinel) return;
  const ob = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      ob.disconnect();
      Promise.resolve(loader()).finally(() => observeSentinel(listEl, sentinelClass, loader));
    }
  }, { rootMargin: '100px' });
  ob.observe(sentinel);
}

/** 【全局搜索的实现】搜索模块级状态 */
let searchMode = false;      // 是否已提交搜索（true=显示结果，false=显示热门词条/联想）
let activeTab = 'attraction'; // 当前结果 tab：attraction | note | user
let tabPages = {};           // 各 tab 分页游标 { attraction: 1, note: 1, user: 1 }
let tabHasMore = {};         // 各 tab 是否有更多 { attraction: true, note: true, user: true }
let searchKeyword = '';      // 当前搜索关键词
let debounceTimer = null;    // 防抖计时器
/** 【AI搜索总结的实现】总结请求状态：controller 用于取消旧请求，seq 保证只应用最新一次流式结果 */
let summaryAbort = null;
let summarySeq = 0;

export async function renderSearch(container) {
  const initialQ = getUrlParam('q') || '';
  searchKeyword = initialQ;
  searchMode = !!initialQ;
  activeTab = 'attraction';
  tabPages = { attraction: 1, note: 1, user: 1 };
  tabHasMore = { attraction: true, note: true, user: true };

  container.innerHTML = `
    <div id="search-root">
      <div class="search-header">
        <div class="search-input-wrap">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <input type="text" id="search-input" class="search-input" placeholder="搜索景点、游记、用户..." value="${escapeHtml(initialQ)}" autocomplete="off"/>
          <button class="search-clear-btn" id="search-clear-btn" style="display:${initialQ ? 'flex' : 'none'}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <button class="search-cancel-btn" id="search-cancel-btn">取消</button>
      </div>
      <div id="search-body"></div>
    </div>
  `;

  const root = container.querySelector('#search-root');
  const searchInput = root.querySelector('#search-input');
  const searchBody = root.querySelector('#search-body');
  const clearBtn = root.querySelector('#search-clear-btn');
  const cancelBtn = root.querySelector('#search-cancel-btn');

  // 取消按钮 → 返回上一页
  cancelBtn.addEventListener('click', () => window.history.back());

  // 清除按钮
  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    searchKeyword = '';
    searchMode = false;
    clearBtn.style.display = 'none';
    abortSummary();
    loadHotKeywords(searchBody);
  });

  // 自动聚焦
  setTimeout(() => searchInput.focus(), 100);

  /** 【全局搜索的实现】提交搜索
   * - 设置 searchMode=true → 加载搜索结果显示
   * - 关键词变更时重置 tab 分页游标
   */
  async function submitSearch(keyword) {
    if (!keyword || !keyword.trim()) return;
    const kw = keyword.trim();
    if (kw !== searchKeyword) {
      searchKeyword = kw;
      // 重置分页
      tabPages = { attraction: 1, note: 1, user: 1 };
      tabHasMore = { attraction: true, note: true, user: true };
      activeTab = 'attraction';
    }
    searchMode = true;
    searchInput.value = kw;
    clearBtn.style.display = 'flex';
    await loadSearchResults(searchBody, kw);
  }

  /** 【全局搜索的实现】输入防抖联想（300ms）
   * - 有输入 → 显示联想列表 + 清空按钮
   * - 无输入 → 显示热门词条
   */
  const debouncedSuggest = debounce(async (kw) => {
    if (!kw || !kw.trim()) {
      searchMode = false;
      clearBtn.style.display = 'none';
      abortSummary();
      loadHotKeywords(searchBody);
      return;
    }
    searchMode = false; // 联想阶段不是搜索结果模式
    clearBtn.style.display = 'flex';
    abortSummary();
    await loadSuggestions(searchBody, kw.trim());
  }, 300);

  searchInput.addEventListener('input', (e) => {
    const val = e.target.value;
    debouncedSuggest(val);
  });

  // 回车提交
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const val = searchInput.value.trim();
      if (val) submitSearch(val);
    }
  });

  // 初始状态：有初始 keyword → 直接搜索；否则显示热门词条
  if (initialQ) {
    await submitSearch(initialQ);
  } else {
    await loadHotKeywords(searchBody);
  }

  /* 【AI搜索总结的实现】路由离开时取消未完成的总结流：避免异步回调继续操作已销毁的 DOM */
  return () => {
    abortSummary();
  };
}

/**
 * 【全局搜索的实现】加载热门词条
 * - GET /search/hot → 热门关键词数组
 * - 渲染为 chips（横向 flex-wrap 排列），点击 chip → submitSearch
 * - 失败静默（不显示）
 */
async function loadHotKeywords(container) {
  try {
    const hotList = await get('/search/hot');
    const list = Array.isArray(hotList) ? hotList : [];
    if (!list.length) {
      container.innerHTML = '<div class="search-hot-wrap"><div class="search-hot-title">热门搜索</div><div class="search-hot-empty">暂无热门词条</div></div>';
      return;
    }
    let html = '<div class="search-hot-wrap"><div class="search-hot-title">热门搜索</div><div class="search-hot-chips">';
    list.forEach(item => {
      const word = typeof item === 'string' ? item : (item.word || item.keyword || item.name || '');
      if (word) {
        html += '<span class="search-hot-chip" data-word="' + escapeHtml(word) + '">' + escapeHtml(word) + '</span>';
      }
    });
    html += '</div></div>';
    container.innerHTML = html;

    // 绑定 chip 点击 → 搜索
    container.querySelectorAll('.search-hot-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const word = chip.dataset.word;
        if (word) {
          const searchInput = document.getElementById('search-input');
          if (searchInput) searchInput.value = word;
          submitSearchFromChip(word);
        }
      });
    });
  } catch {
    // 热门词条失败静默
    container.innerHTML = '';
  }
}

/** 【全局搜索的实现】chip 点击提交（需要访问 submitSearch 闭包内的函数）
 * - 通过自定义事件委托给 search-root 处理
 */
function submitSearchFromChip(keyword) {
  const root = document.getElementById('search-root');
  if (!root) return;
  const input = root.querySelector('#search-input');
  if (input) input.value = keyword;
  const clearBtn = root.querySelector('#search-clear-btn');
  if (clearBtn) clearBtn.style.display = 'flex';
  // 直接调用 loadSearchResults on searchBody
  const body = root.querySelector('#search-body');
  if (body) {
    searchKeyword = keyword;
    searchMode = true;
    tabPages = { attraction: 1, note: 1, user: 1 };
    tabHasMore = { attraction: true, note: true, user: true };
    activeTab = 'attraction';
    loadSearchResults(body, keyword);
  }
}

/**
 * 【全局搜索的实现】加载输入联想
 * - GET /search/suggest?keyword= → 联想词列表
 * - 渲染为列表，点击 → 填搜索框 + 提交搜索
 */
async function loadSuggestions(container, keyword) {
  try {
    const data = await get('/search/suggest?keyword=' + encodeURIComponent(keyword));
    const list = Array.isArray(data) ? data : [];
    if (!list.length) {
      container.innerHTML = '';
      return;
    }
    let html = '<div class="search-suggest-list">';
    list.forEach(item => {
      const word = typeof item === 'string' ? item : (item.word || item.keyword || item.name || '');
      if (word) {
        html +=
          '<div class="search-suggest-item" data-word="' + escapeHtml(word) + '">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>' +
            '<span>' + escapeHtml(word) + '</span>' +
          '</div>';
      }
    });
    html += '</div>';
    container.innerHTML = html;

    // 绑定联想项点击
    container.querySelectorAll('.search-suggest-item').forEach(item => {
      item.addEventListener('click', () => {
        const word = item.dataset.word;
        if (word) submitSearchFromChip(word);
      });
    });
  } catch {
    container.innerHTML = '';
  }
}

/**
 * 【全局搜索的实现】加载搜索结果 — 三类 tab 切换
 * - 渲染 tab 栏 + 内容区
 * - GET /search?keyword=&current= 获取当前 tab 数据
 */
async function loadSearchResults(container, keyword) {
  /* 【AI搜索总结的实现】新搜索先取消上一次总结流，避免旧关键词的总结串到新结果页 */
  abortSummary();
  showLoading(container);
  try {
    const data = await get('/search?keyword=' + encodeURIComponent(keyword) + '&current=1');
    // 后端返回 { attractions: [], notes: [], users: [] } 或数组
    const attractions = (data && data.attractions) ? data.attractions : [];
    const notes = (data && data.notes) ? data.notes : [];
    const users = (data && data.users) ? data.users : [];

    // 判断各 tab 是否有更多数据
    tabHasMore.attraction = attractions.length >= 10;
    tabHasMore.note = notes.length >= 10;
    tabHasMore.user = users.length >= 10;

    /* 【AI搜索总结的实现】景点/游记有内容时预留总结卡片（仅用户结果没有可总结的资料，不展示卡片）；
       三个结果 tab 提到最上方（搜索栏正下方），AI 总结卡片置于 tab 行之下 */
    const summaryHtml = (attractions.length + notes.length) > 0 ? '<div id="search-ai-summary"></div>' : '';

    container.innerHTML = `
      <div class="search-result-tabs" id="search-result-tabs">
        <div class="search-result-tab${activeTab === 'attraction' ? ' active' : ''}" data-tab="attraction">景点<span class="search-tab-count">${attractions.length}</span></div>
        <div class="search-result-tab${activeTab === 'note' ? ' active' : ''}" data-tab="note">游记<span class="search-tab-count">${notes.length}</span></div>
        <div class="search-result-tab${activeTab === 'user' ? ' active' : ''}" data-tab="user">用户<span class="search-tab-count">${users.length}</span></div>
      </div>
      ${summaryHtml}
      <div id="search-result-content"></div>
    `;

    const resultContent = container.querySelector('#search-result-content');

    // 绑定 tab 切换
    container.querySelectorAll('#search-result-tabs .search-result-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const newTab = tab.dataset.tab;
        if (newTab === activeTab) return;
        activeTab = newTab;
        // 更新 tab 选中态
        container.querySelectorAll('#search-result-tabs .search-result-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        // 切换内容
        renderTabContent(resultContent, keyword, { attractions, notes, users });
      });
    });

    // 渲染默认 tab 内容
    renderTabContent(resultContent, keyword, { attractions, notes, users });

    /* 【AI搜索总结的实现】并行请求 AI 总结：流式渲染在结果最上方，失败静默隐藏卡片 */
    const summaryEl = container.querySelector('#search-ai-summary');
    if (summaryEl) streamAiSummary(summaryEl, keyword);

  } catch {
    showEmpty(container, '搜索失败');
  }
}

/* === 【AI搜索总结的实现】结果顶部 AI 总结：小红书式流式总结卡片 ===
 * 链路：POST /search/summary（SSE）
 *   事件：{meta:{cached}} / {sources:[...]} / {delta:"..."} / {summaryDone:{cached}} /
 *         {suggestions:[...]} / {error:{...}} / {done:true}
 * 能力：流式正文 + [n] 引用角标 + 参考来源 + 继续问 + 正负反馈 + 换一换 + 长文折叠
 * 约束：
 * - 每次搜索/输入联想/清空/路由离开都 abort 旧请求，seq 保证只应用最新一次流；
 * - 异步回调先判 el.isConnected，页面已切换则不操作 DOM（防内存/渲染泄漏）；
 * - 限流/熔断/网络失败全部静默隐藏卡片，不影响下方正常搜索结果浏览。
 */
const SUMMARY_DOWN_REASONS = ['内容不准确', '与搜索无关', '信息过时'];
const SUMMARY_THUMB_UP = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/></svg>';
const SUMMARY_THUMB_DOWN = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"/></svg>';

function abortSummary() {
  summarySeq++;
  if (summaryAbort) {
    try { summaryAbort.abort(); } catch { /* 已结束请求忽略 */ }
    summaryAbort = null;
  }
}

/** 【AI搜索总结的实现】卡片骨架：一次性构建全部区块，后续只增量更新分区
 *  （避免整卡重建导致长文折叠状态、反馈状态丢失）
 *  小红书式折叠：卡片默认 .collapsed（正文 3 行截断 + 隐藏来源/追问/反馈），右上角「展开」切换 */
function summaryCardHtml() {
  return `
    <div class="search-ai-wrap">
      <div class="search-ai-card collapsed">
        <div class="search-ai-head">
          <span class="search-ai-badge">AI</span>
          <span class="search-ai-title">AI 总结</span>
          <span class="search-ai-tag">生成中…</span>
          <button type="button" class="search-ai-toggle" hidden><span>展开</span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></button>
          <button type="button" class="search-ai-refresh" title="换一换" aria-label="重新生成">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/></svg>
          </button>
        </div>
        <div class="search-ai-text">
          <div class="search-ai-skeleton"><span></span><span></span><span></span></div>
        </div>
        <button type="button" class="search-ai-expand" hidden>展开全文</button>
        <div class="search-ai-sources" hidden></div>
        <div class="search-ai-suggest" hidden></div>
        <div class="search-ai-feedback" hidden></div>
        <div class="search-ai-foot" hidden>
          <span class="search-ai-foot-text">内容由 AI 生成，仅供参考</span>
          <button type="button" class="search-ai-ask">问旅游助手<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg></button>
        </div>
      </div>
    </div>`;
}

/** 【AI搜索总结的实现】正文渲染：Markdown 渲染后把 [n] 引用编号变成可点击角标（仅数字，安全） */
function renderSummaryBody(text) {
  return renderMd(text).replace(/\[(\d{1,2})\]/g, '<sup class="search-ai-cite" data-index="$1">$1</sup>');
}

/** 【AI搜索总结的实现】参考来源：编号 + 标题 + 副标题（点击直达景点/游记详情） */
function fillSummarySources(el, sources) {
  const box = el.querySelector('.search-ai-sources');
  if (!box) return;
  if (!Array.isArray(sources) || !sources.length) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = '<div class="search-ai-sources-title">参考来源 · ' + sources.length + ' 条</div><div class="search-ai-source-list">' +
    sources.map(s => {
      const type = s.type === 'note' ? 'note' : 'attraction';
      const index = escapeHtml(String(s.index == null ? '' : s.index));
      const title = escapeHtml(s.title || '');
      const subtitle = s.subtitle ? '<span class="search-ai-source-sub">' + escapeHtml(s.subtitle) + '</span>' : '';
      return '<button type="button" class="search-ai-source" data-index="' + index + '" data-type="' + type + '" data-id="' + escapeHtml(String(s.id == null ? '' : s.id)) + '">' +
        '<span class="search-ai-source-no">' + index + '</span>' +
        '<span class="search-ai-source-main"><span class="search-ai-source-title">' + title + '</span>' + subtitle + '</span>' +
        '</button>';
    }).join('') + '</div>';
}

/** 【AI搜索总结的实现】继续问：点击进入旅游助手并预填问题（#/ai-chat?q=） */
function fillSummarySuggestions(el, suggestions) {
  const box = el.querySelector('.search-ai-suggest');
  if (!box) return;
  if (!Array.isArray(suggestions) || !suggestions.length) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = '<div class="search-ai-suggest-title">继续问</div><div class="search-ai-suggest-chips">' +
    suggestions.map(q => '<button type="button" class="search-ai-suggest-chip" data-q="' + escapeHtml(q) + '">' + escapeHtml(q) + '</button>').join('') +
    '</div>';
}

/** 【AI搜索总结的实现】反馈区：未反馈 → 👍/👎（👎 展开原因）；已反馈 → 高亮已选项，可再次点击取消 */
function fillSummaryFeedback(el, state) {
  const box = el.querySelector('.search-ai-feedback');
  if (!box) return;
  box.hidden = false;
  const vote = state.feedbackVote || '';
  const upActive = vote === 'up' ? ' active' : '';
  const downActive = vote === 'down' ? ' active' : '';
  box.innerHTML =
    '<span class="search-ai-feedback-label">' + (vote ? '已反馈 · 再点一次可取消' : '这个总结有帮助吗？') + '</span>' +
    '<button type="button" class="search-ai-thumb' + upActive + '" data-vote="up" aria-label="有帮助" title="有帮助">' + SUMMARY_THUMB_UP + '</button>' +
    '<button type="button" class="search-ai-thumb' + downActive + '" data-vote="down" aria-label="没帮助" title="没帮助">' + SUMMARY_THUMB_DOWN + '</button>' +
    (vote ? '' : '<div class="search-ai-reasons" hidden>' +
      SUMMARY_DOWN_REASONS.map(r => '<button type="button" class="search-ai-reason" data-reason="' + escapeHtml(r) + '">' + escapeHtml(r) + '</button>').join('') +
      '</div>');
}

/** 【AI搜索总结的实现】引用角标点击：滚动到对应来源并闪烁高亮 */
function highlightSummarySource(el, index) {
  const target = el.querySelector('.search-ai-source[data-index="' + index + '"]');
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  target.classList.add('flash');
  setTimeout(() => target.classList.remove('flash'), 1200);
}

/** 【AI搜索总结的实现】请求并流式渲染总结（refresh=true 为「换一换」，跳过服务端缓存） */
async function streamAiSummary(el, keyword, refresh) {
  if (!el || !keyword) return;
  abortSummary();
  const seq = ++summarySeq;
  const controller = new AbortController();
  summaryAbort = controller;
  const state = { text: '', sources: [], suggestions: [], cached: false, degraded: false, error: '', feedbackVote: '', feedbackBusy: false, finalized: false };
  /* 「换一换」失败兜底：保留旧总结，避免刷新失败时卡片整体消失 */
  const previousHtml = refresh ? el.innerHTML : '';
  el.innerHTML = summaryCardHtml();

  /** 反馈提交/切换/取消：同一选项再点一次取消；换选项先撤旧票再投新票 */
  async function submitFeedback(vote, reason) {
    if (state.feedbackBusy) return;
    state.feedbackBusy = true;
    const prev = state.feedbackVote;
    try {
      if (prev === vote) {
        await post('/search/summary/feedback/cancel', { keyword });
        state.feedbackVote = '';
      } else {
        if (prev) {
          await post('/search/summary/feedback/cancel', { keyword });
        }
        await post('/search/summary/feedback', { keyword, vote, ...(reason ? { reason } : {}) });
        state.feedbackVote = vote;
      }
    } catch {
      /* 失败由 api.js 统一 toast，保持原状态 */
    }
    state.feedbackBusy = false;
    if (seq === summarySeq && el.isConnected) fillSummaryFeedback(el, state);
  }

  /* 事件委托：卡片内所有交互共用一个入口；重新生成时覆盖 onclick，不累积监听器 */
  el.onclick = (e) => {
    const cite = e.target.closest('.search-ai-cite');
    if (cite) { highlightSummarySource(el, cite.dataset.index); return; }
    const source = e.target.closest('.search-ai-source');
    if (source) {
      const id = source.dataset.id;
      if (id) window.location.hash = (source.dataset.type === 'note' ? '#/note/' : '#/attraction/') + id;
      return;
    }
    const chip = e.target.closest('.search-ai-suggest-chip');
    if (chip) {
      window.location.hash = '#/ai-chat?q=' + encodeURIComponent(chip.dataset.q || '');
      return;
    }
    if (e.target.closest('.search-ai-refresh')) {
      streamAiSummary(el, keyword, true);
      return;
    }
    /* 【AI搜索总结×旅游助手联通的实现】问助手：带搜索上下文跳转旅游助手（预填可改，不自动发送） */
    const ask = e.target.closest('.search-ai-ask');
    if (ask) {
      window.location.hash = '#/ai-chat?q=' + encodeURIComponent(
        '我刚在搜索页查了「' + keyword + '」，请结合 AI 总结帮我详细介绍一下，并推荐几个值得玩的点');
      return;
    }
    const expand = e.target.closest('.search-ai-expand');
    if (expand) {
      const textEl = el.querySelector('.search-ai-text');
      if (!textEl) return;
      textEl.classList.toggle('collapsed');
      expand.textContent = textEl.classList.contains('collapsed') ? '展开全文' : '收起';
      return;
    }
    /* 小红书式卡片折叠：展开/收起整卡（收起时来源/追问/反馈随之隐藏） */
    const toggle = e.target.closest('.search-ai-toggle');
    if (toggle) {
      const card = el.querySelector('.search-ai-card');
      if (!card) return;
      card.classList.toggle('collapsed');
      const expanded = !card.classList.contains('collapsed');
      const toggleText = toggle.querySelector('span');
      if (toggleText) toggleText.textContent = expanded ? '收起' : '展开';
      const textEl = el.querySelector('.search-ai-text');
      const expandBtn = el.querySelector('.search-ai-expand');
      /* 展开后正文若超长（>168px），显示二级「展开全文」折叠；收起时隐藏 */
      if (expandBtn) expandBtn.hidden = !(expanded && textEl && textEl.scrollHeight > 168);
      return;
    }
    const thumb = e.target.closest('.search-ai-thumb');
    if (thumb) {
      if (thumb.dataset.vote === 'up') {
        submitFeedback('up');
      } else if (state.feedbackVote === 'down') {
        /* 已点踩：再点一次取消 */
        submitFeedback('down');
      } else {
        /* 未点踩：展开原因，选择后提交（已点赞则自动切换） */
        const reasons = el.querySelector('.search-ai-reasons');
        if (reasons) reasons.hidden = false;
      }
      return;
    }
    const reason = e.target.closest('.search-ai-reason');
    if (reason) submitFeedback('down', reason.dataset.reason);
  };

  /** 收尾：正文为空隐藏卡片；有正文则更新标签/来源/追问/反馈/折叠（幂等：summaryDone 与流结束只收尾一次） */
  function finalize() {
    if (state.finalized || seq !== summarySeq || !el.isConnected) return;
    if (!state.text) { el.innerHTML = previousHtml || ''; return; }
    state.finalized = true;
    const tag = el.querySelector('.search-ai-tag');
    /* 降级整理（LLM 不可用，由平台结果拼成）单独标注，避免把兜底文案当成模型生成 */
    if (tag) tag.textContent = state.degraded ? '结果整理' : (state.cached ? '缓存秒出' : 'AI 生成');
    const foot = el.querySelector('.search-ai-foot');
    if (foot) {
      foot.hidden = false;
      /* foot 改为「免责文案 + 问助手」双段结构：文案更新到子 span，保留右侧入口 */
      const footText = foot.querySelector('.search-ai-foot-text');
      if (footText) {
        footText.textContent = state.degraded
          ? 'AI 服务繁忙，当前为平台结果自动整理，仅供参考'
          : '内容由 AI 生成 · 基于 ' + state.sources.length + ' 条平台内容，仅供参考';
      }
    }
    fillSummarySources(el, state.sources);
    fillSummarySuggestions(el, state.suggestions);
    /* 反馈只针对真实模型生成、且有依据的总结展示；降级整理/空结果不收集反馈 */
    if (!state.error && !state.degraded && state.sources.length) fillSummaryFeedback(el, state);
    /* 小红书式折叠：卡片保持默认收起，显示右上角「展开」入口（正文 3 行截断） */
    const toggleBtn = el.querySelector('.search-ai-toggle');
    if (toggleBtn) toggleBtn.hidden = false;
    const cardEl = el.querySelector('.search-ai-card');
    if (cardEl && !cardEl.classList.contains('collapsed')) {
      /* 用户在流式期间已手动展开：仅当正文超长时显示二级「展开全文」 */
      const textEl = el.querySelector('.search-ai-text');
      const expandBtn = el.querySelector('.search-ai-expand');
      if (expandBtn) expandBtn.hidden = !(textEl && textEl.scrollHeight > 168);
    }
  }

  try {
    const resp = await fetch(API_BASE + '/search/summary', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(getToken() ? { authorization: getToken() } : {})
      },
      body: JSON.stringify({ keyword, refresh: !!refresh }),
      signal: controller.signal
    });
    if (!resp.ok || !resp.body) throw new Error('HTTP ' + resp.status);

    const reader = resp.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      /* SSE 事件以空行分隔；同一事件的多个 data: 行按规范拼接还原 */
      const parts = buf.split('\n\n');
      buf = parts.pop() || '';
      for (const part of parts) {
        const dataLines = part.split('\n')
          .filter(l => l.startsWith('data:'))
          .map(l => l.slice(5).replace(/^ /, ''));
        if (!dataLines.length) continue;
        const payload = dataLines.join('\n');
        if (!payload || payload === '[DONE]') continue;
        try {
          const node = JSON.parse(payload);
          if (seq !== summarySeq || !el.isConnected) return;
          if (node.meta) {
            state.cached = !!node.meta.cached;
            state.degraded = !!node.meta.degraded;
          }
          if (Array.isArray(node.sources)) {
            state.sources = node.sources;
            fillSummarySources(el, state.sources);
          }
          if (Array.isArray(node.suggestions)) {
            state.suggestions = node.suggestions;
            fillSummarySuggestions(el, state.suggestions);
          }
          if (node.delta) {
            state.text += node.delta;
            const textEl = el.querySelector('.search-ai-text');
            if (textEl) textEl.innerHTML = renderSummaryBody(state.text);
            /* 有正文即显示「展开」入口（折叠态下流式渲染，3 行截断） */
            const toggleBtn = el.querySelector('.search-ai-toggle');
            if (toggleBtn && state.text.length > 24) toggleBtn.hidden = false;
          }
          /* 正文替换：输出护栏修正（越界引用剔除/按句截断）或降级兜底，覆盖已渲染的流式原文 */
          if (typeof node.replace === 'string') {
            state.text = node.replace;
            const textEl = el.querySelector('.search-ai-text');
            if (textEl) textEl.innerHTML = renderSummaryBody(state.text);
          }
          /* 正文完成即收尾（追问建议是 second-pass，稍后才到，不阻塞标签/反馈/折叠出现） */
          if (node.summaryDone) {
            state.cached = !!node.summaryDone.cached;
            finalize();
          }
          if (node.error) state.error = node.error.message || 'AI 总结暂时不可用';
        } catch { /* 非法分片忽略 */ }
      }
    }
    finalize();
  } catch {
    /* 取消/网络失败/限流：刷新场景恢复旧总结，首次生成则静默隐藏 */
    if (seq === summarySeq && el.isConnected) el.innerHTML = previousHtml || '';
  } finally {
    if (seq === summarySeq) summaryAbort = null;
  }
}

/**
 * 【全局搜索的实现】渲染当前选中 tab 的内容
 * - 根据 activeTab 渲染景点/游记/用户列表
 * - 首屏数据由 loadSearchResults 传入（避免重复请求首屏）
 * - 后续分页由各 render 函数内部 loadMore 处理
 */
function renderTabContent(container, keyword, allData) {
  switch (activeTab) {
    case 'attraction':
      renderAttractionResults(container, allData.attractions || [], keyword);
      break;
    case 'note':
      renderNoteResults(container, allData.notes || [], keyword);
      break;
    case 'user':
      renderUserResults(container, allData.users || [], keyword);
      break;
  }
}

/** 【全局搜索的实现】渲染景点结果卡片列表 */
function renderAttractionResults(container, list, keyword) {
  if (!list.length) {
    container.innerHTML = '<div class="empty-state"><svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="1"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg><p>未找到相关结果</p></div>';
    return;
  }

  let html = '<div class="search-result-list" id="search-attraction-list">';
  list.forEach(a => {
    const img = (a.images || a.image || '').split(',')[0];
    html += `
      <div class="attraction-card" data-id="${a.id}">
        <div class="card-img">
          <img loading="lazy" src="${imgUrl(img)}" alt="${escapeHtml(a.name)}" onerror="imgError(event)"/>
        </div>
        <div class="card-info">
          <div class="card-name">${escapeHtml(a.name)}</div>
          <div class="card-meta">${escapeHtml(a.area || '')}${a.area && a.address ? '·' : ''}${escapeHtml(a.address || '')}</div>
          <div class="card-bottom">
            <span class="card-score">★ ${scoreDisplay(a.avgScore || a.score)}</span>
            ${/** 【全局搜索的实现】价格显示：有票且 avgPrice>0 → ¥X起，否则"免费" */
            '<span class="card-price">' + (a.hasTicket && a.avgPrice > 0
              ? '¥' + fenToYuan(a.avgPrice) + '起' + (a.hasSeckill ? ' <span class="seckill-badge">秒杀</span>' : '')
              : '<span class="card-free">免费</span>') + '</span>'}
          </div>
        </div>
      </div>`;
  });
  html += '</div>';
  container.innerHTML = html;

  container.querySelectorAll('.attraction-card').forEach(card => {
    card.addEventListener('click', () => {
      window.location.hash = '#/attraction/' + card.dataset.id;
    });
  });

  // 分页加载更多
  if (tabHasMore.attraction) {
    const listEl = container.querySelector('#search-attraction-list');
    const sentinel = document.createElement('div');
    sentinel.className = 'load-sentinel load-sentinel-search-attr';
    sentinel.style.cssText = 'height:10px;width:100%';
    listEl.appendChild(sentinel);

    let current = tabPages.attraction || 2;
    observeSentinel(listEl, 'load-sentinel-search-attr', async () => {
      try {
        const data = await get('/search?keyword=' + encodeURIComponent(keyword) + '&current=' + current);
        const moreList = (data && data.attractions) ? data.attractions : [];
        if (!moreList.length) { sentinel.remove(); return; }
        /* 防御性去重：按已渲染卡片 data-id 过滤，防重复追加 */
        const existingIds = new Set([...listEl.querySelectorAll('.attraction-card')].map(el => el.dataset.id));
        moreList.forEach(a => {
          if (existingIds.has(String(a.id))) return;
          existingIds.add(String(a.id));
          const img = (a.images || a.image || '').split(',')[0];
          const el = document.createElement('div');
          el.className = 'attraction-card';
          el.dataset.id = a.id;
          el.innerHTML = `
            <div class="card-img">
              <img loading="lazy" src="${imgUrl(img)}" alt="${escapeHtml(a.name)}" onerror="imgError(event)"/>
            </div>
            <div class="card-info">
              <div class="card-name">${escapeHtml(a.name)}</div>
              <div class="card-meta">${escapeHtml(a.area || '')}${a.area && a.address ? '·' : ''}${escapeHtml(a.address || '')}</div>
              <div class="card-bottom">
                <span class="card-score">★ ${scoreDisplay(a.avgScore || a.score)}</span>
                <span class="card-price">${a.hasTicket && a.avgPrice > 0 ? '¥' + fenToYuan(a.avgPrice) + '起' : '<span class="card-free">免费</span>'}</span>
              </div>
            </div>`;
          el.addEventListener('click', () => {
            window.location.hash = '#/attraction/' + a.id;
          });
          listEl.insertBefore(el, sentinel);
        });
        current++;
        tabPages.attraction = current;
      } catch { sentinel.remove(); }
    }, 'load-sentinel-search-attr');
  }
}

/** 【全局搜索的实现】渲染游记结果卡片（瀑布流） */
function renderNoteResults(container, list, keyword) {
  if (!list.length) {
    container.innerHTML = '<div class="empty-state"><svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="1"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg><p>未找到相关结果</p></div>';
    return;
  }

  let html = '<div class="notes-waterfall" id="search-note-list">';
  list.forEach(note => {
    /** 【全局搜索的实现】图片字段兼容：images||image */
    const img = (note.images || note.image || '').split(',')[0];
    html += `
      <div class="note-card" data-id="${note.id}">
        <div class="note-img">
          <img loading="lazy" src="${imgUrl(img)}" alt="" onerror="imgError(event)"/>
        </div>
        <div class="note-body">
          <div class="note-title">${escapeHtml(note.title || '')}</div>
          <div class="note-footer">
            <div class="note-author">
              ${note.icon ? '<img class="avatar avatar-mask" src="' + imgUrl(note.icon) + '" alt="" onerror="imgError(event)" data-avatar-uid="' + (note.userId || '') + '" data-avatar-icon="' + imgUrl(note.icon) + '" data-avatar-nick="' + escapeHtml(note.name || '') + '"/>' : ''}
              <span>${escapeHtml(note.name || '')}</span>
            </div>
            <div class="note-likes">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="${note.isLike ? '#f87171' : 'none'}" stroke="${note.isLike ? '#f87171' : '#999'}" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              <span>${note.liked || 0}</span>
            </div>
          </div>
        </div>
      </div>`;
  });
  html += '</div>';
  container.innerHTML = html;

  container.querySelectorAll('.note-card').forEach(card => {
    card.addEventListener('click', () => {
      window.location.hash = '#/note/' + card.dataset.id;
    });
  });

  // 分页加载更多
  if (tabHasMore.note) {
    const listEl = container.querySelector('#search-note-list');
    const sentinel = document.createElement('div');
    sentinel.className = 'load-sentinel load-sentinel-search-note';
    sentinel.style.cssText = 'height:10px;width:100%;column-span:all';
    listEl.appendChild(sentinel);

    let current = tabPages.note || 2;
    observeSentinel(listEl, 'load-sentinel-search-note', async () => {
      try {
        const data = await get('/search?keyword=' + encodeURIComponent(keyword) + '&current=' + current);
        const moreList = (data && data.notes) ? data.notes : [];
        if (!moreList.length) { sentinel.remove(); return; }
        /* 防御性去重：按已渲染卡片 data-id 过滤，防重复追加 */
        const existingIds = new Set([...listEl.querySelectorAll('.note-card')].map(el => el.dataset.id));
        moreList.forEach(note => {
          if (existingIds.has(String(note.id))) return;
          existingIds.add(String(note.id));
          const img = (note.images || note.image || '').split(',')[0];
          const el = document.createElement('div');
          el.className = 'note-card';
          el.dataset.id = note.id;
          el.innerHTML = `
            <div class="note-img">
              <img loading="lazy" src="${imgUrl(img)}" alt="" onerror="imgError(event)"/>
            </div>
            <div class="note-body">
              <div class="note-title">${escapeHtml(note.title || '')}</div>
              <div class="note-footer">
                <div class="note-author">
                  ${note.icon ? '<img class="avatar avatar-mask" src="' + imgUrl(note.icon) + '" alt="" onerror="imgError(event)" data-avatar-uid="' + (note.userId || '') + '" data-avatar-icon="' + imgUrl(note.icon) + '" data-avatar-nick="' + escapeHtml(note.name || '') + '"/>' : ''}
                  <span>${escapeHtml(note.name || '')}</span>
                </div>
                <div class="note-likes">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="${note.isLike ? '#f87171' : 'none'}" stroke="${note.isLike ? '#f87171' : '#999'}" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                  <span>${note.liked || 0}</span>
                </div>
              </div>
            </div>`;
          el.addEventListener('click', () => {
            window.location.hash = '#/note/' + note.id;
          });
          listEl.insertBefore(el, sentinel);
        });
        current++;
        tabPages.note = current;
      } catch { sentinel.remove(); }
    }, 'load-sentinel-search-note');
  }
}

/** 【全局搜索的实现】渲染用户结果行（头像+昵称，点击跳主页） */
function renderUserResults(container, list, keyword) {
  if (!list.length) {
    container.innerHTML = '<div class="empty-state"><svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="1"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg><p>未找到相关结果</p></div>';
    return;
  }

  let html = '<div class="search-user-list" id="search-user-list">';
  list.forEach(u => {
    html += `
      <div class="search-user-item" data-uid="${u.id}">
        <img class="avatar" src="${imgUrl(u.icon)}" alt="" onerror="imgError(event)" data-avatar-uid="${u.id}" data-avatar-icon="${imgUrl(u.icon)}" data-avatar-nick="${escapeHtml(u.nickName || '')}"/>
        <div class="search-user-info">
          <div class="search-user-name">${escapeHtml(u.nickName || '用户')}</div>
          ${u.sign ? '<div class="search-user-sign">' + escapeHtml(u.sign) + '</div>' : ''}
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
      </div>`;
  });
  html += '</div>';
  container.innerHTML = html;

  container.querySelectorAll('.search-user-item').forEach(item => {
    item.addEventListener('click', () => {
      window.location.hash = '#/user/' + item.dataset.uid;
    });
  });

  // 分页加载更多
  if (tabHasMore.user) {
    const listEl = container.querySelector('#search-user-list');
    const sentinel = document.createElement('div');
    sentinel.className = 'load-sentinel load-sentinel-search-user';
    sentinel.style.cssText = 'height:10px;width:100%';
    listEl.appendChild(sentinel);

    let current = tabPages.user || 2;
    observeSentinel(listEl, 'load-sentinel-search-user', async () => {
      try {
        const data = await get('/search?keyword=' + encodeURIComponent(keyword) + '&current=' + current);
        const moreList = (data && data.users) ? data.users : [];
        if (!moreList.length) { sentinel.remove(); return; }
        /* 防御性去重：按已渲染条目 data-uid 过滤，防重复追加 */
        const existingIds = new Set([...listEl.querySelectorAll('.search-user-item')].map(el => el.dataset.uid));
        moreList.forEach(u => {
          if (existingIds.has(String(u.id))) return;
          existingIds.add(String(u.id));
          const el = document.createElement('div');
          el.className = 'search-user-item';
          el.dataset.uid = u.id;
          el.innerHTML = `
            <img class="avatar" src="${imgUrl(u.icon)}" alt="" onerror="imgError(event)" data-avatar-uid="${u.id}" data-avatar-icon="${imgUrl(u.icon)}" data-avatar-nick="${escapeHtml(u.nickName || '')}"/>
            <div class="search-user-info">
              <div class="search-user-name">${escapeHtml(u.nickName || '用户')}</div>
              ${u.sign ? '<div class="search-user-sign">' + escapeHtml(u.sign) + '</div>' : ''}
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>`;
          el.addEventListener('click', () => {
            window.location.hash = '#/user/' + u.id;
          });
          listEl.insertBefore(el, sentinel);
        });
        current++;
        tabPages.user = current;
      } catch { sentinel.remove(); }
    }, 'load-sentinel-search-user');
  }
}
