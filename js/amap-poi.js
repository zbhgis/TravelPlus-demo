/**
 * 【地图POI热点的实现】底图 POI 点击详情 + 平台联动（高德 JS API 2.0 官方能力，全站地图共用）
 * 能力：开启地图热点后，底图上的 POI（景点/商铺/餐饮等）可点击，
 *       点击 → AMap.PlaceSearch.getDetails(poiId) → InfoWindow 展示详情；
 *       并按坐标就近匹配本平台景点（≤500m）——命中时在气泡中追加「本平台收录」区块
 *       （平台评分 + 查看详情按钮直达景点页），未命中提供「在高德地图搜索」外链。
 * 依赖：AMap.PlaceSearch 插件（index.html 脚本 plugin 参数已引入）；地图创建时需传 isHotspot: true。
 * 用法：
 *   const map = new AMap.Map(el, { isHotspot: true, ... });
 *   enablePoiHotspot(map, { attractions: [{id, name, x, y, score}] });  // score 为 ×10 量纲，可省略
 *   // 路线模式等场景可用 onPoiClick(e) 钩子接管点击（返回 true 跳过详情气泡），
 *   // 配合 lookupPoi(poiId) 异步取 POI 名称。
 * 细节：
 *  - hotspotclick 事件负载含 POI id / lnglat（/ name），按 id 查详情；
 *  - 请求序号防竞态：连续快速点击不同 POI 时，过期响应直接丢弃，气泡始终跟随最后一次点击；
 *  - 查无详情（如部分热点无收录信息）时降级展示热点名称/坐标，不弹空白窗体；
 *  - 每个地图实例独立 InfoWindow（闭包持有），随 map.destroy() 一并销毁；
 *  - POI 名称/地址等第三方数据插入 innerHTML 前一律 HTML 转义（XSS 防护）。
 */

/** 【XSS 防护】HTML 转义 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

/** 单例 PlaceSearch（getDetails 无状态，全局复用一次构造） */
let sharedPlaceSearch = null;
function getPlaceSearch() {
  if (!sharedPlaceSearch) sharedPlaceSearch = new AMap.PlaceSearch({});
  return sharedPlaceSearch;
}

/**
 * 【地图POI热点的实现】按高德 POI id 查详情（外部复用：路线模式点击 POI 加停靠点时取名称等）
 * @param {string|number} poiId 高德 POI id
 * @returns {Promise<Object|null>} 命中返回 poi 对象（name/address/tel/type/location），未命中/失败返回 null
 */
export function lookupPoi(poiId) {
  return new Promise(resolve => {
    if (typeof window.AMap === 'undefined' || poiId == null) { resolve(null); return; }
    getPlaceSearch().getDetails(String(poiId), (status, result) => {
      resolve(status === 'complete' && result && result.info === 'OK'
        && result.poiList && result.poiList.pois && result.poiList.pois[0] || null);
    });
  });
}

/** 【平台联动的实现】Haversine 球面距离（米）——POI 与平台景点就近匹配用直线距离 */
function haversineMeters(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
    + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * 6371000.0 * Math.asin(Math.sqrt(a));
}

