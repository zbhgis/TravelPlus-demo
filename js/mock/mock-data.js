/**
 * 【演示数据】TravelPlus 演示版模拟数据（纯前端运行，无需后端）
 * - 用户/景点/游记/门票/订单/消息等全部内存数据，图片用 picsum 稳定 seed（刷新不变样）
 * - 景点坐标为真实 GCJ-02 经纬度，地图标记/路线规划可真实联动
 * - 秒杀窗口动态取「当前时间起 7 天内」，演示永远有效
 * 仅供演示用途，数据均为虚构
 */

/** 占位图：本地 img/{seed}.svg（渐变装饰图，零外部依赖；文件由 gen 脚本批量生成） */
const pic = (seed, w = 480, h = 360) => `img/${seed}.svg`;

/** 当前登录演示用户（id=1） */
export const ME = {
  id: 1,
  nickName: '演示旅行家',
  avatar: pic('avatar-me', 200, 200),
  signature: '山河湖海，都不如出发',
  phone: '13800000000',
  bgImage: pic('bg-me', 900, 500)
};

export const USERS = [
  { id: 2, nickName: '西湖漫步者', avatar: pic('u2', 200, 200), signature: '杭州土著 · 每周打卡一个新角落' },
  { id: 3, nickName: '山海旅行日记', avatar: pic('u3', 200, 200), signature: '已走过 38 个城市' },
  { id: 4, nickName: '爱吃的小鹿', avatar: pic('u4', 200, 200), signature: '旅行是为了吃当地的小馆子' },
  { id: 5, nickName: '背包客老周', avatar: pic('u5', 200, 200), signature: '穷游十年，路线规划爱好者' },
  { id: 6, nickName: '朵朵妈', avatar: pic('u6', 200, 200), signature: '亲子游攻略持续更新中' },
  { id: 7, nickName: '南方的南', avatar: pic('u7', 200, 200), signature: '厦门常驻，海边日落收集者' },
  { id: 8, nickName: '镜头里的风', avatar: pic('u8', 200, 200), signature: '摄影出片机位研究 ' },
  { id: 9, nickName: '高铁侠', avatar: pic('u9', 200, 200), signature: '周末高铁党，说走就走' },
  { id: 10, nickName: '小小旅行家', avatar: pic('u10', 200, 200), signature: '大学生特种兵玩法研究' }
];

/** 景点类型 */
export const TYPES = [
  { id: 1, name: '自然风光' },
  { id: 2, name: '人文古迹' },
  { id: 3, name: '其他' }
];

