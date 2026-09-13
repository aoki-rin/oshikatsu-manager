# 维护者发布指南

公开下载入口：[GitHub Releases](https://github.com/aoki-rin/oshikatsu-manager/releases)。安装包作为 Release 附件提供，不提交到源码仓库。Release 对应版本标签，GitHub 自动提供该标签的源码 ZIP / tar.gz。

## 一次性设置

在仓库 **Settings → Secrets and variables → Actions** 中设置：

| Secret | 内容 |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | 现有正式 keystore 文件的 Base64 编码 |
| `ANDROID_KEYSTORE_PASSWORD` | keystore 密码 |
| `ANDROID_KEY_ALIAS` | 签名别名 |
| `ANDROID_KEY_PASSWORD` | 签名私钥密码 |

沿用已有签名，不要为自动化重新生成密钥。保留一份安全离线备份；GitHub Secrets 不是可下载恢复的备份。上传编码时不要公开粘贴，也不要把它写进日志。Secret 仅在受信任标签的签名步骤使用，Pull Request 测试不使用签名密钥。

当前发布工作流限定在 `aoki-rin/oshikatsu-manager` 执行；Fork 作者需改成自己的仓库名称、配置自己的签名，并使用自己的分发入口。

依赖更新说明：`package.json` 的 `qs` override 用于覆盖 Express 4 的旧间接版本范围，修复已知解析问题。未来升级 Express 时请检查是否仍需该 override；不要直接删除后跳过审计。

## 每次发布

1. 更新 `package.json` 与 `package-lock.json` 的版本、Android `versionName` 和两处 iOS `MARKETING_VERSION`；Android `versionCode` 和两处 iOS `CURRENT_PROJECT_VERSION` 同步递增。
2. 新建 `docs/releases/v版本号.md`，写清变更、下载方式和已知限制。
3. 运行检查，使用干净源码构建，并在可用真机上验证安装 / 覆盖更新、搜索、收藏和通知。未完成的设备验证要如实写入发布说明。

   ```bash
   npm ci
   npm run check:version
   npm run lint
   npm run test:cov
   npx playwright install chromium
   npm run test:e2e
   npm run build:release
   ```

4. 合并并推送源码，再创建对应标签。以下以首个公开版本为例，后续替换为新的版本，**不要移动已经发布的标签**：

   ```bash
   git tag -a v1.1.2 -m 'Release v1.1.2'
   git push origin v1.1.2
   ```

5. 等待 **Actions → Android release** 完成。工作流先执行版本、类型、覆盖率和浏览器测试，再构建并验证正式签名 APK，生成许可证文件与校验和，创建 **Release 草稿**。
6. 检查草稿附件和更新说明后点击 **Publish release**。发布后普通用户可以下载；README 的 `/releases/latest` 自动指向最新正式版本。

仅推送标签或生成 Actions artifact 不等于已发布。自动流程创建草稿，方便维护者完成设备验证与说明检查后公开。如果构建失败，修复后用新版本标签重试；也可以在相同源码和配置下重新运行失败任务。若草稿已存在，不要覆盖已发布附件，应先核对状态。

如果只需修复发布工作流（例如云端 SDK 工具路径），可将修复推到 `main`，然后在 **Actions → Android release → Run workflow** 选择 `main`，输入原有版本标签。它会使用新的工作流并检出该标签对应的源码，重新执行全部发布检查，不移动标签：

```bash
gh workflow run release.yml --ref main -f tag=v1.1.2
```

## 本地发布备用路径

已按 [构建指南](BUILDING.md) 配好签名时：

```bash
npm ci
npm run build:release
npx cap sync android
cd android
./gradlew assembleRelease exportReleaseDependencies
cd ..
mkdir -p release
cp android/app/build/outputs/apk/release/app-release.apk release/oshikatsu-manager.apk
node scripts/collect-licenses.mjs
```

许可证收集需要系统提供 `unzip`。使用 SDK Build-Tools 的 `apksigner verify --verbose --print-certs release/oshikatsu-manager.apk` 验证签名，并确认它与上一版相同。

macOS 生成校验和：

```bash
cd release
shasum -a 256 oshikatsu-manager.apk THIRD_PARTY_LICENSES.txt > SHA256SUMS
cd ..
```

Linux 可用 `sha256sum`。将 APK、`THIRD_PARTY_LICENSES.txt` 和 `SHA256SUMS` 上传到对应标签的 Release；不要上传 keystore、密码、证书私钥或包含本地路径的构建中间文件。

## iOS

当前公开版本仅提供 [自行构建说明](BUILDING.md#ios)。若未来启用 TestFlight，需要 Apple 开发者计划、签名、App Store Connect 配置和外部测试审核；成功开放后再添加真实的邀请链接，不预先展示不可用的下载按钮。
