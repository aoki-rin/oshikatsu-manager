import { ActivityEvent, Artist, Venue, OshiColor, ExtensionSource } from '../types';

export const OSHI_COLORS: OshiColor[] = [
  {
    id: 'pink',
    name: 'Sakura Pink',
    jpName: 'サクラピンク',
    colorHex: '#ec4899',
    accentClass: 'bg-pink-500 hover:bg-pink-600 text-white',
    bgLightClass: 'bg-pink-50 border-pink-100',
    textColorClass: 'text-pink-600'
  },
  {
    id: 'blue',
    name: 'Soda Blue',
    jpName: 'ソーダブルー',
    colorHex: '#0ea5e9',
    accentClass: 'bg-sky-500 hover:bg-sky-600 text-white',
    bgLightClass: 'bg-sky-50 border-sky-100',
    textColorClass: 'text-sky-600'
  },
  {
    id: 'green',
    name: 'Melon Green',
    jpName: 'メロングリーン',
    colorHex: '#10b981',
    accentClass: 'bg-emerald-500 hover:bg-emerald-600 text-white',
    bgLightClass: 'bg-emerald-50 border-emerald-100',
    textColorClass: 'text-emerald-600'
  },
  {
    id: 'yellow',
    name: 'Lemon Yellow',
    jpName: 'レモンイエロー',
    colorHex: '#eab308',
    accentClass: 'bg-yellow-500 hover:bg-yellow-600 text-black',
    bgLightClass: 'bg-yellow-50 border-yellow-100',
    textColorClass: 'text-yellow-700'
  },
  {
    id: 'purple',
    name: 'Amethyst Purple',
    jpName: 'アメジストパープル',
    colorHex: '#a855f7',
    accentClass: 'bg-purple-500 hover:bg-purple-600 text-white',
    bgLightClass: 'bg-purple-50 border-purple-100',
    textColorClass: 'text-purple-600'
  },
  {
    id: 'red',
    name: 'Rose Red',
    jpName: 'ローズレッド',
    colorHex: '#ef4444',
    accentClass: 'bg-red-500 hover:bg-red-600 text-white',
    bgLightClass: 'bg-red-50 border-red-100',
    textColorClass: 'text-red-600'
  },
  {
    id: 'black',
    name: 'Obsidian Black',
    jpName: '漆黒ブラック',
    colorHex: '#111827',
    accentClass: 'bg-neutral-800 hover:bg-neutral-900 text-white',
    bgLightClass: 'bg-neutral-50 border-neutral-200',
    textColorClass: 'text-neutral-900'
  },
  {
    id: 'orange',
    name: 'Mandarin Orange',
    jpName: 'みかんオレンジ',
    colorHex: '#f97316',
    accentClass: 'bg-orange-500 hover:bg-orange-600 text-white',
    bgLightClass: 'bg-orange-50 border-orange-100',
    textColorClass: 'text-orange-600'
  }
];

export const INITIAL_ARTISTS: Artist[] = [
  {
    id: 'art-yoasobi',
    name: 'YOASOBI',
    avatarUrl: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?auto=format&fit=crop&w=150&q=80',
    category: 'J-Pop',
    description: '由作曲家Ayase和歌手ikura组成的网红超人气二人组合，代表作《Idol》《群青》。',
    followerCount: 142300,
    tags: ['二次元', '小说改编', 'J-Pop', '天花板']
  },
  {
    id: 'art-hatsune',
    name: '初音ミク (Hatsune Miku)',
    avatarUrl: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=150&q=80',
    category: 'VTuber / Vocaloid',
    description: '世界闻名的虚拟女性歌手，由Crypton Future Media开发，Magical Mirai每年在日本盛大举办。',
    followerCount: 289400,
    tags: ['Vocaloid', '世界第一公主', '虚拟歌手']
  },
  {
    id: 'art-yonezu',
    name: '米津玄師 (Kenshi Yonezu)',
    avatarUrl: 'https://images.unsplash.com/photo-1549417229-aa67d3263c09?auto=format&fit=crop&w=150&q=80',
    category: 'J-Pop',
    description: '日本超级创作型男歌手，代表作《Lemon》《打上花火》《Kick Back》，现场Live具有震撼性张力。',
    followerCount: 195000,
    tags: ['创作神才', '动画OP', '八爷']
  },
  {
    id: 'art-ado',
    name: 'Ado',
    avatarUrl: 'https://images.unsplash.com/photo-1528605248644-14dd04022da1?auto=format&fit=crop&w=150&q=80',
    category: 'Rock/J-Pop',
    description: '日本超人气蒙面女歌手，因《烦死了》一炮走红，拥有极强的唱功与摇滚咆哮音，歌姬代表。',
    followerCount: 125600,
    tags: ['超凡歌姬', '海贼王RED', '不露脸']
  },
  {
    id: 'art-chika-stars',
    name: 'キラメキ☆Starlet',
    avatarUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=150&q=80',
    category: 'Idol',
    description: '活跃于东京秋叶原及新宿Live house的8人地下偶像团体，以元气舞蹈和深厚现场Wota艺互动闻名。',
    followerCount: 8400,
    tags: ['地下偶像', '超现场级', '元气满分', 'チェキ会']
  },
  {
    id: 'art-sakurazaka',
    name: '櫻坂46 (Sakurazaka46)',
    avatarUrl: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?auto=format&fit=crop&w=150&q=80',
    category: 'Idol',
    description: '秋元康制作的日本大型女子偶像组合，具有极高艺术美感与魄力十足的群舞表演。',
    followerCount: 78000,
    tags: ['坂道系', '帅气舞姿', '神曲频出']
  }
];