/** 景点（x=经度 y=纬度，GCJ-02；typeId 对应 TYPES） */
export const ATTRACTIONS = [
  { id: 1, name: '西湖风景名胜区', destination: '杭州', area: '西湖景区', address: '龙井路 1 号', openHours: '全天', avgScore: 46, score: 46, avgPrice: 4750, hasTicket: true, hasSeckill: true, checkinCount: 12800, sold: 9200, x: 120.1446, y: 30.2431, typeId: 1, images: pic('westlake1') + ',' + pic('westlake2') + ',' + pic('westlake3'), description: '杭州的名片，湖光山色四时不同。苏堤春晓、断桥残雪等十景串联，环湖免费开放。' },
  { id: 2, name: '灵隐寺', destination: '杭州', area: '西湖景区', address: '法云弄 1 号', openHours: '06:30-18:00', avgScore: 46, score: 46, avgPrice: 7500, hasTicket: true, hasSeckill: false, checkinCount: 9600, sold: 7100, x: 120.0976, y: 30.2418, typeId: 2, images: pic('lingyin1') + ',' + pic('lingyin2'), description: '东晋古刹，飞来峰造像与冷泉溪谷禅意十足，清晨人最少。' },
  { id: 3, name: '雷峰塔', destination: '杭州', area: '西湖南线', address: '南山路 15 号', openHours: '08:00-19:00', avgScore: 47, score: 47, avgPrice: 4000, hasTicket: true, hasSeckill: false, checkinCount: 6300, sold: 4800, x: 120.1489, y: 30.2318, typeId: 2, images: pic('leifeng1') + ',' + pic('leifeng2'), description: '夕阳把塔身染金的时候最好看，可俯瞰西湖全景。' },
  { id: 4, name: '宋城景区', destination: '杭州', area: '之江', address: '之江路 148 号', openHours: '10:00-21:00', avgScore: 49, score: 49, avgPrice: 19900, hasTicket: true, hasSeckill: true, checkinCount: 8900, sold: 8100, x: 120.1198, y: 30.1863, typeId: 3, images: pic('songcheng1') + ',' + pic('songcheng2'), description: '《宋城千古情》演出是灵魂，穿越街市互动感强，雨天首选。' },
  { id: 5, name: '西溪国家湿地公园', destination: '杭州', area: '西湖区', address: '天目山路 518 号', openHours: '08:00-17:30', avgScore: 49, score: 49, avgPrice: 8000, hasTicket: true, hasSeckill: false, checkinCount: 5400, sold: 3900, x: 120.0604, y: 30.2724, typeId: 1, images: pic('xixi1') + ',' + pic('xixi2'), description: '城市里的湿地秘境，摇橹船穿行芦苇荡，秋日芦花胜雪。' },
  { id: 6, name: '清河坊历史街区', destination: '杭州', area: '上城', address: '河坊街', openHours: '全天', avgScore: 44, score: 44, avgPrice: 0, hasTicket: false, hasSeckill: false, checkinCount: 7200, sold: 0, x: 120.1662, y: 30.2446, typeId: 3, images: pic('qinghefang1'), description: '老杭州烟火气，胡庆余堂、方回春堂都在这条街上，小吃集中。' },
  { id: 7, name: '九溪烟树', destination: '杭州', area: '西湖景区', address: '龙井路南端', openHours: '全天', avgScore: 48, score: 48, avgPrice: 0, hasTicket: false, hasSeckill: false, checkinCount: 3100, sold: 0, x: 120.1178, y: 30.2108, typeId: 1, images: pic('jiuxi1'), description: '溪水、茶园、枫叶构成的徒步路线，从龙井村一路走到钱塘江。' },
  { id: 8, name: '京杭大运河（拱宸桥段）', destination: '杭州', area: '拱墅', address: '拱宸桥', openHours: '全天', avgScore: 45, score: 45, avgPrice: 0, hasTicket: false, hasSeckill: false, checkinCount: 2600, sold: 0, x: 120.1405, y: 30.3232, typeId: 2, images: pic('canal1'), description: '运河夜游灯光一流，桥西历史街区适合慢慢逛。' },
  { id: 9, name: '杭州乐园', destination: '杭州', area: '萧山', address: '湘湖路', openHours: '09:30-17:00', avgScore: 47, score: 47, avgPrice: 23000, hasTicket: true, hasSeckill: false, checkinCount: 4100, sold: 3600, x: 120.2657, y: 30.1536, typeId: 3, images: pic('park1'), description: '过山车与水世界一票通玩，亲子和团建都合适。' },
  { id: 10, name: '六和塔', destination: '杭州', area: '之江', address: '之江路 16 号', openHours: '07:00-17:30', avgScore: 46, score: 46, avgPrice: 3000, hasTicket: true, hasSeckill: false, checkinCount: 2200, sold: 1700, x: 120.1297, y: 30.1962, typeId: 2, images: pic('liuhe1'), description: '钱塘江大桥最佳机位，塔内旋梯登高望江。' },
  { id: 11, name: '龙井村', destination: '杭州', area: '西湖景区', address: '龙井路', openHours: '全天', avgScore: 46, score: 46, avgPrice: 0, hasTicket: false, hasSeckill: false, checkinCount: 2900, sold: 0, x: 120.1016, y: 30.2241, typeId: 1, images: pic('longjing1'), description: '茶山层叠，找一家茶农小院喝一杯明前龙井。' },
  { id: 12, name: '良渚古城遗址公园', destination: '杭州', area: '余杭', address: '良渚街道', openHours: '09:00-16:00', avgScore: 47, score: 47, avgPrice: 6000, hasTicket: true, hasSeckill: false, checkinCount: 3300, sold: 2500, x: 120.0002, y: 30.3611, typeId: 2, images: pic('liangzhu1'), description: '五千年文明实证，鹿苑与莫角山宫殿区很出片。' },
  { id: 13, name: '鼓浪屿', destination: '厦门', area: '思明', address: '轮渡码头对面', openHours: '全天', avgScore: 47, score: 47, avgPrice: 3500, hasTicket: true, hasSeckill: false, checkinCount: 15300, sold: 12100, x: 118.0672, y: 24.4444, typeId: 1, images: pic('gulangyu1') + ',' + pic('gulangyu2'), description: '万国建筑与琴声的小岛，提前订船票，避开节假日高峰。' },
  { id: 14, name: '曾厝垵', destination: '厦门', area: '思明', address: '环岛南路', openHours: '全天', avgScore: 43, score: 43, avgPrice: 0, hasTicket: false, hasSeckill: false, checkinCount: 8800, sold: 0, x: 118.1122, y: 24.4337, typeId: 3, images: pic('zengcuoan1'), description: '文艺渔村变身小吃集散地，晚上比白天热闹。' },
  { id: 15, name: '南普陀寺', destination: '厦门', area: '思明', address: '思明南路 515 号', openHours: '03:00-18:00', avgScore: 46, score: 46, avgPrice: 0, hasTicket: false, hasSeckill: false, checkinCount: 6100, sold: 0, x: 118.0979, y: 24.4403, typeId: 2, images: pic('nanputuo1'), description: '闽南海鲜味的素饼出名，后山五老峰可俯瞰厦大与海。' },
  { id: 16, name: '环岛路', destination: '厦门', area: '思明', address: '环岛南路', openHours: '全天', avgScore: 46, score: 46, avgPrice: 0, hasTicket: false, hasSeckill: false, checkinCount: 5700, sold: 0, x: 118.1288, y: 24.4371, typeId: 1, images: pic('huandao1'), description: '租一辆自行车沿海骑行，椰风寨到会展中心段最美。' },
  { id: 17, name: '厦门园林植物园', destination: '厦门', area: '思明', address: '虎园路 25 号', openHours: '06:30-18:00', avgScore: 47, score: 47, avgPrice: 3000, hasTicket: true, hasSeckill: false, checkinCount: 4900, sold: 3600, x: 118.0931, y: 24.4498, typeId: 1, images: pic('shizilin1'), description: '多肉植物区像走进沙漠花园，雨林世界喷雾时段仙气十足。' },
  { id: 18, name: '沙坡尾', destination: '厦门', area: '思明', address: '大学路', openHours: '全天', avgScore: 44, score: 44, avgPrice: 0, hasTicket: false, hasSeckill: false, checkinCount: 5200, sold: 0, x: 118.0898, y: 24.4365, typeId: 3, images: pic('shapowei1'), description: '避风坞变身艺术西区，咖啡与市集，日落时分最好看。' },
  { id: 19, name: '胡里山炮台', destination: '厦门', area: '思明', address: '曾厝垵路 2 号', openHours: '08:00-17:30', avgScore: 43, score: 43, avgPrice: 2300, hasTicket: true, hasSeckill: false, checkinCount: 3100, sold: 2400, x: 118.1174, y: 24.4292, typeId: 2, images: pic('hulishan1'), description: '克虏伯大炮与红顶炮兵操演，配环岛路一起逛。' },
  { id: 20, name: '中山路步行街', destination: '厦门', area: '思明', address: '中山路', openHours: '全天', avgScore: 43, score: 43, avgPrice: 0, hasTicket: false, hasSeckill: false, checkinCount: 6900, sold: 0, x: 118.0786, y: 24.4561, typeId: 3, images: pic('zhongshanlu1'), description: '骑楼老街，沙茶面与花生汤的宝藏聚集地。' },
  { id: 21, name: '集美学村', destination: '厦门', area: '集美', address: '嘉庚路', openHours: '全天', avgScore: 45, score: 45, avgPrice: 0, hasTicket: false, hasSeckill: false, checkinCount: 3800, sold: 0, x: 118.0965, y: 24.5646, typeId: 2, images: pic('jimei1'), description: '嘉庚建筑红砖燕尾脊，龙舟池畔安静出片。' },
  { id: 22, name: '五缘湾湿地公园', destination: '厦门', area: '湖里', address: '五缘湾', openHours: '全天', avgScore: 45, score: 45, avgPrice: 0, hasTicket: false, hasSeckill: false, checkinCount: 2400, sold: 0, x: 118.1759, y: 24.5083, typeId: 1, images: pic('wuyuanwan1'), description: '黑天鹅与红树林栈道，人少清净的本地后花园。' }
];

