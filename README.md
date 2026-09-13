# 推し活マネージャー · 推活管理器

<img src="assets/icon-only.png" alt="推し活マネージャー图标" width="96" />

追踪日本 Live 的抽選、先行和一般发售窗口：搜索艺人，收藏演出，查看每一轮受付时间，并设置本地提醒。

[下载 Android APK](https://github.com/aoki-rin/oshikatsu-manager/releases/latest) · [iOS 安装教程](docs/BUILDING.md#ios) · [报告问题](https://github.com/aoki-rin/oshikatsu-manager/issues) · [MIT 许可证](LICENSE)

## 下载与安装

### Android

1. 打开上方下载链接，在 **Assets** 中下载 `oshikatsu-manager.apk`。
2. 在手机上打开 APK，按系统提示允许此次安装来源，然后安装。
3. 首次使用时按需授予通知权限，并检查系统的闹钟、提醒及电池限制设置。

无需注册账号，也不需要常驻电脑或部署服务器。最低系统要求 Android 7.0（API 24）；Lawson 搜索使用 Google Play Services 版 Cronet，无 GMS 设备的兼容性尚未验证。平台页面或网络策略变化可能导致搜索失败，届时可从应用跳转官方票务页。

后续从同一仓库下载新版 APK，使用相同签名即可覆盖更新。请勿为解决签名冲突而直接卸载：收藏、关注和设置保存在本机，卸载或清除数据可能丢失它们。

### iOS

当前提供源码和 [Xcode 自行构建安装教程](docs/BUILDING.md#ios)，**尚未提供 TestFlight 或通用可直接安装的 IPA**。需要 Mac、Xcode 和自己的 Apple 账号签名；把 IPA 放到 GitHub 并不会解除 Apple 的签名与设备授权限制。参见 [Apple 分发说明](https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases)。

## 功能与限制

- 搜索 eplus、Ticket Pia、Lawson Ticket、LivePocket、TicketDive。
- 按艺人关注，设置应援色，收藏演出，在日历和详情中查看受付窗口。
- 显示已解析到的多轮抽選 / 先行 / 一般发售时间，统一日本时间 JST。
- Android / iOS 本地通知；Android 和浏览器支持 `.ics` 日历导出，iOS 当前隐藏导出功能。
- 中文 / 日文界面，票务源可单独启用或停用。
- 只辅助查阅与提醒；报名、付款在官方平台完成。各源的数据完整度不同，平台改版、限流和设备通知设置都可能影响结果，请以官方页面为准。

这里开源的是软件，不提供公共代理服务，也不保证票务平台持续可访问。请合理控制查询频率并遵守各平台条款。

## 从源码运行（浏览器预览）

准备 **Node.js 22.22.1+、npm 和 Git**。Android / iOS 工具链只在构建手机应用时需要。项目提供 `.nvmrc`，使用 nvm 时可先运行 `nvm install` 和 `nvm use`。

```bash
git clone https://github.com/aoki-rin/oshikatsu-manager.git
cd oshikatsu-manager
npm ci
cp .env.example .env
```

Windows PowerShell 将最后一行换成 `Copy-Item .env.example .env`。也可以通过 GitHub 的 **Code → Download ZIP** 下载、解压后进入项目目录。

开两个终端，均进入项目目录：

```bash
# 终端一：本地票务代理，默认仅监听 127.0.0.1:8787
npm run server:dev
```

```bash
# 终端二：网页开发服务器
npm run dev
```

打开 **http://localhost:3000**。浏览器的搜索请求通过 Vite 转发至本地代理；只启动网页会导致搜索不可用。真实票务网站仍可能限制访问；通知等系统行为请在手机验证。

## 构建手机应用

完整的环境安装、调试、签名与安装步骤见 [构建指南](docs/BUILDING.md)。首次开发可以先构建 Android 调试包，不需要作者的签名密钥：

```bash
npm run build:release
npx cap sync android
cd android
./gradlew assembleDebug
```

Windows 使用 `gradlew.bat assembleDebug`。产物为 `android/app/build/outputs/apk/debug/app-debug.apk`。需预先安装 JDK 21 和 Android SDK 36，配置 SDK 路径；见构建指南。

## 配置

| 使用场景 | 配置与启动方式 |
|---|---|
| 下载官方 APK | 已配置为手机直连，无需 `.env` |
| 浏览器开发 | `.env` 留空，同时运行 `server:dev` 和 `dev` |
| 自己构建手机直连版 | 使用 `npm run build:release`，再同步原生工程 |
| 自己构建带代理版 | 在 `.env` 填 `VITE_TICKET_PROXY_BASE_URL`，使用 `npm run build`，再同步原生工程 |

代理地址应为手机可访问的 HTTPS 地址。设置后所有票务源优先经过代理，请求失败会尝试客户端直连；浏览器直连可能受 CORS 限制。

**`VITE_` 配置会写入安装包，不应包含任何密码或密钥。** 修改配置后需要重新构建、同步并安装。`build:release` 不加载任何 `.env` 文件，并强制清空代理地址，无需移动或删除你的本地配置。

## 开发与测试

```bash
npm run lint           # TypeScript 检查
npm run check:version  # 网页、锁文件、Android、iOS 版本一致性
npm run test:cov       # 单元、组件与原生分支测试及覆盖率
npx playwright install chromium
npm run test:e2e       # 浏览器关键流程，使用固定测试数据
```

自动测试不代表已通过真实票务平台或所有手机的验证。贡献前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)；维护者发布新版本请阅读 [发布指南](docs/RELEASING.md)。

## 项目结构

| 路径 | 内容 |
|---|---|
| `src/` | React 界面、本地状态、提醒和客户端票务源 |
| `server/` | 可选 Express 代理与服务端解析器 |
| `android/`、`ios/` | Capacitor 原生工程 |
| `tests/` | 解析器、界面、状态与端到端测试 |
| `docs/adr/` | 架构决策及历史背景 |

技术栈：React 19、TypeScript、Vite、Capacitor 8、Express。领域术语与架构见 [CONTEXT.md](CONTEXT.md)。旧 ADR 记录当时的结论，后续决策可能已替代它们。

已有图标资源可直接构建；需要重新生成图标时可运行 `node _icongen.mjs`（使用开发依赖 Sharp）。

## 常见问题

**浏览器搜索失败？** 先确认 `npm run server:dev` 正在运行，再查看应用中对应票务源的错误；平台限流、页面改版或网络问题仍需分别排查。

**手机为什么连接私人代理？** 开发版可能包含构建时的 `.env` 值。使用 `npm run build:release` 后重新 `cap sync` 和安装。

**Android 提示无法安装或签名不匹配？** 调试包、自签名包与官方 APK 的签名可能不同，不能直接覆盖。先保留现有数据，确认安装来源和签名；不要直接卸载已有应用。

**macOS 构建出现 `code signature ... different Team IDs`？** 所用 Node 的签名可能禁止加载构建依赖的原生模块。换用普通 Node 安装（如 Homebrew），然后重新运行 `npm ci`。

## 隐私、第三方内容与许可

收藏、关注和设置保存在设备 / 浏览器本地存储中，没有项目账号系统或项目提供的云同步。搜索会向票务平台（或你配置的代理）发送查询；显示远程图片时也会连接图片服务。系统备份行为由操作系统设置决定。详细说明见 [隐私说明](docs/PRIVACY.md)。

本项目原创代码采用 [MIT](LICENSE) 许可。依赖、第三方票务内容和测试页面片段的权利归各自权利人；项目许可不授予第三方内容的使用权。参见 [第三方说明](THIRD_PARTY_NOTICES.md)。本项目与上述票务平台无官方关联。
