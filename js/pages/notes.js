/**
 * 【热门游记瀑布流的实现】#/notes 页面 + 聚合首页游记频道复用模块
 * 职责：热门游记双列瀑布流渲染、无限滚动、作者头像点击跳转用户主页
 * 依赖：api.js (get)、ui.js (imgUrl/imgError/showLoading/showEmpty/loadMore)
 * 核心链路：
 *   - 全页渲染：renderNotes → page-header（标题点击随机换一批）+ renderNotesContent → GET /note/hot
 *   - 频道复用：renderNotesContent（供 home.js 聚合首页调用，不含 page-header）
 *   - 瀑布流：CSS columns 实现双列布局，.note-card 单元
 *   - 无限滚动：IntersectionObserver + loadMore → GET /note/hot?current=N → appendNoteCards
 *   - 头像跳转：.note-author 内头像点击 → #/user/{userId}，stopPropagation 防止触发卡片跳详情
 * 注意：作者 userId 可能为空，此时不绑定头像点击事件
 */
import { get } from '../api.js';
import { imgUrl, imgError, showLoading, showEmpty, loadMore, toast } from '../ui.js';

/** 【随机刷新返回的实现】刷新前快照（右下角"返回"按钮用）
 *  - renderedFirstPage：当前屏幕第一页数据（按展示顺序，每次渲染更新）
 *  - preShuffleSnapshot：最近一次"随机换一批"前的第一页快照；null=无可返回内容
 *  - activeContainer：当前渲染的容器引用（恢复时重建瀑布流用）
 */
let renderedFirstPage = null;
let preShuffleSnapshot = null;
let activeContainer = null;
const RESTORE_FAB_ID = 'notes-restore-fab';

/* 全页渲染：page-header + 内容（保留供直接路由使用）
 * 标题「热门游记」可点击：随机重排第一页并重新拉取（随机推送），替代原悬浮刷新按钮 */
export async function renderNotes(container) {
  container.innerHTML = `
    <div class="page-header">
      <h2 id="notes-title" title="点我随机换一批">热门游记</h2>
    </div>
    <div id="notes-wrapper"></div>
  `;
  const wrapper = container.querySelector('#notes-wrapper');
  const titleEl = container.querySelector('#notes-title');
  titleEl.addEventListener('click', async () => {
    await renderNotesContent(wrapper, { shuffleFirstPage: true });
    toast('已随机换一批');
  });
  await renderNotesContent(wrapper);
}

/* 频道复用：仅渲染瀑布流内容，不含 page-header
 * @param {{shuffleFirstPage?: boolean}} opts - shuffleFirstPage=true 时随机打乱第一页顺序（随机推送），
 *        并把刷新前的展示顺序存入快照供右下角"返回"按钮恢复 */
export async function renderNotesContent(container, { shuffleFirstPage = false } = {}) {
  /** 【游记发布的实现】检测发布脏标记——若存在则强制重新拉取
   * 实现细节：
   * - 发布/编辑游记成功后 note-edit.js 写 localStorage travelplus_notes_dirty='1'
   * - 此处检测并移除标记，确保下次进入游记频道时重新拉取最新数据
   * - 标记仅消费一次（removeItem），避免反复触发
   */
  if (localStorage.getItem('travelplus_notes_dirty')) {
    localStorage.removeItem('travelplus_notes_dirty');
  }

  container.innerHTML = '<div class="notes-waterfall" id="notes-list"></div>';
  const listEl = container.querySelector('#notes-list');
  let current = 1;
  let hasMore = true;
  activeContainer = container;

  showLoading(listEl);

  try {
    const data = await get('/note/hot?current=1');
    let list = Array.isArray(data) ? data : (data && data.records ? data.records : []);
    if (shuffleFirstPage && list.length > 1) {
      // 保存刷新前的展示顺序（快照取当前屏幕实际顺序，支持随机换一批后一键返回）
      preShuffleSnapshot = renderedFirstPage && renderedFirstPage.length ? renderedFirstPage : null;
      list = shuffle(list);
    } else if (!shuffleFirstPage) {
      // 非刷新渲染（进入频道/切 tab）：上一批快照作废，返回按钮隐藏
      preShuffleSnapshot = null;
      hideRestoreFab();
    }
    hasMore = list.length > 0;
    renderedFirstPage = list;
    renderNoteCards(listEl, list);
    if (hasMore) {
      current = 2;
      addLoadMore(listEl, current);
    } else {
      showEmpty(listEl, '暂无游记');
    }
    // 快照存在 → 显示右下角返回按钮；否则隐藏
    if (preShuffleSnapshot) {
      showRestoreFab();
    } else {
      hideRestoreFab();
    }
  } catch {
    showEmpty(listEl, '加载失败');
  }
}

function addLoadMore(el, startCurrent) {
  let current = startCurrent;
  const sentinel = document.createElement('div');
  sentinel.className = 'load-sentinel';
  sentinel.style.cssText = 'height:10px;width:100%;column-span:all';
  el.appendChild(sentinel);

  loadMore(el, async () => {
    try {
      const data = await get('/note/hot?current=' + current);
      const list = Array.isArray(data) ? data : (data && data.records ? data.records : []);
      if (!list.length) {
        sentinel.remove();
        return;
      }
      appendNoteCards(el, list, sentinel);
      current++;
    } catch { /* silently stop */ }
  }, 'load-sentinel');
}