/** 游记（userId 关联 USERS；attractionId 关联景点） */
export const NOTES = [
  { id: 101, userId: 2, title: '杭州一日游不走回头路！亲测这条路线绝了', liked: 1280, likedByMe: false, attractionId: 1, createTime: '2026-11-02 10:20', images: pic('n101a') + ',' + pic('n101b') + ',' + pic('n101c'), content: '周末带爸妈走了一条西湖一日游路线，全程不走回头路：早上从断桥入口进白堤，人少光线好，拍完照沿孤山路到平湖秋月；中午在孤山脚下的楼外楼吃了西湖醋鱼（要提前排号）；下午从苏堤南口进，一路走到花港观鱼，正好赶上夕阳；晚饭去河坊街吃小吃。交通建议地铁 1 号线龙翔桥站出站步行 5 分钟。全程步数 1.8 万，爸妈走得动，节奏刚刚好。最重要的是整条线不用回头，每个点的出片率都很高。' },
  { id: 102, userId: 8, title: '灵隐寺清晨 6 点半的体验｜附飞来峰机位', liked: 940, likedByMe: false, attractionId: 2, createTime: '2026-10-28 08:15', images: pic('n102a') + ',' + pic('n102b'), content: '赶在 6 点半开门就进去，香火混着山雾，整个寺院只有鸟叫。飞来峰造像在冷泉溪对岸，晨光斜打在石窟上最好拍。路线：先看造像再上香，最后绕到永福寺的小院喝茶。注意：灵隐寺门票不含飞来峰，需要分开买。从市区打车 25 分钟，7 点半以后就开始堵，一定趁早。' },
  { id: 103, userId: 6, title: '带娃亲子游｜杭州乐园一票通玩攻略', liked: 620, likedByMe: false, attractionId: 9, createTime: '2026-10-20 18:40', images: pic('n103a') + ',' + pic('n103b') + ',' + pic('n103c'), content: '家娃 6 岁，玩了一天总结：上午进园先玩旋转木马和小火车这种温和项目攒信心，中午在园区餐厅人均 40 解决，下午挑战悬挂过山车（身高 1.2m 以上）。水世界记得自带泳衣和速干毛巾。停车 20/天。强调一下排队智慧：热门项目都在下午人多，上午把过山车刷完是关键。' },
  { id: 104, userId: 7, title: '鼓浪屿避开人流的正确姿势', liked: 1560, likedByMe: false, attractionId: 13, createTime: '2026-11-05 20:10', images: pic('n104a') + ',' + pic('n104b') + ',' + pic('n104c'), content: '在厦门住了五年，总结鼓浪屿的正确打开方式：1. 提前在「厦门轮渡」公众号订早上 7 点的船，游客要买往返票；2. 上岛直奔内厝澳码头一侧，人比三丘田少一半；3. 笔山路和鸡山路的老别墅最适合拍照；4. 中午在龙头路吃沙茶面，认准本地人排队的店；5. 下午 4 点去月光岩看日落，比日光岩视野不差还免费。' },
  { id: 105, userId: 3, title: '西溪湿地摇橹船半日慢游记', liked: 480, likedByMe: false, attractionId: 5, createTime: '2026-10-15 14:30', images: pic('n105a') + ',' + pic('n105b'), content: '从周家村主入口进，摇橹船 100 元/小时可坐 6 人，AA 下来很便宜。船娘一路讲湿地故事，穿过芦苇荡的时候整船人都在按快门。秋天的芦花和柿子林是十月限定。下船后去深潭口看古戏台，周末有越剧演出。整个节奏非常松弛，适合想躲开人潮的下午。' },
  { id: 106, userId: 4, title: '河坊街觅食地图：本地人才去的小馆子', liked: 720, likedByMe: false, attractionId: 6, createTime: '2026-11-08 12:00', images: pic('n106a') + ',' + pic('n106b') + ',' + pic('n106c'), content: '河坊街不只是游客街！巷子里的宝藏：1. 游埠豆浆的咸豆浆+油条，早上 6 点去不用排队；2. 皇饭儿神仙鸡，半只起卖；3. 孙奶奶葱包烩，藏在回春堂隔壁的小推车；4. 江南面王片儿川。人均 50 能吃到扶墙走。' },
  { id: 107, userId: 5, title: '穷游杭州两天一夜，人均 300 的路线', liked: 2100, likedByMe: false, attractionId: 1, createTime: '2026-09-28 22:05', images: pic('n107a') + ',' + pic('n107b'), content: '大学生特种兵玩法：住青旅床位 60/晚（龙翔桥附近）；Day1 西湖环湖徒步+浙大之江校区；Day2 早起爬宝石山看日出，然后运河夜游。吃饭全靠社区食堂和连锁快餐，两天吃住行 300 搞定。核心经验：景点全免费的部分其实比收费的更好玩。' },
  { id: 108, userId: 9, title: '雨天的宋城，反而玩出了精华感', liked: 560, likedByMe: false, attractionId: 4, createTime: '2026-10-25 19:55', images: pic('n108a') + ',' + pic('n108b'), content: '原计划泡汤的行程，结果雨天宋城人少了一半，千古情演出第一排随便选。穿越街的 NPC 演员雨天还在敬业营业，互动感拉满。记得看场次表：千古情一天 4 场，建议买下午第一场，看完还能逛夜场。雨衣园区卖 15，自带更划算。' },
  { id: 109, userId: 10, title: '厦门植物园仙人掌区也太出片了！', liked: 830, likedByMe: false, attractionId: 17, createTime: '2026-11-01 16:20', images: pic('n109a') + ',' + pic('n109b'), content: '从西门进直接坐观光车到多肉植物区，几百种仙人掌造景，随便拍都是杂志感。雨林世界的喷雾每天固定两场（10 点和 15 点），喷雾时逆光拍剪影绝了。门票 30，学生半价。穿浅色衣服出片率翻倍。' },
  { id: 110, userId: 2, title: '六和塔看钱塘江大桥的黄昏', liked: 350, likedByMe: false, attractionId: 10, createTime: '2026-10-12 17:45', images: pic('n110a'), content: '小众到几乎没人写的点：六和塔顶层望钱塘江大桥，绿皮火车从桥上驶过的时候按下快门。塔内旋梯很窄，登塔限流要等一会儿。联票 30 含登塔。配九溪烟树一起，半天足够。' },
  { id: 111, userId: 7, title: '沙坡尾日落指南：避风坞的最佳机位', liked: 610, likedByMe: false, attractionId: 18, createTime: '2026-10-30 18:30', images: pic('n111a') + ',' + pic('n111b'), content: '日落前 40 分钟到艺术西区天台占位，渔船、旧厂区、晚霞同框。拍完直接在大学路吃晚饭：亚海大排档的海蛎煎和面线糊。周末有创意市集，平日更安静。' },
  { id: 112, userId: 3, title: '良渚五千年的秋天，值得专门跑一趟', liked: 440, likedByMe: false, attractionId: 12, createTime: '2026-11-03 11:50', images: pic('n112a') + ',' + pic('n112b'), content: '遗址公园的秋天是稻田色的，鹿苑的小鹿会追着买鹿饼的人跑。讲解器必租（20 元），否则看到的只是土坡草皮。地铁 2 号线到良渚站转公交。注意 16:00 停止入园，慢慢逛要 3 小时。' }
];

