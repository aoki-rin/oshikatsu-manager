# 从源码构建

先按 [README](../README.md) 下载代码并运行 `npm ci`。以下命令除特别说明外均在仓库根目录执行；使用 `package-lock.json` 固定的依赖。

## 环境

| 目标 | 要求 |
|---|---|
| 浏览器 | Node.js 22.22.1+、npm |
| Android | Node.js 22.22.1+、JDK 21、Android Studio 2025.2.1+；SDK Manager 安装 Android SDK Platform 36、Build-Tools 35.0.0、Platform-Tools |
| iOS | macOS、Node.js 22.22.1+、Xcode 26+ 及命令行工具；真机最低 iOS 15 |

参见 [Capacitor 8 环境要求](https://capacitorjs.com/docs/getting-started/environment-setup)。Android 使用仓库自带 Gradle Wrapper；iOS 使用 Swift Package Manager，无需 CocoaPods。第一次构建需要网络下载依赖。

## Android

### 配置工具链

在 Android Studio 的 **Settings → Build, Execution, Deployment → Build Tools → Gradle** 中选择 JDK 21。命令行也必须使用 JDK 21：运行 `java -version` 检查。macOS 上可使用 Android Studio 附带的 JBR：

```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export PATH="$JAVA_HOME/bin:$PATH"
export ANDROID_HOME="$HOME/Library/Android/sdk"
```

Linux / Windows 将路径换成自己的 JDK 和 SDK 路径。也可以在 `android/local.properties` 中填写 `sdk.dir=你的SDK绝对路径`（该文件不提交）；Android Studio 通常会自动创建它。

### 构建与运行调试版

```bash
npm run build:release
npx cap sync android
npm run android
```

连接 Android 手机，开启开发者选项和 USB 调试，在 Android Studio 选择设备后点击 Run。也可以不用打开 IDE：

```bash
cd android
./gradlew assembleDebug
```

Windows 用 `gradlew.bat assembleDebug`。在手机打开 `android/app/build/outputs/apk/debug/app-debug.apk`，或使用 Android SDK 的 `adb install -r` 安装。调试签名由本机工具生成，不能覆盖不同签名的官方安装。

### 构建自己的正式签名 APK

首次创建自己的密钥（已有密钥时不要覆盖或重新生成）：

```bash
keytool -genkeypair -v -keystore android/release.keystore -alias release -keyalg RSA -keysize 2048 -validity 10000
cp android/keystore.properties.example android/keystore.properties
```

根据提示设置密码，然后编辑 `android/keystore.properties` 填入真实密码、别名和密钥路径。不要把这些文件提交或发给其他人。妥善备份密钥与密码，后续覆盖更新需要沿用相同签名。

```bash
npm run build:release
npx cap sync android
cd android
./gradlew assembleRelease
```

产物：`android/app/build/outputs/apk/release/app-release.apk`。缺少签名配置时正式构建会报错；只想体验源码时请用 `assembleDebug`。可以用 SDK Build-Tools 中的 `apksigner verify --verbose --print-certs` 验证 APK 签名。

官方 Release 沿用维护者原有签名，第三方构建者使用自己的签名；这两者不能相互覆盖安装。

## iOS

### 在自己的 iPhone 上运行

1. 安装并首次启动 Xcode，完成组件安装；在 **Xcode → Settings → Accounts** 登录自己的 Apple 账号。
2. 构建网页并同步 iOS：

   ```bash
   npm run build:release
   npx cap sync ios
   npm run ios
   ```

3. 在 Xcode 选择 **App 工程 → App target → Signing & Capabilities**，启用 **Automatically manage signing**，选择自己的 **Team**。仓库不预设作者的 Team。
4. 将 Bundle Identifier 改为自己的唯一标识，例如 `com.yourname.oshikatsumgr`。长期维护自己的分支时同步调整 `capacitor.config.ts` 的 `appId`。
5. 用 USB 连接 iPhone，在设备列表选择它，按需打开 iPhone 的开发者模式，点击 Run。
6. 如果系统要求信任开发者，在 iPhone 的 **设置 → 通用 → VPN 与设备管理** 中处理对应提示。

免费 Personal Team 的设备、能力和签名有效期有限；过期后需要重新构建安装。详情见 [Apple 开发者账号说明](https://developer.apple.com/help/account/basics/about-your-developer-account)。不要共享自己的签名证书或账号。

### 模拟器验证

在 Xcode 选择已安装的 iPhone Simulator 后 Run；模拟器无需真机签名。搜索网络路径和系统通知仍需真机验证。也可用命令行：

```bash
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath /tmp/oshikatsu-ios-build CODE_SIGNING_ALLOWED=NO build
```

### IPA 与 TestFlight

当前版本不发布 IPA 或 TestFlight。IPA 需要有效签名和相应的分发授权；不能把开发包上传 GitHub 后承诺任意 iPhone 直接安装。未来公开测试可通过 Apple Developer Program、App Store Connect 和 TestFlight，外部测试需要相应审核。[官方 TestFlight 文档](https://developer.apple.com/testflight/)

当前 iOS 工程为兼容自建 HTTP 代理保留了宽松 ATS 设置。自行准备上架版本时应先改用 HTTPS 并收紧配置，再验证网络和通知能力。

## 配置与重新构建

`npm run build:release` 是公开手机直连构建：忽略 `.env*`，清空代理地址。`npm run build` 是自定义构建：使用你的 Vite 环境配置。两者之后均需执行目标平台的 `npx cap sync android` 或 `npx cap sync ios`，再重新构建原生应用。

单独运行 `npm run preview` 只预览静态产物，不会提供开发服务器的 `/api` 代理。浏览器搜索开发请使用 README 的双终端方式。
