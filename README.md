# nxncode

面向 Fedora KDE Wayland 的个人非商业桌面编程助手，界面参考 [Kuvo Code](https://github.com/serhatandic/kuvo-code)。默认中文，可切英文。

## 运行

Node.js 24、pnpm 12：

```bash
pnpm install
pnpm dev
```

首次启动会下载并校验独立的 OpenCode 2.0.32。应用自己的账号、配置、会话、Bots 和浏览器登录与已有 OpenCode 安装分开。可以选择引擎提供的免费模型，也可以在“设置 → 模型与账号”连接 API Key 或 OAuth。

默认数据目录为 Electron 的 userData（Linux 通常是 ~/.config/nxncode）。NXNCODE_DATA_DIR 可覆盖此路径，测试使用项目内 .runtime。不要把该目录提交到仓库。

侧栏只展示自己创建的 Bots；首次启动为空列表，可点击“创建 Bot”，再在设置中指定主 Bot 来管理其他 Bots。聊天、计划、图表与下载均来自实际任务，不预填示例执行记录。浏览器初始为空白，可输入网址或让 Bot 打开网页。

窗口使用桌面系统的原生标题栏和边框，由 KDE 提供窗口按钮与拖动行为。

## 主要操作

- 新建会话：Ctrl+N；设置：Ctrl+,。
- Enter 发送，Shift+Enter 换行，Esc 停止执行。
- 先“打开项目”，再使用文件、终端和改动页。
- Ask First 要求批准；Build 允许当前会话直接执行。
- 审批模式跟随各自会话；新会话默认 Ask First，切换成功后才更新显示。
- Bots 的“定时计划”支持单次/每日/每周；日历时间按选择的时区执行。
- 关闭窗口后留在托盘继续运行；托盘“退出”才停止引擎和计划。关机/退出期间不会执行，恢复后漏期合并补跑一次。
- 网页登录、验证码等需要用户点击“接管”，完成后点击“继续”。
- HTML 报告在文件页预览，可导出 PDF；Git 行内意见会随下一条消息发送。

## 检查和打包

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm check:ui
node scripts/motion-check.mjs
pnpm pack:linux
```

check:ui 使用 /usr/bin/google-chrome，仅启动本机测试服务，并验证审批切换的失败和延迟响应。motion-check 录制实际界面并检查头像、面板过渡和减少动态；首次录像需运行 PLAYWRIGHT_BROWSERS_PATH="$PWD/.cache/playwright" pnpm exec playwright install ffmpeg。pack:linux 生成 dist/ 下的 x64 RPM 和 AppImage，复用依赖已安装的 Electron 运行时；若 Fedora 没有 rpmbuild，脚本只下载工具到 .cache 本地解包使用，不安装系统软件。构建 node-pty 需要 C++ 编译器、make 和 Python。

AppImage 可直接运行；系统不支持 FUSE 时可使用 --appimage-extract-and-run。RPM 可通过 Fedora 的软件安装器安装。

发行文件为 dist/nxncode-0.1.1.AppImage 和 dist/nxncode-0.1.1.x86_64.rpm。在 dist 目录运行 `sha256sum -c SHA256SUMS` 可核对完整性。

scripts/functional-check.mjs 是需要网络和免费模型的完整验收脚本，只使用 .runtime 隔离目录；需先在该目录准备测试 Git 项目，不应在个人真实项目中运行。它通过 NXNCODE_TEST_FIXTURES=1 显式启用本地订单测试站；正常启动不启用。头像状态也使用 scripts/fixtures 中的独立夹具，不在产品内放置假 Bots。

## 限制与来源

首版包含本机 OpenCode、多模型、Bots、同页浏览器、文件、PTY 和 Git 审查；SSH、多代理桥、群聊、手机连接、用量统计及自动更新在后续范围。

Linux 窗口内部还原玻璃材质，不保证 macOS 的跨应用桌面透射模糊。PDF 导出当前面向 HTML 报告。

本项目为个人非商业 Linux 改编，保留原版权与 PolyForm Noncommercial 1.0.0 许可。见 LICENSE、NOTICE、THIRD_PARTY_NOTICES.md。

窗口内容有开合过渡；最小化、最大化的桌面动画取决于 KDE 设置。
