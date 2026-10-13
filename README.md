# DSH 启动动画 · native-startup

给**官方 DeepSeek Harness** 的 Web 界面加一段可选开屏演出：真实读取本机的 skills 与已加载 plugins，配固定英文旁白、两套可切换的视觉风格，演完自动交回官方 Harness。

> **本仓库是一个被裁剪过的 fork，只保留这个动画。**
> - 上游：https://github.com/Ar1haraNaN7mI/deepseek-harness-rust-optimize
> - 本 fork：https://github.com/A-common-Chinese/deepseek-harness-rust-optimize
>
> 上游仓库同时是一个用 Rust 重写的 DSH 风格助手（CLI / TUI / 网页 / Windows 桌面端 / 电脑操作 / 桌宠）。**本 fork 已把与本 addon 无关的内容全部删除**，只留动画本体、addon 包与安装/维护脚本。

## 与上游的区别

| 项 | 上游 | 本 fork |
|---|---|---|
| 仓库内容 | Rust 应用（12 个 crate：CLI / TUI / 网页 / 桌面端 / 电脑操作 / 桌宠）+ 本 addon | **只有本 addon**：动画本体 + addon 包 + 安装与维护脚本 |
| git 跟踪文件 | 255 个 / 10.4 MB | **56 个 / 1.85 MB** |
| 安装方式 | `install_dsh.py` 装 Rust 应用；`install_native_startup.py` 装 addon（**网页/CLI** 路径，需 npm） | `install_startup_animation.py` **默认装进 DSH 桌面端**（不需要 npm）；同时保留上游的网页/CLI 安装器 |
| 卡在"展开能力档案" | 有：进入第 3 阶段后无人发起读取，必须手动点一下才继续 | **已修**：进入第 3 阶段即自动读取，并加 30 秒兜底 |
| 演出收尾 | 同一 tick 内抽掉 iframe，官方界面瞬间出现 | **已修**：交叉淡出（影片 520 ms 淡出 + 底层由 0.55 亮度 480 ms 落定） |
| 播放中的 `Space` | 与 `Enter` 同义：推进当前阶段 | **新功能**：**320ms 内连按两次** `Space` 紧急中止（单击仍是原义）→ **2.4 秒**红黑面板（白→红渐变、进度条 1/3 处完全变红；网格漂移 / 扫描带 / 脉冲辉光 / 雷达环 + 左上角同款 logo + 原版 `phase-5` 旁白）→ 直接进入 Harness |
| 左上角徽标 | 宿主未回报 `runtime` 时显示 `RUST`（静态预览、以及 DSH 刚启动尚未读到 profile 时都会出现） | **已修**：HTML 初始值与 JS 兜底都改为 `NATIVE`，不再闪 `RUST` |
| 与上游同步 | — | 历史已大幅分叉，**无法 `merge` 上游**；上游更新需手工挑选 |
| README | 563 行，讲整个 Rust 项目 | 本文件，只讲这个 addon |

---

## 它是什么

一个**官方 DSH 的可选 Cordis addon**，把开屏动画叠加在官方 Web UI 之上，**不修改已安装的 DSH 源码，也不替换 `dsh` 可执行文件**。

- 动画以全屏 `iframe` 覆盖层出现，官方界面被置为 `inert`，演出结束或按 `Esc` 后交还
- 数据来自官方运行时：读取本机 skills、当前挂载的 plugins（Loader fiber 真实状态）与默认预设的构成行
- 旁白是**预生成好的固定英文音频**，不做在线 TTS、不朗读用户名或插件数量
- 资源随包分发：两套视觉风格、纹章、中文字体子集、9 段旁白 WAV
- 端口与偏好都跟随官方 DSH，偏好单独隔离在 `$DSH_HOME/startup-animation`

## 演出阶段

| # | 阶段 | 英文标题 | 说明 |
|---|---|---|---|
| 0 | 深潜协议 | `DEEP DIVE / HARNESS` | 一道信号，开启新的深度 |
| 1 | 建立本地连接 | `LOCAL CONNECTION` | 连接当前 DSH 工作区 |
| 2 | 访问身份确认 | `IDENTITY VERIFICATION` | 确认身份后，读取本地 skills 与 plugins |
| 3 | 展开能力档案 | `READING LOCAL CAPABILITIES` | 直接读取本地 skills 与 plugins |
| 4 | 能力档案就绪 | `LOCAL LOAD COMPLETE` | 真实加载结果已返回 |
| 5 | 欢迎进入 DSH | `WELCOME TO DSH` | 新的探索，由此开始 |