export const INITIAL_VENUES: Venue[] = [
  {
    id: 'ven-tokyo-dome',
    name: '東京ドーム (Tokyo Dome)',
    capacity: 55000,
    region: '关东 (东京)',
    address: '東京都文京区後楽1-3-61',
    accessInfo: 'JR中央线/总武线「水道桥站」步行5分钟；东京地下铁丸之内线「后乐园站」步行3分钟。',
    imageUrl: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=400&q=80'
  },
  {
    id: 'ven-zepp-haneda',
    name: 'Zepp Haneda (TOKYO)',
    capacity: 2925,
    region: '关东 (东京)',
    address: '東京都大田区羽田空港1-1-4 HANEDA INNOVATION CITY',
    accessInfo: '京稳急行电铁空港线/东京单轨电车「天空桥站」直达。',
    imageUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=400&q=80'
  },
  {
    id: 'ven-saitama-arena',
    name: 'さいたまスーパーアリーナ (Saitama Super Arena)',
    capacity: 37000,
    region: '关东 (埼玉)',
    address: '埼玉県さいたま市中央区新都心8',
    accessInfo: 'JR京滨东北线/宇都宫线/高崎线「埼玉新都心站」下车直达。',
    imageUrl: 'https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?auto=format&fit=crop&w=400&q=80'
  },
  {
    id: 'ven-shinjuku-blaze',
    name: '新宿BLAZE',
    capacity: 800,
    region: '关东 (东京)',
    address: '東京都新宿区歌舞伎町1-21-7',
    accessInfo: '西武新宿线「西武新宿站」步行2分钟；JR/地下铁「新宿站」东口步行6分钟。',
    imageUrl: 'https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=400&q=80'
  },
  {
    id: 'ven-osakajo-hall',
    name: '大阪城ホール (Osaka-Jo Hall)',
    capacity: 16000,
    region: '关西 (大阪)',
    address: '大阪市中央区大阪城3-1',
    accessInfo: 'JR环状线「大阪城公园站」步行5分钟；Osaka Metro长堀鹤见绿地线「商务公园站」步行5分钟。',
    imageUrl: 'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?auto=format&fit=crop&w=400&q=80'
  }
];

