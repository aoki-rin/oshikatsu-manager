# ADR-0003: 反爬判定只认挑战页专属指纹 + 异常状态码(宁漏勿错)

- 状态:已采纳(2026-05)
- 相关:PR #10, PR #13

## 背景

`looksLikeAntiBot` 早期用宽泛关键词,踩过两次坑:

1. 裸 `bot` 命中正常页的 `<meta name="robots">` 和 CSS `footer__bottom` → 每个 200 正常页被判 blocked → **所有搜索返回 0 条**(核心功能全挂)。
2. 裸 `captcha`/`recaptcha` 命中正常页的 i18n 文案(如 TicketDive 的 `recaptchaExpired` 翻译串)→ 正常页被误判受限。

## 决策

判 `blocked` **仅当**满足以下之一:

- **异常状态码**:403 / 429 / 503;
- 命中**挑战页基础设施专属指纹**:`cf-browser-verification`、`/cdn-cgi/challenge-platform/`、`incapsula incident id`、`pardon our interruption`、`unusual traffic from your computer`、`are you a robot/human?`;
- 内容**异常短**(< 200 字符)。

解析结果为空 → 走「empty」正常路径,**绝不**判 blocked。

原则:**宁可漏判(当成 empty / 普通页)也不要错判(把能用的平台判成受限)**。真正的拦截主要靠异常状态码;内容指纹只取挑战页独有标记。

## 后果

- ➕ 正常页不再被误杀;真挑战页 / 限流仍能识别。
- ➖ 极少数"软拦截"(返 200 + 伪装成正常页)可能漏判 → 可接受(UI 有每平台搜索报告状态,可人工核 + 官方跳转)。
- 单一真源:`src/sources/shared.ts` 的 `ANTI_BOT_SIGNATURES`,client + server 共用;回归测试在 `tests/proxy-ticketing.test.ts`(含"正常页不得误判"的反向用例)。