旁白（固定英文，24 kHz PCM16，共 9 段）：`D. S. H. Startup sequence initiated.` → `Preparing the local workspace.` → `Operator profile confirmed.` → `Loading local skills and plugins.` → `Local resources loaded.` → `Welcome, Operator.`，另有 `load-warning` / `load-unavailable` 两个异常分支。

## 运行要求

| 场景 | 要求 |
|---|---|
| **桌面端（推荐路径）** | 官方 DSH 桌面版 + **Python 3**；**不需要** npm、Node 工具链或全局安装 |
| 官方 DSH 版本 | 在 `@deepseek-ai/dsh@0.2.0-rc.2` 上验证；大版本升级若接口变动需重新适配 |
| 网页 / CLI 路径（可选） | Node.js `^22.19.0 \|\| >=24.0.0` + `npm`（走上游安装器） |
| Rust / Cargo | **不需要** —— 本 addon 与上游的 Rust 部分完全解耦 |

## 安装

### 方式一：装进 DSH 桌面端（推荐，默认路径）

```bash
git clone https://github.com/A-common-Chinese/deepseek-harness-rust-optimize.git
cd deepseek-harness-rust-optimize
python scripts/install_startup_animation.py
```

它只做两件事，都不碰全局环境：

1. 把 addon 暂存到 `$DSH_HOME/startup-animation/plugin/`（默认 `~/.dsh/…`）
2. 在该 profile 的 `cordis.patch.yml` 里写入一段**带标记的挂载块**：按文件 URL 挂载 `plugin.mjs`，`override: true` 表示每次启动都播

| 参数 | 作用 |
|---|---|
| `--profile web` | 装进别的 profile（默认 `desktop`） |
| `--home /custom/.dsh` | 非默认的 DSH 根目录（默认读 `$DSH_HOME`，再退回 `~/.dsh`） |
| `--dry-run` | 只打印将要写入的内容，不改任何文件 |
| `--uninstall` | 整块移除挂载并删除暂存目录 |
| `--no-backup` | 不写 `cordis.patch.yml.bak-<时间戳>` 备份 |

重复执行是**幂等**的（更新同一个标记块，不会挂两次）；若 profile 里已有一行**手工挂载**的同 id 条目，它会拒绝执行并提示先清掉，避免同 id 挂两次。

完成后**完整重启 DSH**——客户端插件在启动时扫描，刷新页面不够。

### 方式二：官方 DSH 的网页 / CLI 路径（上游原生流程，可选）

```bash
python scripts/install_native_startup.py      # 需要 npm
dsh-native web --startup
```

安装器会把 addon 组装成 npm 包并**全局安装**（同时装入它依赖的固定版官方 DSH CLI）。这条路上游已说明**不覆盖 Electron 桌面端**，只作用于 CLI 起的网页会话。

### 方式三：只打包 / 装到独立前缀

```bash
python scripts/install_native_startup.py --pack-only            # 产出 tgz
python scripts/install_native_startup.py --prefix /path/prefix  # 不污染全局
```

## 使用（仅方式二）

方式一装进桌面端后**无需任何命令**：每次启动 DSH 就会播（`override: true`）。要关掉就把挂载块里的 `override` 改成 `false`，或用 `--uninstall` 整块移除。

| 命令 | 作用 |
|---|---|
| `dsh-native web --startup` | 启动官方 Web 并播放开屏演出 |
| `dsh-native web --no-startup` | 启动但不播 |
| `dsh-native startup next on\|off` | 只让**下一次**本地网页开屏时播放（首次打开后即被消费） |
| `dsh-native startup enabled on\|off` | 持久开关（**默认 off**） |
| `dsh-native startup profile` | 查看当前身份配置 |
| `dsh-native startup profile --name NAME --badge ID --visual-style rhine\|laterano` | 修改身份与视觉风格 |

其余参数原样转发给官方 CLI，例如 `dsh-native web --port 3081`。

**开关语义**：`--startup` / `--no-startup` 覆盖本次启动；`startup next` 会在首次成功打开本地网页时被一次性认领（`--help`、config dump、非 web profile 都不会消耗它）；**同一标签页会话内不会重播已播完/已跳过的演出**。

## 交互与键位

| 键 | 行为 |
|---|---|
| 点击画面 / `Enter` | 开始播放；播放中触发扫描波、推进当前阶段 |
| **`Space` ×2** | **紧急中止**（**320ms 内连按两次**；单击 `Space` 仍是原义"开始 / 推进阶段"，`Enter` 与点击保持零延迟）：立刻冻住当前演出 → 播一段约 **2.4 秒**的**红黑紧急代码确认**（从原版白黑观感渐变，进度条到 1/3 时完全变红；带网格漂移 / 扫描带 / 脉冲辉光 / 雷达环，**左上角保留同款 `DSH / HARNESS NATIVE` logo**，底部两行「跳过验证程序 / 正在紧急启动DeepSeek Harness」），并**直接复用原版最后一句旁白 `phase-5.wav`（"Welcome, Operator."，逐比特原声）** → 自动进入 Harness。该面板播放中再按一次 `Space` 可立即跳过（**面板上不显示该提示**） |
| `Esc` | 跳过演出，直接返回官方 Harness（不放紧急面板） |
| `C` | 收起/展开设置面板 |
| `M` | 静音 |
| ← / → | 切换当前阶段的选择项 |
| `R` / `P` | 重播 / 暂停 |