/** 游记评论 */
export const NOTE_COMMENTS = {
  101: [
    { id: 1, userId: 4, content: '楼外楼要排多久呀？想周末去', createTime: '2026-11-03 09:10' },
    { id: 2, userId: 9, content: '苏堤傍晚真的绝，上周刚去过', createTime: '2026-11-04 20:30' }
  ],
  104: [
    { id: 3, userId: 3, content: '月光岩这个点收藏了！', createTime: '2026-11-06 08:20' }
  ]
};

/** 景点评论 */
export const ATTRACTION_COMMENTS = {
  1: [
    { id: 1, userId: 3, score: 5, content: '环湖走了三小时，风景没话说，免费部分就很精彩。', createTime: '2026-11-01 15:20' },
    { id: 2, userId: 6, score: 4, content: '节假日人很多，建议工作日早上去。', createTime: '2026-10-26 10:05' }
  ],
  2: [
    { id: 3, userId: 8, score: 5, content: '清晨去体验最好，禅意十足。', createTime: '2026-10-28 09:00' }
  ],
  4: [
    { id: 4, userId: 9, score: 5, content: '千古情演出值回票价。', createTime: '2026-10-25 20:15' }
  ]
};

/**
 * 门票：秒杀场次窗口动态生成（当前时间起，永远有效）
 * - 西湖游船秒杀票 ¥0.01（库存 12）；宋城秒杀 ¥99（库存 8）；灵隐寺普通票
 */
