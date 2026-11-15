/**
 * 【旅行功能的实现】旅行页 #/travel——高德地图标记景点 + POI 热点 + 路线规划 + 附近景点推荐
 * 职责：渲染地图区（高德 JS API 2.0 底图 + 景点标记 + InfoWindow 跳详情 + POI 热点详情/平台联动 + 路线模式驾车/步行规划）、附近景点横向卡片；
 *       旅行计划列表已移至「我的」页 tab（用户.js renderUserTabs 计划 tab），本页专注地图导航与旅行
 * 依赖：api.js (get)、ui.js (imgUrl/imgError/toast)、router.js (navigate)、index.html 全局注入的 AMap（key+安全密钥）、amap-poi.js（POI 热点）
 * 核心链路：
 *   renderTravel(container)
 *     → 检查 AMap 全局变量是否可用（CDN 失败降级）
 *     → 初始化高德地图（中心杭州 120.15/30.26 zoom=12，GCJ-02 与景点坐标同源无偏移，isHotspot 开启热点）
 *     → GET /map/points → 全量景点标记 AMap.Marker（自定义绿点）+ 点击 InfoWindow
 *     → POI 热点：点击底图 POI → 详情气泡（平台联动）；路线模式下 → 取名称后加入路线
 *     → 路线模式：点标记/POI 依次加入路线 → AMap.Driving（驾车含途经点）/AMap.Walking（步行逐段）规划 → 折线 + 总里程/时长
 *     → moveend 事件 → haversine 计算中心 5km 内景点 → 渲染"附近景点"横向卡片 + 标题栏实时计数
 *     → cleanup 返回函数：map.destroy() 清理地图实例
 */
import { get } from '../api.js';
import { imgUrl, imgError, toast } from '../ui.js';
import { navigate } from '../router.js';
import { attachLayerToggle } from '../map-layers.js';
import { enablePoiHotspot, lookupPoi } from '../amap-poi.js?v=poi2';

/**
 * 【旅行功能的实现】Haversine 距离计算（球面两点间最短距离）
 * - 实现：经纬度转弧度 → haversine 公式 → 返回公里数
 * - 用于 moveend 时计算地图中心 5km 内的附近景点
 */
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // 地球半径 km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * 【旅行功能的实现】防 XSS 转义工具
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