第一次播放需要一次用户交互才能出声——浏览器对无手势的音频有自动播放限制，这是浏览器策略，不是本插件可绕过的。

## 配置

身份与偏好保存在 `$DSH_HOME/startup-animation/`（`DSH_HOME` 未设置时为 `~/.dsh`）：

- `settings.json` —— `{ enabled, sound, username, badge_id, visual_style }`
  - `enabled` 默认 `false`
  - `username` 默认取操作系统用户名，`badge_id` 默认 `DSH-0001`
  - `visual_style` 默认 `rhine`
- `next.json` —— `startup next` 的一次性开关（被认领后即删除）

两套视觉风格随包分发，随时可切：

| 风格 | 说明 |
|---|---|
| `rhine` | 莱茵生命风（默认） |
| `laterano` | 拉特兰风（含纹章与书页动效） |

独立预览页也支持 URL 参数：`startup-preview.html?style=rhine|laterano&theme=dark|light`。

## 安全与边界

- 所有路由只挂 `/__dsh_startup` 前缀，且**只接受本机回环请求**（校验 `Host` / `Origin` / 远端地址）
- 读取启动数据的接口额外要求请求来自**已认证的官方页面**（`connection.requestRejection`）；写操作（保存身份、`/api/load`）还需带进程内随机 `x-dsh-token`
- 资源路径做了前缀逃逸校验，只提供包内 `assets/` 下的文件
- **不覆盖**的场景：Electron 桌面端、远程/LAN 托管、自定义 native profile；动画接口刻意只在本机回环可用

> 注：本 addon 的设计里还有"访问密码"这一层（上游 Rust 宿主侧的 `/api/access`）。官方 DSH 没有该接口，返回 404 时按"无锁"处理，不会因此卡住演出。

## 故障排查

| 现象 | 原因与处理 |
|---|---|
| `dsh-native` 运行后**毫无输出、退出码 0** | 用 **pnpm** 安装时必现：`node_modules/@dsh-rust/native-startup` 是指向 `.pnpm` 的软链，`import.meta.url` 解析为真实路径而 `process.argv[1]` 仍是软链路径，`cli.mjs` 末尾的相等判断不成立，`main()` 不执行。见下方「pnpm 安装」 |
| 没有声音 | 需要一次用户交互解锁音频（浏览器自动播放策略）；或按 `M` 取消静音 |
| 刷新页面后不再播 | 同一标签页会话内不重播（sessionStorage 标记）；换新标签页，或重启服务使 `instance` 变化 |
| 卡在"展开能力档案" | 原版会在此等待 `loadFinished()`，若从未发起读取就会一直等。**本 fork 已修**（自动发起 + 30 秒兜底） |
| 端口被占用 | `dsh-native web --port 3081`；若同工作区已有服务，会询问复用或重启 |

### pnpm 安装（需要启动器包一层）

```bash
pnpm add @dsh-rust/native-startup
# 或安装本地 tgz：pnpm add /path/to/dsh-rust-native-startup-0.1.0.tgz
```

pnpm 会把包放进 `.pnpm` 存储区并做软链，于是上面那条静默退出的问题必然出现。两个规避方式：

1. 用 `npm install --global` 安装（包路径是真实的，不会触发）
2. 包一层显式调用 `main()` 的启动器：

```js
// dsh-native-run.mjs
import { main } from '@dsh-rust/native-startup/cli.mjs';
await main(process.argv.slice(2));
```

```bash
node dsh-native-run.mjs web --startup
```

另外 pnpm 10+ 默认不执行依赖的构建脚本；若 `koffi` / `node-pty` 等原生包报错，需在 `pnpm-workspace.yaml` 里显式放行：

```yaml
allowBuilds:
  '@deepseek-ai/dsh-subprocess-local': true
  '@google/genai': true
  koffi: true
  node-pty: true
  protobufjs: true
```

## 本 fork 的两处修复