const now = Date.now();
const hour = 3600 * 1000;
export const TICKETS = [
  { id: 10, attractionId: 1, title: '西湖游船秒杀票', subTitle: '限时特惠', rules: '每人限购 1 张\n凭二维码核销\n不可退改', payValue: 1, actualValue: 5500, type: 1, status: 1, stock: 12, beginTime: new Date(now - hour).toISOString(), endTime: new Date(now + 7 * 24 * hour).toISOString() },
  { id: 40, attractionId: 4, title: '宋城千古情秒杀票', subTitle: '含演出 B 区', rules: '每人限购 1 张\n凭二维码核销\n不可退改', payValue: 9900, actualValue: 19900, type: 1, status: 1, stock: 8, beginTime: new Date(now - hour).toISOString(), endTime: new Date(now + 7 * 24 * hour).toISOString() },
  { id: 41, attractionId: 2, title: '灵隐寺飞来峰联票', subTitle: '成人票', rules: '凭码入园\n可退改', payValue: 7500, actualValue: 7500, type: 0, status: 1, stock: 50, beginTime: null, endTime: null }
];

export const SECKILL_TICKETS = [
  { ticketId: 10, stock: 12, beginTime: TICKETS[0].beginTime, endTime: TICKETS[0].endTime },
  { ticketId: 40, stock: 8, beginTime: TICKETS[1].beginTime, endTime: TICKETS[1].endTime }
];

