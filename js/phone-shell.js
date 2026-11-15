/**
 * 【手机模拟的实现】桌面端手机外壳控制：
 * - 状态栏时间每 30 秒刷新一次（手机样式的 HH:mm）；
 * - 点击状态栏回到页面顶部（对应 iOS 点状态栏回顶的习惯）。
 * 外壳仅在桌面宽度（≥640px）由 CSS 显示，移动端不渲染视觉影响。
 */
export function initPhoneShell() {
  const shell = document.getElementById('phone-shell');
  if (!shell) {
    return;
  }

  const timeEl = document.getElementById('phone-time');
  const updateTime = () => {
    if (!timeEl) return;
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    timeEl.textContent = hh + ':' + mm;
  };
  updateTime();
  setInterval(updateTime, 30_000);

  const statusbar = shell.querySelector('.phone-statusbar');
  if (statusbar) {
    statusbar.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
}