只改了 `native-startup` 的两处，分支 [`fix/startup-auto-inventory-smooth-handoff`](https://github.com/A-common-Chinese/deepseek-harness-rust-optimize/tree/fix/startup-auto-inventory-smooth-handoff)，可直接向上游提 PR。

**1. 开屏不再卡在"展开能力档案"等待点击** —— `docs/startup-preview.js`

`beginLocalLoad()` 原本只在两处被调用：`start()`（此时序列仍在第 0 阶段，函数内的 `sequence.phase===3` 守卫不会成立）与手动点"连接本地"。于是进入第 3 阶段后没有任何一方发起读取，`local.inventory.status` 停在 `idle`、`loadFinished()` 恒为 false，`barriers()` 便一直 hold 该阶段，必须用户点一下才继续。

现在第 3 阶段一打开即自动发起读取（该函数自身幂等），并加了 **30 秒兜底**：读取流卡死时也不再要求点击。

**2. 收尾衔接改为交叉淡出** —— `integrations/native-startup/overlay.mjs`

原本在收到 `complete` / `skip` 的同一 tick 内 `frame.remove()`，官方 Harness 会瞬间出现，观感生硬。现在影片在 520 ms 内淡出并轻微拉远（`scale(1.012)`），底层界面同时由 0.55 亮度用 480 ms 落定到 1；`dismiss()` 也补了幂等闸门，避免 `complete` 与 `Esc` 同时到达时执行两次。

## 与上游同步

```bash
git remote add upstream https://github.com/Ar1haraNaN7mI/deepseek-harness-rust-optimize.git
git fetch upstream
git checkout main && git merge upstream/main
```

本 fork 的 `main` 是**裁剪过的树**：它删掉了上游与本 addon 无关的全部内容，所以 `merge upstream/main` 会把这些文件原样带回来。上游有更新时请**手工挑选**（或按文件覆盖），不要直接合并。

本 fork 对上游的修复集中在 `fix/startup-auto-inventory-smooth-handoff` 分支：4 个提交、仅触及 3 个文件，且**已向上游提交 PR（#5）**——需要跟进度或参与评审就到上游那个 PR 页去看。

## 目录结构

| 路径 | 作用 |
|---|---|
| `integrations/native-startup/cli.mjs` | `dsh-native` 入口：临时写入 patch 后调用官方 CLI |
| `integrations/native-startup/plugin.mjs` | Cordis 插件本体：路由、回环校验、真实清单读取 |
| `integrations/native-startup/overlay.mjs` | 注入到官方页面的覆盖层脚本（iframe 生命周期） |
| `integrations/native-startup/bridge.mjs` | iframe 内的 fetch 前缀改写与文案替换 |
| `integrations/native-startup/state.mjs` | 偏好读写与 `startup next` 的一次性认领 |
| `integrations/native-startup/test.mjs` | 集成自测（`node --test test.mjs`） |
| `docs/startup-*.js` `*.html` `*.css` | 动画本体与预览页（打包时复制进 `assets/`） |
| `docs/assets/{voice,fonts,licenses}` | 旁白 WAV、字体子集、素材许可 |
| `scripts/install_startup_animation.py` | **桌面端安装器（默认路径）**：暂存 addon 并把挂载块写进 profile |
| `scripts/install_native_startup.py` | 上游安装器：组装 npm 包并全局安装（网页/CLI 路径） |
| `scripts/patch_startup_*.py` | 本 fork 的补丁脚本（清单自动加载 / 收尾交叉淡出 / 面板停留 / token 自愈 / 紧急面板），全部幂等、可从历史版本重放 |
| `scripts/preview_startup_animation.py` | 网页预览服务器：把 addon 置于自带静态预览模式，回环只读，无需 DSH 即可在浏览器里看动画 |

## 许可与素材来源

- **代码**（`integrations/native-startup/**`、`docs/startup-*.{js,html,css}`、`scripts/` 下的维护脚本）：**MIT**（`integrations/native-startup/LICENSE`）
- **美术与音频**（`docs/assets/**`）：**不在 MIT 覆盖范围**，按 as-is 随插件分发，仅供运行本插件使用，不授予再许可。逐项来源记录在 `docs/assets/voice/manifest.json`（旁白生成方式、模型、参考音与 SHA-256）、`docs/assets/fonts/README.md`、`docs/assets/licenses/RhineLabUI-MIT.txt`
- 旁白由 `Qwen/Qwen3-TTS-12Hz-1.7B-Base`（Apache-2.0）以声线克隆方式预生成，24 kHz PCM16
- 紧急面板（`Space`）的旁白**直接复用上面这批里的 `phase-5.wav`**（"Welcome, Operator."），不做任何生成或处理，因此与原版逐比特一致
- 中文字体为 Noto Sans SC 子集（`docs/assets/fonts/dsh-industrial-sc.woff2`），许可见 `docs/assets/fonts/OFL-NotoSansSC.txt`