/** 【平台联动的实现】就近匹配平台景点：距 POI ≤500m 视为同一地点（返回 null=未收录） */
function matchAttraction(lnglat, attractions) {
  if (!lnglat || !attractions || !attractions.length) return null;
  let best = null;
  let bestD = Infinity;
  for (const a of attractions) {
    if (!a || a.x == null || a.y == null) continue;
    const d = haversineMeters(lnglat.getLat(), lnglat.getLng(), a.y, a.x);
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  return bestD <= 500 ? best : null;
}

/** 【平台联动的实现】平台区块：收录标识 + 平台评分 + 查看详情按钮 */
function platformHtml(a) {
  const parts = ['<div class="poi-platform">'];
  parts.push('<div class="poi-platform-tag">本平台收录</div>');
  if (a.score != null && !isNaN(a.score)) {
    parts.push('<div class="poi-info-row"><span class="poi-info-label">平台评分</span>★ ' + (a.score / 10).toFixed(1) + '</div>');
  }
  parts.push('<a class="poi-platform-btn" href="#/attraction/' + encodeURIComponent(a.id) + '">查看详情</a>');
  parts.push('</div>');
  return parts.join('');
}

/** 详情气泡内容：AMap 数据 + 平台联动区块（或高德搜索外链） */
function poiInfoHtml(poi, lnglat, attractions) {
  const rows = [];
  rows.push('<div class="poi-info-name">' + escapeHtml(poi.name || '兴趣点') + '</div>');
  const addr = Array.isArray(poi.address) ? poi.address.join('') : poi.address;
  if (addr) rows.push('<div class="poi-info-row"><span class="poi-info-label">地址</span>' + escapeHtml(addr) + '</div>');
  const tel = Array.isArray(poi.tel) ? poi.tel.join('、') : poi.tel;
  if (tel) rows.push('<div class="poi-info-row"><span class="poi-info-label">电话</span>' + escapeHtml(tel) + '</div>');
  if (poi.type) rows.push('<div class="poi-info-row"><span class="poi-info-label">类型</span>' + escapeHtml(poi.type) + '</div>');

  const matched = matchAttraction(lnglat, attractions);
  if (matched) {
    rows.push(platformHtml(matched));
  } else if (poi.name) {
    rows.push('<a class="poi-info-link" target="_blank" rel="noopener" href="https://www.amap.com/search?query=' + encodeURIComponent(poi.name) + '">在高德地图搜索</a>');
  }
  return '<div class="poi-info-card">' + rows.join('') + '</div>';
}

/** 降级内容：热点名称（或坐标），用于查无详情场景 */
function fallbackHtml(hotspot, lnglat, attractions) {
  const name = hotspot && hotspot.name ? escapeHtml(hotspot.name) : '兴趣点';
  const coord = lnglat ? lnglat.getLng().toFixed(6) + ', ' + lnglat.getLat().toFixed(6) : '';
  let html = '<div class="poi-info-card"><div class="poi-info-name">' + name + '</div>'
    + (coord ? '<div class="poi-info-row"><span class="poi-info-label">坐标</span>' + coord + '</div>' : '');
  const matched = matchAttraction(lnglat, attractions);
  html += matched ? platformHtml(matched) : '</div>';
  return html;
}

/**
 * 开启地图底图 POI 点击详情 + 平台联动（幂等：同一实例重复调用只绑定一次）
 * @param {AMap.Map} map 已创建的地图实例（创建时需传 isHotspot: true）
 * @param {{attractions?: Array<{id,name,x,y,score?}>, onPoiClick?: Function}} [opts]
 *   - attractions：平台景点候选集（就近匹配用；可省略）
 *   - onPoiClick(e)：可选自定义点击钩子（路线模式加停靠点用）。返回 true 表示已消费本次点击，
 *     跳过默认详情气泡；返回 false/未设置走默认气泡。
 */
export function enablePoiHotspot(map, { attractions = null, onPoiClick = null } = {}) {
  if (!map || typeof window.AMap === 'undefined' || map.__poiHotspotBound) return;
  map.__poiHotspotBound = true;

  let infoWindow = null;
  let seq = 0; // 请求序号：只让最后一次点击的详情回填气泡（防过期响应覆盖）

  map.on('hotspotclick', e => {
    if (!e || !e.id || !e.lnglat) return;
    // 自定义钩子优先（返回 true = 已消费，不弹气泡）
    if (typeof onPoiClick === 'function' && onPoiClick(e) === true) return;

    const mySeq = ++seq;
    if (!infoWindow) infoWindow = new AMap.InfoWindow({ offset: new AMap.Pixel(0, -32) });
    infoWindow.setContent('<div class="poi-info-card"><div class="poi-info-loading">加载中…</div></div>');
    infoWindow.open(map, e.lnglat);

    getPlaceSearch().getDetails(String(e.id), (status, result) => {
      if (mySeq !== seq) return; // 已被更新点击取代：丢弃过期响应
      const poi = (status === 'complete' && result && result.info === 'OK'
        && result.poiList && result.poiList.pois && result.poiList.pois[0]) || null;
      if (poi) {
        infoWindow.setContent(poiInfoHtml(poi, e.lnglat, attractions));
        infoWindow.open(map, poi.location || e.lnglat);
      } else {
        infoWindow.setContent(fallbackHtml(e, e.lnglat, attractions));
        infoWindow.open(map, e.lnglat);
      }
    });
  });
}