function renderNoteCards(container, list) {
  let html = '';
  list.forEach(note => {
    const img = note.images ? note.images.split(',')[0] : '';
    html += `
      <div class="note-card" data-id="${note.id}" data-author-id="${note.userId || ''}">
        <div class="note-img">
          <img loading="lazy" src="${imgUrl(img)}" alt="" onerror="imgError(event)"/>
        </div>
        <div class="note-body">
          <div class="note-title">${escapeHtml(note.title || '')}</div>
          <div class="note-footer">
            <div class="note-author">
              <img class="avatar-sm" src="${imgUrl(note.icon)}" alt="" onerror="imgError(event)" data-avatar-uid="${note.userId || ''}" data-avatar-icon="${imgUrl(note.icon)}" data-avatar-nick="${escapeHtml(note.name || '匿名')}"/>
              <span>${escapeHtml(note.name || '匿名')}</span>
            </div>
            <div class="note-likes">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="${note.isLike ? '#f87171' : 'none'}" stroke="${note.isLike ? '#f87171' : '#999'}" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              <span>${note.liked || 0}</span>
            </div>
          </div>
        </div>
      </div>`;
  });
  container.innerHTML = html;

  container.querySelectorAll('.note-card').forEach(card => {
    card.addEventListener('click', () => {
      window.location.hash = '#/note/' + card.dataset.id;
    });
  });

  /** 【头像交互的实现】作者头像点击改由全局委托 initAvatarDelegate 统一处理
   * - data-avatar-uid 已加在 img 模板中，无需独立绑定
   * - 卡片点击（跳详情）与头像点击（委托 stopPropagation）互不冲突
   */
  container.querySelectorAll('.note-author').forEach(author => {
    // 保留 cursor pointer 样式提示
    author.style.cursor = 'pointer';
  });
}

function appendNoteCards(container, list, sentinel) {
  list.forEach(note => {
    const img = note.images ? note.images.split(',')[0] : '';
    const el = document.createElement('div');
    el.className = 'note-card';
    el.dataset.id = note.id;
    el.dataset.authorId = note.userId || '';
    el.innerHTML = `
      <div class="note-img">
        <img loading="lazy" src="${imgUrl(img)}" alt="" onerror="imgError(event)"/>
      </div>
      <div class="note-body">
        <div class="note-title">${escapeHtml(note.title || '')}</div>
        <div class="note-footer">
          <div class="note-author">
            <img class="avatar-sm" src="${imgUrl(note.icon)}" alt="" onerror="imgError(event)" data-avatar-uid="${note.userId || ''}" data-avatar-icon="${imgUrl(note.icon)}" data-avatar-nick="${escapeHtml(note.name || '匿名')}"/>
            <span>${escapeHtml(note.name || '匿名')}</span>
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

    /** 【头像交互的实现】追加卡片中作者头像点击改由全局委托统一处理
     * - data-avatar-uid 已加在 img 模板中，无需独立绑定
     */
    if (note.userId) {
      const author = el.querySelector('.note-author');
      if (author) {
        author.style.cursor = 'pointer';
      }
    }

    container.insertBefore(el, sentinel);
  });
}

export function renderNotesCleanup() {}

/**
 * 【XSS 防护】HTML 转义——用户可控内容（游记标题、作者昵称）插入 innerHTML 前必须转义
 * - 与 note-detail.js / chat.js 的 escapeHtml 实现一致：textContent 赋值后取 innerHTML
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

/** 【随机推送的实现】Fisher-Yates 洗牌——返回新数组，不改原列表 */
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 【随机刷新返回的实现】右下角"返回"悬浮按钮：挂在 body（与 AI 悬浮球同层），仅快照存在时显示 */
function showRestoreFab() {
  if (document.getElementById(RESTORE_FAB_ID)) return;
  const fab = document.createElement('button');
  fab.id = RESTORE_FAB_ID;
  fab.className = 'restore-fab';
  fab.title = '返回刷新前的推荐';
  fab.setAttribute('aria-label', '返回刷新前的推荐');
  fab.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>';
  fab.addEventListener('click', () => {
    if (!preShuffleSnapshot || !preShuffleSnapshot.length || !activeContainer || !activeContainer.isConnected) {
      hideRestoreFab();
      return;
    }
    const list = preShuffleSnapshot;
    preShuffleSnapshot = null;
    // 直接用快照数据重建瀑布流（不发请求），滚动加载从第 2 页重新挂载
    activeContainer.innerHTML = '<div class="notes-waterfall" id="notes-list"></div>';
    const listEl = activeContainer.querySelector('#notes-list');
    renderedFirstPage = list;
    renderNoteCards(listEl, list);
    addLoadMore(listEl, 2);
    hideRestoreFab();
    toast('已返回之前的推荐');
  });
  document.body.appendChild(fab);
}

function hideRestoreFab() {
  document.getElementById(RESTORE_FAB_ID)?.remove();
}

/** 【随机刷新返回的实现】离开首页/重建频道时清理快照与返回按钮（home.js cleanup 调用） */
export function resetNotesRestore() {
  preShuffleSnapshot = null;
  renderedFirstPage = null;
  activeContainer = null;
  hideRestoreFab();
}
