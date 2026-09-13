# 参与贡献

欢迎通过 [Issues](https://github.com/aoki-rin/oshikatsu-manager/issues) 报告问题或讨论改进，通过 Pull Request 提交代码。先阅读 [README](README.md) 和 [构建指南](docs/BUILDING.md)。

报告问题时请提供应用版本、操作系统、受影响的票务平台、复现步骤和预期结果；截图请遮住私人信息。不要提交 `.env`、签名文件、密码、Cookie 或真实用户数据。

提交代码前运行：

```bash
npm ci
npm run lint
npm run check:version
npm run test:cov
npx playwright install chromium
npm run test:e2e
```

修改原生工程时也请运行相应平台的构建。解析器变更应有能复现问题的最小测试片段；保留来源与采集日期，不要加入完整页面、账号数据或与测试无关的第三方内容。新票务源同时关注客户端和服务端实现。

架构与领域术语见 [CONTEXT.md](CONTEXT.md) 和 `docs/adr/`。提交贡献表示你有权提供该内容，并同意原创贡献采用本项目的 MIT 许可证。

安全漏洞请通过仓库 **Security → Report a vulnerability** 私下报告，避免在公开 Issue 中披露密钥或未修复的利用细节。
