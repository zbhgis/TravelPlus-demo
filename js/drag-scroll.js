/**
 * 【手机模拟的实现】桌面端手势层：鼠标拖拽滚动 + 惯性滑动 + 左缘右滑返回。
 * 背景：页面按手机 App 形态设计，桌面浏览器只有滚轮能滚动页面、没有手势返回，
 *       操作起来仍是"网页感"。本模块把常用手机手势映射到鼠标：
 * - 拖拽滚动：按住内容区上下/左右拖动，内容跟随移动（触屏设备保持原生滚动，不接管）；
 * - 惯性滑动：松手后按拖动速度继续滑行并逐渐减速（flick 手感）；
 * - 左缘右滑返回：从内容左边缘向右拖 > 90px，触发浏览器返回上一页（带左侧返回提示）；
 * - 智能滚动目标：按主方向滚动最近的可滚动容器（聊天列表、来源横滑条等），否则滚动页面；
 * - 交互保护：链接/按钮/输入框/地图/消息左滑项不接管，拖拽结束后吞掉一次 click 防误触。
 */
export function initDragScroll() {
  /* 粗指针（手机/平板）用原生滚动即可，不接管 */
  if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
    return;
  }

  /** 不参与拖拽滚动的元素：交互控件、地图、自带拖拽的业务列表 */
  const NO_DRAG = [
    'a', 'button', 'input', 'textarea', 'select', 'label', 'option', 'summary',
    '[contenteditable="true"]', '[data-no-drag-scroll]', '.no-drag-scroll',
    '.chat-session-item', '.chat-session-actions',
    '.amap-container', '.amap-maps'
  ].join(',');

  const THRESHOLD = 8;        // 判定为拖拽的最小位移
  const EDGE_ZONE = 26;       // 左缘返回手势的触发区域（px）
  const BACK_DISTANCE = 90;   // 触发返回的最小右滑距离
  const FRICTION = 0.94;      // 惯性衰减系数

  let dragging = false;
  let moved = false;
  let axis = '';              // '' | 'x' | 'y'，手势开始后锁定方向
  let startX = 0, startY = 0, lastX = 0, lastY = 0, lastTime = 0;
  let xScroller = null;
  let yScroller = null;
  let vx = 0, vy = 0;
  let momentumRaf = 0;
  let edgeBack = false;
  let edgeStartX = 0;
  let appLeft = 0;
  let backHint = null;

  /** 向上查找最近的、指定方向可滚动的祖先（不含 body/html，最终回退页面滚动） */
  function findScroller(el, vertical) {
    let node = el instanceof Element ? el : null;
    while (node && node !== document.body && node !== document.documentElement) {
      const style = getComputedStyle(node);
      if (vertical) {
        const oy = style.overflowY;
        if ((oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight + 2) {
          return node;
        }
      } else {
        const ox = style.overflowX;
        if ((ox === 'auto' || ox === 'scroll') && node.scrollWidth > node.clientWidth + 2) {
          return node;
        }
      }
      node = node.parentElement;
    }
    return null;
  }

  /** 纵向滚动指定容器或页面；返回是否实际发生滚动（用于惯性到达边界时停止） */
  function applyY(delta, scroller) {
    if (scroller) {
      const before = scroller.scrollTop;
      scroller.scrollTop = before + delta;
      return Math.abs(scroller.scrollTop - before) > 0.5;
    }
    const before = window.scrollY;
    window.scrollBy(0, delta);
    return Math.abs(window.scrollY - before) > 0.5;
  }

  /** 横向滚动指定容器或页面 */
  function applyX(delta, scroller) {
    if (scroller) {
      const before = scroller.scrollLeft;
      scroller.scrollLeft = before + delta;
      return Math.abs(scroller.scrollLeft - before) > 0.5;
    }
    const before = window.scrollX;
    window.scrollBy(delta, 0);
    return Math.abs(window.scrollX - before) > 0.5;
  }

  function stopMomentum() {
    if (momentumRaf) {
      cancelAnimationFrame(momentumRaf);
      momentumRaf = 0;
    }
  }

  /** 松手惯性：速度 px/ms × 16 ≈ 每帧位移，逐帧衰减到阈值以下或触边停止 */
  function startMomentum(dir, speed, scroller) {
    let v = Math.max(-3, Math.min(3, speed));
    if (Math.abs(v) < 0.06) return;
    const step = () => {
      v *= FRICTION;
      if (Math.abs(v) < 0.02) {
        momentumRaf = 0;
        return;
      }
      const delta = v * 16;
      const movedNow = dir === 'y' ? applyY(delta, scroller) : applyX(delta, scroller);
      if (!movedNow) {
        momentumRaf = 0;
        return;
      }
      momentumRaf = requestAnimationFrame(step);
    };
    momentumRaf = requestAnimationFrame(step);
  }

  function showBackHint(progress) {
    if (!backHint || !backHint.isConnected) {
      backHint = document.createElement('div');
      backHint.className = 'edge-back-hint';
      backHint.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m15 18-6-6 6-6"/></svg>';
      document.body.appendChild(backHint);
    }
    backHint.style.left = (appLeft + 8) + 'px';
    backHint.style.opacity = String(Math.min(1, progress));
    backHint.classList.add('show');
  }

  function hideBackHint() {
    if (!backHint) return;
    backHint.classList.remove('show');
    backHint.style.opacity = '0';
  }

  /** 拖拽结束浏览器会补发一次 click：捕获阶段吞掉，防止误触卡片/按钮 */
  function suppressNextClick() {
    const suppress = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
    };
    document.addEventListener('click', suppress, true);
    setTimeout(() => document.removeEventListener('click', suppress, true), 320);
  }

  function stop() {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove('drag-scrolling');

    const wasMoved = moved;
    const wasEdge = edgeBack;
    const backDx = lastX - edgeStartX;
    const dir = axis;
    const speed = dir === 'x' ? vx : vy;
    const target = dir === 'x' ? xScroller : yScroller;

    moved = false;
    axis = '';
    edgeBack = false;
    xScroller = null;
    yScroller = null;
    vx = 0;
    vy = 0;
    hideBackHint();

    if (wasMoved && wasEdge && backDx > BACK_DISTANCE) {
      history.back();
      return;
    }
    if (wasMoved) {
      suppressNextClick();
      startMomentum(dir, speed, target);
    }
  }

  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const target = e.target;
    if (!(target instanceof Element) || target.closest(NO_DRAG)) return;

    stopMomentum();
    dragging = true;
    moved = false;
    axis = '';
    startX = lastX = e.clientX;
    startY = lastY = e.clientY;
    lastTime = performance.now();
    vx = 0;
    vy = 0;

    xScroller = findScroller(target, false);
    yScroller = findScroller(target, true);

    /* 左缘返回手势：从内容左边缘起手、且不在横向滚动容器/输入框内 */
    const appEl = document.getElementById('app');
    const rect = appEl ? appEl.getBoundingClientRect() : null;
    appLeft = rect ? Math.max(0, rect.left) : 0;
    edgeStartX = e.clientX;
    edgeBack = e.clientX <= appLeft + EDGE_ZONE
      && !xScroller
      && !target.closest('input,textarea,select,[contenteditable="true"]');
  }, true);

  document.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const totalX = e.clientX - startX;
    const totalY = e.clientY - startY;
    if (!moved && Math.hypot(totalX, totalY) < THRESHOLD) return;

    const now = performance.now();
    const dt = Math.max(1, now - lastTime);
    if (!axis) {
      axis = Math.abs(totalX) > Math.abs(totalY) ? 'x' : 'y';
    }

    /* 左缘右滑：只显示返回提示，不滚动内容；反向滑动或纵向滑动则取消 */
    if (edgeBack) {
      if (axis === 'y' || totalX < -8) {
        edgeBack = false;
        hideBackHint();
      }
    }

    moved = true;
    e.preventDefault();
    document.body.classList.add('drag-scrolling');

    if (edgeBack) {
      showBackHint(totalX / BACK_DISTANCE);
    } else if (axis === 'y') {
      const dy = e.clientY - lastY;
      vy = -dy / dt;
      applyY(-dy, yScroller);
    } else {
      const dx = e.clientX - lastX;
      vx = -dx / dt;
      applyX(-dx, xScroller);
    }

    lastX = e.clientX;
    lastY = e.clientY;
    lastTime = now;
  }, { capture: true, passive: false });

  document.addEventListener('pointerup', stop, true);
  document.addEventListener('pointercancel', stop, true);
  window.addEventListener('blur', stop);
  /* 新的滚轮/触摸操作立即打断惯性 */
  window.addEventListener('wheel', stopMomentum, { passive: true });
  document.addEventListener('touchstart', stopMomentum, { passive: true });
  /* 拖拽中禁止浏览器原生图片拖影 */
  document.addEventListener('dragstart', (e) => {
    if (dragging) e.preventDefault();
  });

  /* 【手机模拟的实现】触屏设备的轻触震动反馈（桌面无效果，不影响鼠标） */
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch' || !navigator.vibrate) return;
    if (e.target instanceof Element && e.target.closest('button,.tabbar-item,.attraction-card,.note-card,.ticket-card,.btn')) {
      try {
        navigator.vibrate(6);
      } catch {
        // 部分环境禁止震动：忽略
      }
    }
  }, true);
}