/** 初始订单（statusText 前端映射；createTime 近期） */
export const ORDERS = [
  { id: '660496237035782101', userId: 1, ticketId: 41, ticketName: '灵隐寺飞来峰联票', ticketPrice: 7500, payType: 1, status: 2, createTime: '2026-11-08 09:12', payTime: '2026-11-08 09:15' },
  { id: '660496237035782102', userId: 1, ticketId: 10, ticketName: '西湖游船秒杀票', ticketPrice: 1, payType: 1, status: 3, createTime: '2026-11-05 14:30', payTime: '2026-11-05 14:31', useTime: '2026-11-06 10:02' },
  { id: '660496237035782103', userId: 1, ticketId: 40, ticketName: '宋城千古情秒杀票', ticketPrice: 9900, payType: 1, status: 1, createTime: '2026-11-12 20:41' }
];

/** 钱包/积分 */
export const WALLET = { balance: 12850, points: 2360, signDays: 5 };
export const BALANCE_RECORDS = [
  { id: 1, type: 'recharge', title: '余额充值', amount: 5000, createTime: '2026-11-01 10:00' },
  { id: 2, type: 'pay', title: '灵隐寺飞来峰联票', amount: -7500, createTime: '2026-11-08 09:15' }
];
export const POINTS_RECORDS = [
  { id: 1, type: 'sign', title: '每日签到', amount: 5, createTime: '2026-11-15 08:00' },
  { id: 2, type: 'order', title: '下单奖励', amount: 50, createTime: '2026-11-08 09:15' }
];

/** 私信会话与消息 */
export const CHAT_SESSIONS = [
  { peerId: 2, lastMessage: '苏堤那边傍晚人不多，放心去', lastTime: '2026-11-14 21:10', pinned: true },
  { peerId: 7, lastMessage: '鼓浪屿船票记得提前订', lastTime: '2026-11-13 18:20', pinned: false }
];
export const CHAT_MESSAGES = {
  2: [
    { id: 1, fromUserId: 2, content: '看到你发的西湖路线了，写得很细！', createTime: '2026-11-14 21:05' },
    { id: 2, fromUserId: 1, content: '谢谢！带家人去的，节奏比较慢', createTime: '2026-11-14 21:08' },
    { id: 3, fromUserId: 2, content: '苏堤那边傍晚人不多，放心去', createTime: '2026-11-14 21:10' }
  ],
  7: [
    { id: 4, fromUserId: 7, content: '鼓浪屿船票记得提前订', createTime: '2026-11-13 18:20' }
  ]
};

/** 通知（赞/关注/评论） */
export const NOTIFICATIONS = [
  { id: 1, category: 'likes', userId: 3, noteId: 101, content: '赞了你的游记《杭州一日游不走回头路》', createTime: '2026-11-10 12:00' },
  { id: 2, category: 'follows', userId: 5, content: '关注了你', createTime: '2026-11-09 18:30' },
  { id: 3, category: 'comments', userId: 4, noteId: 101, content: '评论了你的游记：楼外楼要排多久呀？', createTime: '2026-11-03 09:10' }
];

