# 第三方说明

`LICENSE` 中的 MIT 许可适用于本项目原创代码，不重新许可第三方依赖、品牌、图片、票务内容或来源页面片段。

## 软件依赖

主要依赖包括 React、Vite、Capacitor、Express、Lucide、Tailwind CSS、AndroidX 和 Google Play Services Cronet。各依赖按自身许可证或条款提供；确切版本见 `package-lock.json`、Android Gradle 文件和 iOS Swift Package Manager 配置。

重新分发时请保留随依赖提供的版权、许可证和 NOTICE 文件；MIT 许可并不替代这些义务。正式发布附带 `THIRD_PARTY_LICENSES.txt`，收集本次构建中 npm 生产依赖的许可证以及 Android 依赖所附带的许可文本。Google Play Services 的使用另外受 [Google APIs 条款](https://developers.google.com/terms) 约束。

## 页面片段与数据

`tests/fixtures/` 中的 HTML / JSON 片段来自各文件注释注明的公开票务页面，用于解析器回归测试；这些片段不适用本项目 MIT 许可。其原始内容的权利仍归原权利人。它们不构成当前票务数据库，也不保证票务信息有效。

应用运行时获取的演出标题、票务信息及远程图片由各自来源提供；本项目不主张拥有这些内容，也不授权重新发布它们。测试快照不打包进正式应用。

项目未获 eplus、Ticket Pia、Lawson Ticket、LivePocket 或 TicketDive 官方认可或授权合作。如有内容权利问题，请通过仓库联系维护者。
