# nxncode

面向 Fedora KDE Wayland 的个人非商业桌面编程助手，界面参考 [Kuvo Code](https://github.com/serhatandic/kuvo-code)。默认中文，可切英文。

## 运行

Node.js 24、pnpm 12：

```bash
pnpm install
pnpm dev
```

首次启动会下载并校验独立的 OpenCode 2.0.32。应用自己的账号、配置、会话、Bots 和浏览器登录与已有 OpenCode 安装分开。可以选择引擎提供的免费模型，也可以在“设置 → 账号与供应商”连接 API Key 或 OAuth。

默认数据目录为 Electron 的 userData（Linux 通常是 ~/.config/nxncode）。NXNCODE_DATA_DIR 可覆盖此路径，测试使用项目内 .runtime。不要把该目录提交到仓库。

侧栏只展示自己创建的 Bots；首次启动为空列表，可点击“创建 Bot”，再在设置中指定主 Bot 来管理其他 Bots。聊天、计划、图表与下载均来自实际任务，不预填示例执行记录。浏览器初始为空白，可输入网址或让 Bot 打开网页。

窗口使用桌面系统的原生标题栏和边框，由 KDE 提供窗口按钮与拖动行为。

右侧工具面板启动时默认收起；点击右上角面板按钮、打开项目/报告或让代理操作浏览器时按需展开。思考过程和 shell 等工具记录支持带动画的展开与收起，减少动态偏好下直接切换。

## 模型与扩展

- **启用模型**：在“设置 → 启用模型”中搜索并开关模型，对话与 Bot 选择器只显示已启用且可用的模型。可全部停用；未配置过的旧工作区保留原有可选模型。
- **思考挡位**：点击输入栏模型名称旁的挡位，直接调整当前模型的思考强度，点击轨道即可平滑滑到对应挡位，左侧蓝紫填充与圆点同步移动，也支持拖动；最高挡位确认后，填充区域内有大小不一、略微上下漂移的柔和光点持续向左加速，原有圆点从各自原位向左缩小、一次性消失，不再循环补出，减少动态时停用，选择后窗口保持打开；可用挡位由引擎提供。选择模型直接生效，不再自动打开挡位窗口。
- **自定义供应商**：在“设置 → 账号与供应商”填写独立 ID、名称、OpenAI 兼容 Base URL、API Key 和模型列表。每行模型可写为 `模型ID | 显示名称`。编辑时密钥留空表示保留；本地无鉴权服务可不填密钥。保存后到“启用模型”中管理菜单。
- **Skills**：安装包离线内置任务规划、排查故障、代码审查、界面改进、网页调研、数据与报告、查找 Skills、创建 Skills 8 个工作流，默认启用；输入 `/` 选择。设置可停用，升级保留选择；也支持导入自己的 SKILL.md 文件夹及配套资源。内置项随应用更新，可停用但不能删除。引擎已关闭本机共享 Skills 扫描；查找和创建流程通过应用导入，不做全局安装。
- **引用**：在消息框输入 `@` 搜索当前项目文件和已有 Bots。文件作为文本附件发送（最多 2 MiB），Bot 引用包含其名称和职责；引用本身不会派发任务。未打开项目时菜单提供打开入口。
- **MCP**：在“设置 → MCP”配置本地程序与逐行参数（stdio），或 HTTP 地址与 JSON 请求头。环境变量与请求头留空保留已存值，`{}` 清空；列表显示真实连接状态。当前自定义 HTTP 连接使用请求头鉴权，OAuth MCP 的交互登录尚未包含。内置浏览器和 Bot 服务保持独立。

这些配置及凭证仅保存在应用数据目录；密钥不放入应用偏好、模型目录或源码。配置文件由固定版本引擎自动重新加载，应用等待引擎确认后显示保存结果。MCP 的“已保存”表示配置已应用，连接是否成功以行内状态为准。

## 主要操作

- 新建会话：Ctrl+N；设置：Ctrl+,。
- Enter 发送，Shift+Enter 换行，Esc 停止执行。
- 先“打开项目”，再使用文件、终端和改动页。
- 三种审批模式：Ask First 编辑和命令先征求批准；Auto approve 按本地风险策略自动批准或拒绝，从不写入长期允许规则；Full access 允许代理直接执行。
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

发行文件为 dist/nxncode-0.2.9.AppImage 和 dist/nxncode-0.2.9.x86_64.rpm。发行目录附有 SHA256SUMS 时，可运行 `sha256sum -c SHA256SUMS` 核对完整性。

scripts/functional-check.mjs 是需要网络和免费模型的完整验收脚本，只使用 .runtime 隔离目录；需先在该目录准备测试 Git 项目，不应在个人真实项目中运行。它通过 NXNCODE_TEST_FIXTURES=1 显式启用本地订单测试站；正常启动不启用。头像状态也使用 scripts/fixtures 中的独立夹具，不在产品内放置假 Bots。

`node --import tsx scripts/skill-isolation-check.mjs` 直接验证引擎共享隔离与旧配置覆盖保护；`node scripts/builtin-skills-check.mjs [发行包可执行文件路径]`（不传路径时先执行 `pnpm build`）使用真实隔离引擎检查内置 Skills 的离线资源、启停重启、`/` 和会话激活；`node scripts/settings-check.mjs` 检查模型、扩展界面与折叠连续帧；`node scripts/effort-check.mjs` 专门验证鼠标单击轨道的滑动连续帧，可追加发行包可执行文件路径验证隔离桌面包；`node --import tsx scripts/extensions-check.mjs` 使用隔离引擎及 loopback 夹具验证自定义模型推理、MCP 和 Skills，不使用供应商付费账号。集成检查使用已缓存的引擎，也可通过 `NXNCODE_ENGINE_BINARY` 指定已校验的二进制（需相邻 `.sha256` 文件）。

## 限制与来源

首版包含本机 OpenCode、多模型、Bots、同页浏览器、文件、PTY 和 Git 审查；SSH、多代理桥、群聊、手机连接、用量统计及自动更新在后续范围。

Linux 窗口内部还原玻璃材质，不保证 macOS 的跨应用桌面透射模糊。PDF 导出当前面向 HTML 报告。

本项目为个人非商业 Linux 改编，保留原版权与 PolyForm Noncommercial 1.0.0 许可。见 LICENSE、NOTICE、THIRD_PARTY_NOTICES.md。

窗口内容有开合过渡；最小化、最大化的桌面动画取决于 KDE 设置。