export async function renderTravel(container) {
  /** 【旅行功能的实现】检查高德 JS API 是否加载成功（CDN 降级处理）
   * - 若 window.AMap 不存在 → 地图区显示"地图加载失败"占位
   * - 其余功能（附近景点/路线规划/POI 热点）仍可用
   */
  const mapReady = typeof window.AMap !== 'undefined';

  /* 【旅行页去空白的实现】移除原 page-header（「旅行」标题约 76px 高）：页面专注地图导航，
   * 地图直接从顶部开始（全屏地图体验，顶部路线/定位按钮悬浮于地图上） */
  container.innerHTML = '<div id="travel-content"><div class="loading-spinner"><div class="spinner"></div><p>加载中...</p></div></div>';

  const contentEl = container.querySelector('#travel-content');

  // 加载景点标记数据
  let points = [];
  try {
    const data = await get('/map/points');
    points = Array.isArray(data) ? data : [];
  } catch {
    // 景点数据加载失败不阻塞页面——地图和其余功能仍可用
  }

  // 构建页面 HTML 结构：地图区（路线规划/POI 热点） + 附近景点区
  let html = '';

  if (mapReady) {
    html += `
      <div class="map-wrap">
        <div class="map-container" id="travel-map"></div>
        <!-- 【地图路线规划的实现】路线模式开关（地图右上角悬浮） -->
        <button class="route-mode-btn" id="route-mode-btn">规划路线</button>
        <!-- 【我在哪的实现】回到我的位置：静默定位蓝点标记 + 点击平移复位 -->
        <button class="locate-btn" id="locate-btn" aria-label="回到我的位置">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="7"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/></svg>
        </button>
        <!-- 【地图路线规划的实现】路线浮条：停靠点芯片 + 出行方式切换 + 图上选点 + 里程/时长摘要 -->
        <div class="route-bar" id="route-bar" style="display:none">
          <div class="route-bar-head">
            <span class="route-bar-title">路线规划</span>
            <span class="route-bar-hint" id="route-hint">点击地图上的景点或地点标记，依次加入路线</span>
          </div>
          <div class="route-stops" id="route-stops"></div>
          <div class="route-summary" id="route-summary"></div>
          <div class="route-bar-actions">
            <div class="route-mode-tabs">
              <span class="route-mode-tab active" data-mode="driving">驾车优先</span>
              <span class="route-mode-tab" data-mode="walking">步行优先</span>
              <span class="route-mode-tab" data-mode="transit">公交优先</span>
            </div>
            <div class="route-bar-tools">
              <span class="route-mode-tab route-ab-tab" id="route-ab-tab">图上选点</span>
              <span class="route-clear" id="route-clear">清空</span>
            </div>
          </div>
        </div>
      </div>
      <div class="nearby-section" id="nearby-section">
        <div class="tv-sec-head">
          <span class="tv-sec-title">附近景点</span>
          <span class="tv-sec-meta" id="nearby-meta">移动地图查看周边</span>
        </div>
        <div class="nearby-scroll" id="nearby-scroll"></div>
      </div>`;
  } else {
    /** 【旅行功能的实现】高德 JS API CDN 降级——地图加载失败占位 */
    html += `
      <div class="map-fallback">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="1.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        <p>地图加载失败</p>
        <p style="font-size:12px;color:var(--text-hint);margin-top:4px">请检查网络连接后刷新页面</p>
      </div>`;
  }

  contentEl.innerHTML = html;

  // 地图初始化
  let map = null;
  /* 附近景点初始计算的延迟定时器句柄（cleanup 时清理，防销毁后触发） */
  let nearbyTimer = null;

  /* 【地图路线规划的实现】路线模式状态
   * - routeMode：是否处于路线规划模式（地图标记点击=加入路线，否则=弹 InfoWindow 详情）
   * - routeStops：已加入路线的景点 [{p, marker}]，数组顺序即途经顺序
   * - routeLines：已绘制的路线折线（重绘/退出前清理）
   * - routeModeType：'driving'（驾车，途经点一次规划）| 'walking'（步行，逐段链接规划）| 'transit'（公交，逐段链接规划）
   */
  let routeMode = false;
  let routeStops = [];
  let routeLines = [];
  let routeModeType = 'driving';

  if (mapReady) {
    /** 【旅行功能的实现】高德地图初始化（JS API 2.0，替换原 Leaflet+OSM）
     * - 中心杭州（120.15, 30.26），zoom 12；GCJ-02 坐标系与景点数据同源，标记无偏移
     * - 遍历 points 为每个景点创建自定义内容标记（.tv-pin 绿点）+ 点击 InfoWindow（名称/评分/详情）
     * - 路线模式：点标记依次加入路线 → AMap.Driving（驾车）/AMap.Walking（步行）规划 → 主题绿折线 + 里程/时长摘要
     * - moveend 事件：haversine 计算中心 5km 内景点 → 渲染"附近景点"横向卡片 + 标题栏实时计数
     */
    const mapEl = contentEl.querySelector('#travel-map');
    if (mapEl) {
      /* 地图高度由 CSS clamp 自适应视口（#travel-map 规则），不再写死 320px：
         计划区迁至「我的」后，地图作为页面主体撑满首屏，避免下方大片空白 */

      map = new AMap.Map(mapEl, { zoom: 12, center: [120.15, 30.26], zooms: [3, 18], isHotspot: true });
      /* 【地图POI热点的实现】点击底图 POI：路线模式下取名称后加入路线（与景点标记同管线）；
         普通模式弹详情气泡（就近匹配平台景点 → 本平台收录/查看详情） */
      enablePoiHotspot(map, {
        attractions: points,
        onPoiClick: e => {
          if (!routeMode || abMode) return false;
          lookupPoi(e.id).then(poi => {
            const p = {
              id: 'poi-' + e.id,
              name: (poi && poi.name) || e.name || '地图地点',
              x: e.lnglat.getLng(), y: e.lnglat.getLat()
            };
            if (routeStops.some(s => s.p.id === p.id)) { toast('该地点已在路线中'); return; }
            const marker = new AMap.Marker({ position: [p.x, p.y], content: pinHtml(null), anchor: 'center', zIndex: 60 });
            map.add(marker);
            pinMarkers.push({ p, marker });   // 纳入序号重绘（renumberStops 按 p.id 匹配）
            addRouteStop(p, marker);
            routeStops[routeStops.length - 1].custom = true; // 移除/清空时随标记一并删除
          });
          return true;
        }
      });

      /* 【影像地图切换的实现】全站共享图层切换组件（卫星/标准，左上角胶囊按钮；右上角已有路线模式/准星按钮） */
      attachLayerToggle(map, mapEl);

      // 共享 InfoWindow：普通模式点击标记弹出（名称/评分/详情链接）
      const infoWindow = new AMap.InfoWindow({ offset: new AMap.Pixel(0, -12) });

      // 自定义景点标记：绿点（.tv-pin）；加入路线后切换为带序号的 .tv-pin-num
      const pinHtml = n => n ? '<span class="tv-pin tv-pin-num">' + n + '</span>' : '<span class="tv-pin"></span>';

      const pinMarkers = [];
      points.forEach(p => {
        if (p.x != null && p.y != null) {
          const marker = new AMap.Marker({
            position: [p.x, p.y],
            content: pinHtml(),
            anchor: 'center',
            zIndex: 30
          });
          marker.on('click', () => {
            /* 路线模式下点击标记 = 依序加入路线（图上选点模式下忽略）；普通模式 = 弹详情气泡 */
            if (routeMode) {
              if (abMode) return;
              addRouteStop(p, marker);
              return;
            }
            const scoreHtml = p.score != null ? '<br/>评分：' + (p.score / 10).toFixed(1) : '';
            infoWindow.setContent('<div class="amap-pin-pop"><b>' + escapeHtml(p.name || '景点') + '</b>' + scoreHtml + '<br/><a href="#/attraction/' + p.id + '">查看详情</a></div>');
            infoWindow.open(map, [p.x, p.y]);
          });
          map.add(marker);
          pinMarkers.push({ p, marker });
        }
      });

      /* ==================== 我的位置 ==================== */
      /* 【我在哪的实现】高德定位插件：进页静默定位一次，蓝点呼吸标记；右上角准星按钮随时平移复位
       * - 浏览器拒绝授权/非安全源（真机 HTTP 局域网）时定位失败：静默定位不打扰，按钮触发时 toast 提示
       * - 定位结果为高德坐标系，与底图同系无需换算
       */
      let userMarker = null;
      const geolocation = new AMap.Geolocation({ enableHighAccuracy: true, timeout: 8000, showButton: false, showMarker: false });
      function locateUser(pan) {
        geolocation.getCurrentPosition((status, result) => {
          if (status === 'complete' && result.position) {
            const pos = [result.position.lng, result.position.lat];
            if (!userMarker) {
              userMarker = new AMap.Marker({
                position: pos,
                content: '<span class="locate-dot"><i></i></span>',
                anchor: 'center',
                zIndex: 120
              });
              map.add(userMarker);
            } else {
              userMarker.setPosition(pos);
            }
            if (pan) {
              map.panTo(pos);
              if (map.getZoom() < 13) map.setZoom(13);
            }
          } else if (pan) {
            toast('定位失败，请检查浏览器定位权限');
          }
        });
      }
      locateUser(false);
      contentEl.querySelector('#locate-btn').addEventListener('click', () => locateUser(true));

      /* ==================== 路线规划 ==================== */
      const routeBar = contentEl.querySelector('#route-bar');
      const routeStopsEl = contentEl.querySelector('#route-stops');
      const routeSummaryEl = contentEl.querySelector('#route-summary');
      const routeHintEl = contentEl.querySelector('#route-hint');
      const routeModeBtn = contentEl.querySelector('#route-mode-btn');

      /** 重绘标记序号：stops 增删后同步各标记内容（未加入的恢复绿点） */
      function renumberStops() {
        pinMarkers.forEach(({ p, marker }) => {
          const idx = routeStops.findIndex(s => s.p.id === p.id);
          marker.setContent(pinHtml(idx > -1 ? idx + 1 : null));
        });
      }

      /** 清除已绘制的路线折线 */
      function clearRouteLines() {
        routeLines.forEach(line => map.remove(line));
        routeLines = [];
      }

      /** 时长格式化：分钟数 → "X分钟" / "X小时Y分" */
      function fmtDur(min) {
        return min >= 60 ? Math.floor(min / 60) + '小时' + Math.round(min % 60) + '分' : Math.max(1, Math.round(min)) + '分钟';
      }

      /** 路线摘要条：总里程/时长 +（步行模式的）每段明细 chips */
      function renderRouteSummary(totalKm, totalMin, legs) {
        let html = '总里程 <b>' + totalKm.toFixed(1) + '</b> km · 约 <b>' + fmtDur(totalMin) + '</b>';
        if (legs && legs.length) {
          html += '<div class="route-legs">' + legs.map(l =>
            '<span class="route-leg">' + escapeHtml(l.from) + ' → ' + escapeHtml(l.to) + ' ' + l.km.toFixed(1) + 'km·' + fmtDur(l.min) + '</span>'
          ).join('') + '</div>';
        }
        routeSummaryEl.innerHTML = html;
      }

      /** 加入路线停靠点：序号徽章重绘 + 芯片条重绘 + 满 2 个自动规划 */
      function addRouteStop(p, marker) {
        if (routeStops.some(s => s.p.id === p.id)) {
          toast('该景点已在路线中');
          return;
        }
        routeStops.push({ p, marker });
        renumberStops();
        renderRouteStops();
        if (routeStops.length >= 2) planRoute();
        else routeSummaryEl.innerHTML = '';
      }

      /** 停靠点芯片条渲染：首尾标"起/终"角色徽章；点击 × 移除（图上选点的标记同步移除）并按需重规划 */
      function renderRouteStops() {
        routeStopsEl.innerHTML = routeStops.map((s, i) => {
          let role = '';
          if (routeStops.length >= 2) {
            if (i === 0) role = '<em class="route-role role-start">起</em>';
            else if (i === routeStops.length - 1) role = '<em class="route-role role-end">终</em>';
          }
          return '<span class="route-stop-chip">' + role + '<i>' + (i + 1) + '</i>' + escapeHtml(s.p.name || '停靠点') + '<b class="route-stop-x" data-i="' + i + '">×</b></span>';
        }).join('');
        routeStopsEl.querySelectorAll('.route-stop-x').forEach(x => {
          x.addEventListener('click', e => {
            e.stopPropagation();
            const idx = parseInt(x.dataset.i, 10);
            const rm = routeStops[idx];
            if (rm && rm.custom && rm.marker) map.remove(rm.marker);
            routeStops.splice(idx, 1);
            renumberStops();
            renderRouteStops();
            if (routeStops.length >= 2) planRoute();
            else { clearRouteLines(); routeSummaryEl.innerHTML = ''; }
          });
        });
      }

      /** 清空停靠点：移除图上选点标记、恢复景点标记、清折线与摘要（清空/退出/切换选点模式共用） */
      function clearRouteStops() {
        routeStops.forEach(s => { if (s.custom && s.marker) map.remove(s.marker); });
        routeStops = [];
        renumberStops();
        renderRouteStops();
        clearRouteLines();
        routeSummaryEl.innerHTML = '';
      }

      /** 【地图路线规划的实现】按当前停靠点与出行方式规划路线
       * - driving：AMap.Driving 单次调用串联全部停靠点。注意 JS API 2.0 的 search 第三参是
       *   opts 对象（{waypoints: [...]}）——旧版 1.4 的「直接传数组」签名在 2.0 下会被当作 opts
       *   解析导致途经点被忽略（只规划起终点直连），这是本次修复的核心 bug；
       * - walking：步行规划不支持途经点 → 相邻两两逐段请求；
       * - transit：公交规划（AMap.Transfer）同样不支持途经点 → 逐段链接规划（demo 数据均在
       *   杭州，city 固定传杭州；跨城公交不在平台场景内）；
       * - 路径绘制：取 result.routes[0].steps[].path 合并为 Polyline（主题绿，含起终点圆滑线帽）
       */
      function planRoute() {
        clearRouteLines();
        if (routeStops.length < 2) { routeSummaryEl.innerHTML = ''; return; }
        routeSummaryEl.innerHTML = '<span class="route-planning">路线规划中...</span>';
        const ll = s => new AMap.LngLat(s.p.x, s.p.y);
        const pathToLine = path => {
          const line = new AMap.Polyline({
            path, strokeColor: '#0E9F8A', strokeWeight: 5, strokeOpacity: 0.9,
            lineJoin: 'round', lineCap: 'round', zIndex: 50
          });
          map.add(line);
          routeLines.push(line);
        };

        if (routeModeType === 'driving') {
          const driving = new AMap.Driving({ policy: 0 });
          const mid = routeStops.slice(1, -1).map(ll);
          driving.search(ll(routeStops[0]), ll(routeStops[routeStops.length - 1]),
            mid.length ? { waypoints: mid } : undefined,
            (status, result) => {
              if (status === 'complete' && result.routes && result.routes.length) {
                const r = result.routes[0];
                const path = [];
                r.steps.forEach(st => { if (Array.isArray(st.path)) path.push.apply(path, st.path); });
                pathToLine(path);
                renderRouteSummary(r.distance / 1000, r.time / 60, null);
              } else {
                routeSummaryEl.innerHTML = '<span class="route-error">驾车路线规划失败，请稍后重试</span>';
              }
            });
          return;
        }

        /* 步行/公交：不支持途经点 → 逐段链接规划，完成段数达标后统一汇总 */
        const isTransit = routeModeType === 'transit';
        const legs = [];
        let noData = 0;
        let done = 0;
        const legTotal = routeStops.length - 1;
        const label = isTransit ? '公交' : '步行';
        const makePlanner = () => isTransit
          ? new AMap.Transfer({ policy: 0, city: '杭州' })
          : new AMap.Walking({ policy: 0 });
        for (let i = 0; i < legTotal; i++) {
          const from = routeStops[i], to = routeStops[i + 1];
          /* 每段用独立 planner 实例：避免复用实例的内部状态串段（高德导航对象非线程安全语义） */
          makePlanner().search(ll(from), ll(to), (status, result) => {
            done++;
            if (status === 'complete' && result.routes && result.routes.length) {
              const r = result.routes[0];
              const path = [];
              r.steps.forEach(st => { if (Array.isArray(st.path)) path.push.apply(path, st.path); });
              pathToLine(path);
              legs.push({
                from: from.p.name || '停靠点' + (i + 1),
                to: to.p.name || '停靠点' + (i + 2),
                km: (r.distance || 0) / 1000,
                min: (r.time || 0) / 60
              });
            } else if (isTransit && status === 'no_data') {
              /* 公交短距离常见：两站间无合理公交方案（高德返回 no_data），单独计数给可操作建议 */
              noData++;
            }
            if (done === legTotal) {
              if (!legs.length) {
                /* 公交无方案在高德侧可能返回 no_data 或 error（短距离/无直达/跨城均可能），
                 * 统一给可操作建议而不是"稍后重试"——重试也不会有方案 */
                routeSummaryEl.innerHTML = isTransit
                  ? '<span class="route-error">当前停靠点之间暂无合适的公交方案（可能距离过近或无直达线路），试试驾车或步行</span>'
                  : '<span class="route-error">' + label + '路线规划失败，请稍后重试</span>';
                return;
              }
              const km = legs.reduce((s, l) => s + l.km, 0);
              const min = legs.reduce((s, l) => s + l.min, 0);
              renderRouteSummary(km, min, legs);
              if (noData) {
                routeSummaryEl.innerHTML += '<div class="route-notice">有 ' + noData + ' 段暂无公交方案，未计入</div>';
              }
            }
          });
        }
      }

      /** 出行方式切换（驾车优先/步行优先/公交优先）→ 立即重规划
       *  注意 [data-mode] 过滤：图上选点 tab 同样挂着 .route-mode-tab 类但无 data-mode，
       *  若不排除，点选点会误触发本处理器把方式改成 undefined（落到步行分支） */
      contentEl.querySelectorAll('.route-mode-tab[data-mode]').forEach(tab => {
        tab.addEventListener('click', () => {
          contentEl.querySelectorAll('.route-mode-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          routeModeType = tab.dataset.mode;
          if (routeStops.length >= 2) planRoute();
        });
      });

      /** 清空停靠点与路线（保持路线模式开启，提示语随模式切换） */
      contentEl.querySelector('#route-clear').addEventListener('click', () => {
        clearRouteStops();
        routeHintEl.textContent = abMode ? '在地图上点击设置起点，再次点击设置终点' : '点击地图上的景点或地点标记，依次加入路线';
      });

      /** 路线模式开关：浮条显隐 + 按钮文案切换；退出时清空路线状态（含图上选点标记） */
      routeModeBtn.addEventListener('click', () => {
        routeMode = !routeMode;
        routeBar.style.display = routeMode ? '' : 'none';
        routeModeBtn.textContent = routeMode ? '退出路线' : '规划路线';
        routeModeBtn.classList.toggle('active', routeMode);
        if (!routeMode) {
          abMode = false;
          abTabEl.classList.remove('active');
          clearRouteStops();
          routeHintEl.textContent = '点击地图上的景点或地点标记，依次加入路线';
        }
      });

      /* ==================== 图上选点（自定义起点终点） ==================== */
      /* 【图上选点的实现】路线模式子模式：点击地图空白处依次设起点(起)/终点(终)
       * - 与点选景点标记互斥：选点模式下景点标记点击无效
       * - 两点齐了自动规划；再次点击地图 = 重新开始选点
       * - 选出的点走同一条 routeStops 管线（芯片可删、驾车/步行可切）
       */
      let abMode = false;
      const abTabEl = contentEl.querySelector('#route-ab-tab');
      map.on('click', e => {
        if (!abMode || !routeMode) return;
        /* 已有成对选点 → 再点一次地图 = 重新开始选点 */
        if (routeStops.filter(s => s.custom).length >= 2) clearRouteStops();
        const isStart = routeStops.length === 0;
        const marker = new AMap.Marker({
          position: [e.lnglat.lng, e.lnglat.lat],
          content: '<span class="tv-pin tv-pin-num' + (isStart ? '' : ' tv-pin-end') + '">' + (isStart ? '起' : '终') + '</span>',
          anchor: 'center',
          zIndex: 60
        });
        map.add(marker);
        routeStops.push({
          p: { id: 'ab-' + Date.now(), name: isStart ? '图上起点' : '图上终点', x: e.lnglat.lng, y: e.lnglat.lat },
          marker,
          custom: true
        });
        renderRouteStops();
        if (routeStops.length >= 2) planRoute();
        else routeSummaryEl.innerHTML = '';
      });
      abTabEl.addEventListener('click', () => {
        abMode = !abMode;
        abTabEl.classList.toggle('active', abMode);
        routeHintEl.textContent = abMode ? '在地图上点击设置起点，再次点击设置终点' : '点击地图上的景点或地点标记，依次加入路线';
        if (abMode) clearRouteStops();
      });

      /** 【旅行功能的实现】附近景点渲染——根据地图中心 haversine 距离 5km 内
       * - 计算中心到每个点的距离 → 筛选 ≤5km → 排序 → 渲染横向卡片 + 标题栏计数
       */
      function updateNearby() {
        /* cleanup 竞态防护：500ms 延迟触发时页面可能已销毁（map 已 destroy 置空） */
        if (!map || !map.getCenter) return;
        const center = map.getCenter();
        const nearbyList = points
          .filter(p => p.x != null && p.y != null)
          .map(p => ({ ...p, distance: haversineKm(center.lat, center.lng, p.y, p.x) }))
          .filter(p => p.distance <= 5)
          .sort((a, b) => a.distance - b.distance);

        const scrollEl = contentEl.querySelector('#nearby-scroll');
        const sectionEl = contentEl.querySelector('#nearby-section');
        if (!scrollEl) return;

        // 标题栏右侧实时计数（结构即信息：随地图移动更新）
        const metaEl = contentEl.querySelector('#nearby-meta');
        if (metaEl) {
          metaEl.textContent = nearbyList.length ? '5km 内 ' + nearbyList.length + ' 处' : '5km 内暂无景点';
        }

        if (!nearbyList.length) {
          if (sectionEl) sectionEl.style.display = 'none';
          return;
        }
        if (sectionEl) sectionEl.style.display = '';

        /* 大图卡：距离徽章悬浮图左上，名称压图底部（渐隐遮罩保证可读） */
        scrollEl.innerHTML = nearbyList.slice(0, 20).map(p => `
          <div class="nearby-card" data-id="${p.id}">
            ${p.image ? '<div class="nearby-card-img"><img src="' + imgUrl(p.image) + '" alt="" onerror="imgError(event)"/></div>' : ''}
            <span class="nearby-card-badge">${p.distance.toFixed(1)}km</span>
            <div class="nearby-card-info">
              <div class="nearby-card-name">${escapeHtml(p.name || '未命名')}</div>
            </div>
          </div>
        `).join('');

        // 绑定点击跳转
        scrollEl.querySelectorAll('.nearby-card').forEach(card => {
          card.addEventListener('click', () => {
            navigate('/attraction/' + card.dataset.id);
          });
        });
      }

      // 绑定 moveend 事件
      map.on('moveend', updateNearby);

      // 初始加载后立即触发一次附近景点计算（句柄交 cleanup 清理，防销毁后触发）
      nearbyTimer = setTimeout(updateNearby, 500);
    }
  }

  /** 【旅行功能的实现】cleanup 清理函数——页面销毁时销毁高德地图实例
   * - map.destroy() 释放地图容器、覆盖物与事件监听（高德 JS API 销毁接口）
   */
  return () => {
    if (nearbyTimer) {
      clearTimeout(nearbyTimer);
      nearbyTimer = null;
    }
    if (map) {
      map.destroy();
      map = null;
    }
  };
}