/** 旅行计划（items 用 trip-detail 消费的扁平字段：attractionId/attractionName/attractionImage） */
const A = id => ATTRACTIONS.find(a => a.id === id);
const item = (attractionId, time) => {
  const a = A(attractionId);
  return { attractionId, attractionName: a.name, attractionImage: a.images.split(',')[0], time };
};
export const TRIPS = [
  {
    id: 1, userId: 1, title: '杭州周末两日游', destination: '杭州', startDate: '2026-11-21', days: 2, status: 1,
    days: [
      { day: 1, items: [item(1, '上午'), item(3, '下午'), item(6, '晚上')] },
      { day: 2, items: [item(2, '上午'), item(5, '下午')] }
    ]
  },
  {
    id: 2, userId: 1, title: '厦门海边三日', destination: '厦门', startDate: '2026-12-05', days: 3, status: 1,
    days: [
      { day: 1, items: [item(13, '全天')] },
      { day: 2, items: [item(17, '上午'), item(18, '晚上')] },
      { day: 3, items: [item(16, '上午')] }
    ]
  }
];

/** 签到日（本月已签 1/2/3 号） */
export const SIGN_DAYS = ['2026-11-01', '2026-11-02', '2026-11-03'];

/** 搜索热词 */
export const HOT_KEYWORDS = ['西湖', '灵隐寺', '鼓浪屿', '宋城', '西溪湿地', '沙坡尾', '河坊街', '亲子游', '日落', '免费景点'];

/** 浏览记录（足迹） */
export const BROWSE_RECORDS = [
  { attractionId: 1, createTime: '2026-11-14 10:20' },
  { attractionId: 13, createTime: '2026-11-13 16:40' },
  { attractionId: 4, createTime: '2026-11-12 09:15' }
];

/** AI 助手预置回答（按关键词匹配，兜底通用） */
export const AI_ANSWERS = [
  {
    keywords: ['西湖', '一日游', '一天'],
    tool: 'search_attractions',
    text: '西湖一日游我给你排一条不走回头路的路线：\n\n**上午**：从断桥入口进白堤 → 孤山路 → 平湖秋月（这段 9 点前人少光线好）；\n\n**中午**：孤山脚下的楼外楼吃西湖醋鱼，人均 120 左右[1]；\n\n**下午**：苏堤南口进 → 花港观鱼 → 太子湾公园，正好接上夕阳；\n\n**晚上**：河坊街吃小吃收尾，地铁 1 号线龙翔桥站返程。\n\n小贴士：环湖免费，游船 55 起，雷峰塔登塔 40——预算有限的话都值得，预算紧张就只走堤岸。需要我把这条路线存成旅行计划吗？'
  },
  {
    keywords: ['下雨', '雨天'],
    tool: 'search_attractions',
    text: '下雨天杭州可以这样玩：\n\n1. **宋城千古情**——室内演出为主，雨天反而人少，B 区票性价比高[1]；\n2. **浙江省博物馆（之江馆）**——免费， Ten 万年浙江文明一次看完；\n3. **清河坊**——骑楼能挡雨，胡庆余堂中药博物馆就在街上[2]；\n4. **运河夜游**——雨中拱宸桥灯光别有味道。\n\n雨天游船不建议（湖面湿滑会停航），行程里我把户外段替换掉即可。'
  },
  {
    keywords: ['厦门', '鼓浪屿'],
    tool: 'search_attractions',
    text: '厦门三日我建议这么排：\n\n**Day1 鼓浪屿**：赶 7 点早班船，笔山路老别墅拍照，龙头路吃沙茶面，傍晚月光岩看日落[1]；\n\n**Day2 南线**：厦门园林植物园（喷雾时段 10 点/15 点）→ 南普陀 → 沙坡尾日落[2]；\n\n**Day3 环岛路**：租自行车沿海骑行，胡里山炮台顺路。\n\n住宿推荐中山路附近，去轮渡和各景点都方便。需要帮你把这条行程建到旅行计划里吗？'
  }
];
export const AI_FALLBACK = '这个问题让我想想～基于平台数据给你一些建议：杭州的西湖、灵隐寺、西溪湿地是经典三件套，厦门的鼓浪屿、植物园、沙坡尾适合慢节奏。你可以告诉我出行天数、预算和同行人（亲子/老人/朋友），我帮你排一条具体路线；也可以说「帮我订西湖的秒杀票」，我直接帮你下单。';
