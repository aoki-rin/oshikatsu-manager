import { buildPlatformSearchUrl, deriveTimelineFromWindows, normalizeLiveEvent } from '../../src/sources/shared';
import {
  buildPiaArtistRlsInfoUrl,
  buildPiaKeywordRlsInfoUrl,
  parsePiaArtistInfo,
  parsePiaRlsInfo,
} from '../../src/sources/pia';
import type { ActivityEvent } from '../../src/types';
import type { ServerTicketSource } from '../types';

export const piaSource: ServerTicketSource = {
  id: 'pia',
  platform: 'Ticket Pia',
  // v4：事件 id 回退链 eventBundleCd || eventCd || 位置序号——音乐节类节（无 eventBundleCd）
  //     此前落到位置序号 pia-b0（随排序漂移、跨搜索撞 id），且拼出无效 eventBundleCd=b0 链接
  // v5：is_status 行尾的「開始～締切」→ 搜索阶段直落 applyStart/applyEnd（此前只留短状态词）；
  //     cd 改为标题锚点作用域优先（防横幅劫持/首轮下架漂移）；无 cd 时不再伪造 eventBundleCd=b0 死链
  parserVersion: 'pia-html-v5',
  buildSearchUrl: (query) => buildPlatformSearchUrl('Ticket Pia', query),
  async search(query, ctx) {
    const searchHtml = await ctx.fetchText(this.buildSearchUrl(query));
    const artistInfo = parsePiaArtistInfo(searchHtml);

    // 搜索阶段只取 rlsInfo（轻量、快）。精确受付日期改为点开事件详情时再懒加载，
    // 避免在搜索时为每个「受付中」轮次额外抓详情页拖慢整体（参考 Mihon：搜索拿列表，详情按需）。
    let events: ActivityEvent[] = [];
    if (artistInfo) {
      const rlsHtml = await ctx.fetchText(buildPiaArtistRlsInfoUrl(artistInfo.cd));
      // 与客户端对齐（QA #1）：Pia 自带真实艺人名（artistnm）→ 优先用它标 'platform'
      events = parsePiaRlsInfo(rlsHtml, artistInfo.name || query, artistInfo.name ? 'platform' : 'query');
    }
    // 兜底：艺人未命中（如「PERSONA LIVE TOUR 2026」这类公演名/系列名）或艺人名下 0 件
    // （如「ペルソナ」艺人码存在但票挂在公演名下）→ 公演名关键词直搜，命中的是公演 → 检索词回显。
    if (events.length === 0) {
      const kwHtml = await ctx.fetchText(buildPiaKeywordRlsInfoUrl(query));
      events = parsePiaRlsInfo(kwHtml, query, 'query');
    }

    return events.map((event) => normalizeLiveEvent({
      ...event,
      timeline: deriveTimelineFromWindows(event.ticketWindows || []),
    }, 'pia', ctx.fetchedAt));
  },
};