export const INITIAL_EVENTS: ActivityEvent[] = [
  {
    id: 'ev-yoasobi-dome',
    title: 'YOASOBI 5th Anniversary Dome Tour 2026 「超現実」',
    artistId: 'art-yoasobi',
    artistName: 'YOASOBI',
    venueId: 'ven-tokyo-dome',
    venueName: '東京ドーム (Tokyo Dome)',
    date: '2026-06-15',
    time: '18:00',
    region: '关东 (东京)',
    platform: 'Ticket Pia',
    price: '¥10,000 - ¥13,500',
    imageUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=400&q=80',
    timeline: {
      lotteryStartDate: '2026-05-15',
      lotteryEndDate: '2026-05-25', // Active now (current date is May 24, 2026)
      generalStartDate: '2026-06-01',
      paymentDeadlineDate: '2025-05-28' // Next week
    },
    originalUrl: 'https://t.pia.jp/pia/yoasobi-5th-dome',
    description: 'YOASOBI成军五周年的首次巨蛋巡回演唱会！东京巨蛋站限定舞台。包含了多首从未现场表演的作品，以及引以为傲的爆红名曲《Idol》超豪华巨蛋版编舞！千万不要错过这场历史性的视听盛宴。',
    category: 'J-Pop',
    tags: ['五周年', '巨蛋', '全网爆款']
  },
  {
    id: 'ev-miku-magical',
    title: '初音ミク 「Magical Mirai 2026」 LIVE & EXHIBITION',
    artistId: 'art-hatsune',
    artistName: '初音ミク (Hatsune Miku)',
    venueId: 'ven-saitama-arena',
    venueName: 'さいたまスーパーアリーナ (Saitama Super Arena)',
    date: '2026-07-24',
    time: '17:00',
    region: '关东 (埼玉)',
    platform: 'eplus',
    price: '¥8,500 - ¥11,000',
    imageUrl: 'https://images.unsplash.com/photo-1601987177651-8edfe6c20009?auto=format&fit=crop&w=400&q=80',
    timeline: {
      lotteryStartDate: '2026-05-20',
      lotteryEndDate: '2026-06-05', // Active now
      generalStartDate: '2026-07-01',
      paymentDeadlineDate: '2026-06-08'
    },
    originalUrl: 'https://eplus.jp/sf/detail/magicalmirai-2026',
    description: '初音未来「魔法未来 2026」巡回埼玉超级竞技场站！主视觉概念以“明日色彩”为主题，展示区包含诸多创作者最新模型及联名画作。LIVE场将带来全新技术投影的初音与其他VOCALOID家族成员联动热唱！',
    category: 'VTuber / Vocaloid',
    tags: ['Vocaloid', '3D投影', '魔法未来']
  },
  {
    id: 'ev-yonezu-lost',
    title: '米津玄師 2026 TOUR 「LOST IN BLUE」',
    artistId: 'art-yonezu',
    artistName: '米津玄師 (Kenshi Yonezu)',
    venueId: 'ven-tokyo-dome',
    venueName: '東京ドーム (Tokyo Dome)',
    date: '2026-08-10',
    time: '18:30',
    region: '关东 (东京)',
    platform: 'Ticket Pia',
    price: '¥9,800',
    imageUrl: 'https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=400&q=80',
    timeline: {
      lotteryStartDate: '2026-05-10',
      lotteryEndDate: '2026-05-20', // Ended lottery
      generalStartDate: '2026-06-25', // General upcoming
      paymentDeadlineDate: '2026-05-24' // Today!
    },
    originalUrl: 'https://t.pia.jp/yonezu-lostinblue',
    description: '米津玄师最新大型体育馆和巨蛋双轨巡回演唱会！极致的舞台美学，结合特制激光艺术与宏大交响乐团，呈现《LOST IN BLUE》新专辑里的深度探索之旅。',
    category: 'J-Pop',
    tags: ['新专巡演', '视觉艺术', '震撼现场']
  },
  {
    id: 'ev-ado-rage',
    title: 'Ado Nationwide Arena Tour 2026 「憤怒の花」',
    artistId: 'art-ado',
    artistName: 'Ado',
    venueId: 'ven-osakajo-hall',
    venueName: '大阪城ホール (Osaka-Jo Hall)',
    date: '2026-06-30',
    time: '19:05',
    region: '关西 (大阪)',
    platform: 'Lawson Ticket',
    price: '¥9,500',
    imageUrl: 'https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?auto=format&fit=crop&w=400&q=80',
    timeline: {
      lotteryStartDate: '2026-05-25', // Starts tomorrow
      lotteryEndDate: '2026-06-03',
      generalStartDate: '2026-06-15',
      paymentDeadlineDate: '2026-06-06'
    },
    originalUrl: 'https://l-tike.com/ado2026-osaka',
    description: '用最纯粹的声音反抗世界！Ado 2026年首波次竞技场全日本巡演《愤怒之花》降临大阪城Hall。黑白与深紫交融的暗黑铁笼舞美，极具侵略性的情绪金属摇滚。',
    category: 'Rock/J-Pop',
    tags: ['摇滚歌姬', '炸裂唱功', '高阶光影']
  },
  {
    id: 'ev-chika-starlet-3rd',
    title: 'キラメキ☆Starlet 3rd One-man Live 「無限銀河」',
    artistId: 'art-chika-stars',
    artistName: 'キラメキ☆Starlet',
    venueId: 'ven-shinjuku-blaze',
    venueName: '新宿BLAZE',
    date: '2026-06-05',
    time: '18:15',
    region: '关东 (东京)',
    platform: 'LivePocket',
    price: '¥3,500 - ¥6,500(含特典)',
    imageUrl: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=400&q=80',
    timeline: {
      lotteryStartDate: '2026-05-01',
      lotteryEndDate: '2026-05-15',
      generalStartDate: '2026-05-22', // Selling now!
      paymentDeadlineDate: '2026-05-31'
    },
    originalUrl: 'https://t.livepocket.jp/e/kirameki-3rd-ong',
    description: '超元气地下偶像团体「キラメキ☆Starlet」第三次独场演唱会！新宿BLAZE站。包含特别制作的新单曲《无限银河》披露、全员指名拍立得拍会（Cheki会）特权。LivePocket门票直销，前100张赠限定荧光棒！',
    category: 'Idol',
    tags: ['地下偶像', 'Cheki会', '超现场级']
  },
  {
    id: 'ev-sakurazaka-4th',
    title: '櫻坂46 「4th Anniversary Arena Tour」 Final',
    artistId: 'art-sakurazaka',
    artistName: '櫻坂46 (Sakurazaka46)',
    venueId: 'ven-saitama-arena',
    venueName: 'さいたまスーパーアリーナ (Saitama Super Arena)',
    date: '2026-06-21',
    time: '17:30',
    region: '关东 (埼玉)',
    platform: 'Lawson Ticket',
    price: '¥10,800',
    imageUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=400&q=80',
    timeline: {
      lotteryStartDate: '2026-05-12',
      lotteryEndDate: '2026-05-22', // Ended lottery last week
      generalStartDate: '2026-06-05',
      paymentDeadlineDate: '2026-05-25' // Payment deadline very soon!
    },
    originalUrl: 'https://l-tike.com/sakurazaka46-4th',
    description: '樱坂46成军4周年纪念巡演终点站！本场演出以极震撼的当代舞美群舞及前卫电子原声混音为特征，完美展现组合特有的红黑色酷炫美感。',
    category: 'Idol',
    tags: ['坂道女团', '周年庆典', '顶级舞美']
  }
];

