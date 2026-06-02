import { OshiColor, ExtensionSource } from '../types';

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

// 与 src/sources/index.ts 的 REGISTRY 一一对应的 5 个真实平台插件。
export const INITIAL_EXTENSIONS: ExtensionSource[] = [
  {
    id: 'ext-ticketdive',
    name: 'TicketDive Source',
    platform: 'TicketDive',
    version: 'v1.0.0',
    author: 'Oshikatsu-Dev',
    isEnabled: true,
    isInstalled: true,
    rating: 4.7,
    iconType: 'all',
    description: 'TicketDive（地下/indie live 专门）实时搜索：イベント/出演者/会場名。',
  },
  {
    id: 'ext-pia',
    name: 'Ticket Pia Source',
    platform: 'Ticket Pia',
    version: 'v2.4.1',
    author: 'Oshikatsu-Dev',
    isEnabled: true,
    isInstalled: true,
    rating: 4.8,
    iconType: 'pia',
    description: 'Ticket Pia 搜索规则。读取公开搜索结果与多轮受付窗口（抽選 / 一般）。',
  },
  {
    id: 'ext-eplus',
    name: 'eplus (e+) Extractor',
    platform: 'eplus',
    version: 'v3.1.2',
    author: 'Oshikatsu-Dev',
    isEnabled: true,
    isInstalled: true,
    rating: 4.9,
    iconType: 'eplus',
    description: 'eplus 代理规则。读取公开搜索结果与受付窗口，失败时返回平台报告和官方跳转。',
  },
  {
    id: 'ext-livepocket',
    name: 'LivePocket Aggregator',
    platform: 'LivePocket',
    version: 'v1.8.4',
    author: 'Idol-Lover-Net',
    isEnabled: true,
    isInstalled: true,
    rating: 4.6,
    iconType: 'livepocket',
    description: 'LivePocket 搜索规则（地下偶像 / 声优等中小型 Live 为主）。读取公开搜索结果。',
  },
  {
    id: 'ext-lawson',
    name: 'Lawson Ticket (ローチケ) Plugin',
    platform: 'Lawson Ticket',
    version: 'v2.0.0',
    author: 'Oshikatsu-Dev',
    isEnabled: true,
    isInstalled: true,
    rating: 4.5,
    iconType: 'lawson',
    description: 'ローチケ代理规则。优先解析官方搜索页；遇到反爬或结构变化时明确提示并提供官方搜索跳转。',
  },
];
