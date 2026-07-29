# ADR-0002: Lawson(ローチケ)经家用住宅 IP 代理(Tailscale)绕 Akamai,不上云

- 状态:**核心前提已被证伪(2026-07-28)**,见 [ADR-0005](0005-lawson-cronet-on-device.md);代理机制本身仍在,但 Lawson 不再必需住宅 IP
- 原状态:已采纳(2026-05)
- 相关:PR #12

## 背景

真机直连 Lawson 搜索页时,Akamai Bot Manager 按 TLS/HTTP 指纹拦截 OkHttp(CapacitorHttp)→ 超时 / 挑战页。其它平台直连或代理都行,唯 Lawson 卡 Akamai。

## 决策

搜索**代理优先**:配置 `VITE_TICKET_PROXY_BASE_URL` 指向家里常驻的 Express 代理(`server/`),手机经 **Tailscale** 私网连回家中 Mac。代理用 Node fetch(Akamai 接受),且代理不可达时**快速回退**到 CapacitorHttp 直连。

**不部署到云**:Akamai 对数据中心 IP 拦得更狠;家用**住宅 IP** 才是 Lawson 能通的关键。这是刻意取舍,不是临时方案。

## 后果

- ➕ Lawson 在真机可用,无需在 App 里硬刚 Akamai 指纹。
- ➕ 架构对称:所有平台都能走代理,Lawson 只是最需要它的那个。
- ➖ 运维依赖:家里 Mac 常开 + Tailscale 在线;Mac 下线 → Lawson 退化(其它平台不受影响,且有官方跳转兜底)。
- ➖ 明文 http 经私网 → 需 Android cleartext 白名单(仅 debug,限代理 IP):`android/app/src/debug/res/xml/`。
- `.env` 已 gitignore;`VITE_TICKET_PROXY_BASE_URL` build 时编入包。