export const INITIAL_EXTENSIONS: ExtensionSource[] = [
  {
    id: 'ext-ticketdive',
    name: 'TicketDive Source',
    platform: 'TicketDive',
    version: 'v1.0.0',
    author: 'Oshikatsu-Dev',
    isEnabled: true,
    isInstalled: true,
    updateAvailable: false,
    rating: 4.7,
    iconType: 'all',
    description: 'TicketDive（地下/indie live 专门）实时搜索：イベント/出演者/会場名。',
    latencyMs: 120
  },
  {
    id: 'ext-pia',
    name: 'Ticket Pia Source',
    platform: 'Ticket Pia',
    version: 'v2.4.1',
    author: 'Oshikatsu-Dev',
    isEnabled: true,
    isInstalled: true,
    updateAvailable: false,
    rating: 4.8,
    iconType: 'pia',
    description: '日本第一大票务平台 Ticket Pia 的数据爬取扩展。支持演唱会、话剧、综合演出的抽选与一般发售抓取。',
    latencyMs: 142
  },
  {
    id: 'ext-eplus',
    name: 'eplus (e+) Extractor',
    platform: 'eplus',
    version: 'v3.1.2',
    author: 'Oshikatsu-Dev',
    isEnabled: true,
    isInstalled: true,
    updateAvailable: false,
    rating: 4.9,
    iconType: 'eplus',
    description: 'eplus 代理规则。读取公开搜索结果与受付窗口，失败时返回平台报告和官方跳转。',
    latencyMs: 198
  },
  {
    id: 'ext-livepocket',
    name: 'LivePocket Aggregator',
    platform: 'LivePocket',
    version: 'v1.8.4',
    author: 'Idol-Lover-Net',
    isEnabled: true,
    isInstalled: true,
    updateAvailable: true,
    rating: 4.6,
    iconType: 'livepocket',
    description: '专为地下偶像和动漫声优见习会等中小型 LiveHub 而设的 LivePocket 接口卡片。获取高精度现场特典消息。',
    latencyMs: 87
  },
  {
    id: 'ext-lawson',
    name: 'Lawson Ticket (ローチケ) Plugin',
    platform: 'Lawson Ticket',
    version: 'v2.0.0',
    author: 'Oshikatsu-Dev',
    isEnabled: true,
    isInstalled: true,
    updateAvailable: false,
    rating: 4.5,
    iconType: 'lawson',
    description: 'ローチケ代理规则。优先解析官方搜索页；遇到反爬或结构变化时明确提示并提供官方搜索跳转。',
    latencyMs: 121
  },
  {
    id: 'ext-tiget',
    name: 'TIGET Extension (Chika Idol Core)',
    platform: 'All',
    version: 'v1.0.5',
    author: 'Wota-Power',
    isEnabled: false,
    isInstalled: false,
    updateAvailable: false,
    rating: 4.2,
    iconType: 'all',
    description: '抓取日本超小型地下偶像、街头音乐演艺与同人DJ音乐企划首选平台 TIGET 的活动源插件。',
    latencyMs: 0
  },
  {
    id: 'ext-rakuten',
    name: 'Rakuten Ticket (楽天チケット) Source',
    platform: 'All',
    version: 'v1.1.0',
    author: 'Rakuten-Fans',
    isEnabled: false,
    isInstalled: false,
    updateAvailable: false,
    rating: 4.0,
    iconType: 'all',
    description: '乐天票务第三方活动聚合源，支持获取特定韩流名流（K-Pop）、日流音乐组合的预售情报。',
    latencyMs: 0
  }
];
