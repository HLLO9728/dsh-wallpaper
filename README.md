# dsh-wallpaper

一个为 **DeepSeek Harness Web**（`dsh web`）编写的插件，让你自定义会话界面的背景壁纸。

- 支持**单张**静态/动态壁纸，也支持**多张轮播**（可混合静态图、动态图 GIF、视频）。
- 支持 **GIF / Animated WebP / 视频（mp4、webm 等）** 作为动态壁纸。
- 提供 `opacity`（不透明度）、`blur`（模糊）、`dim`（压暗遮罩）、`fit`（填充方式）等，保证聊天内容清晰可读。
- 配置是一个**简单的 YAML 文件 + 一个放图片/视频的文件夹**，改动保存后**自动热重载**，无需重启。
- 预构建、开箱即用：仓库本身就是 npm 包，无需编译即可安装。

---

## 工作原理（快速了解）

DSH 插件分为“主机端（host）”与“浏览器端（client）”两部分：

| 部分 | 文件 | 作用 |
|------|------|------|
| host（Node 端） | `lib/index.js` | 读取 `wallpaper.yml`、托管 `$DSH_HOME/wallpaper` 文件夹里的图片/视频，通过本地 HTTP 提供给浏览器。 |
| client（浏览器端） | `lib/client.js` | 在网页里把壁纸渲染到会话界面最底层，处理轮播与动态播放。 |

浏览器端每隔约 3 秒拉取一次 `/wallpaper/config`，所以编辑 `wallpaper.yml` 保存后，页面会自动套用最新设置。

---

## 快速开始

### 1. 安装插件

把 `dsh-wallpaper` 加进你的 DSH **web profile**。以默认的 `dsh web` 为例，profile 目录在：

- `$DSH_HOME/profiles/web/`（Windows 默认 `C:\Users\<你>\.dsh\profiles\web`）

在 profile 目录里安装依赖并把插件加进 `bundles`：

```jsonc
// $DSH_HOME/profiles/web/package.json
{
  "name": "dsh-profile-web",
  "private": true,
  "dependencies": {
    "dsh-wallpaper": "github:HLLO9728/dsh-wallpaper"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "deepseek-pet",
        "dsh-wallpaper"
      ]
    }
  }
}
```

或者用命令装（等价，会在 profile 里自动写进依赖并加进 `bundles`）：

```bash
cd "$DSH_HOME/profiles/web"        # Windows 默认 C:\Users\<你>\.dsh\profiles\web
dsh plugin --profile web add github:HLLO9728/dsh-wallpaper
```

装完重启一次 `dsh web`（新增插件 bundle 需要重启）；之后改动 `wallpaper.yml` 不需要重启，2~3 秒自动生效。

> 需要 SSH 访问私有仓库时用 `git+ssh://git@github.com/HLLO9728/dsh-wallpaper.git`。

> **不习惯改 `package.json`？** 也可以直接在 profile 的 `cordis.patch.yml` 里插入一行，
> 前提是插件已经装到了 profile 的 `node_modules`：
> ```yaml
> - insert:
>     - id: wallpaper
>       name: dsh-wallpaper
> ```

### 2. 准备媒体文件与配置

默认媒体目录是 `$DSH_HOME/wallpaper`（Windows 默认 `C:\Users\<你>\.dsh\wallpaper`）。
把图片/视频放进去，并新建 `wallpaper.yml`：

```text
$DSH_HOME/wallpaper/
├── wallpaper.yml     # 你的配置
├── mountains.jpg     # 静态图片
├── aurora.mp4        # 动态视频
└── sparkle.gif       # 动态 GIF
```

可以复制仓库里的示例 `media-example/wallpaper.example.yml` 作为起点。

### 3. 编辑配置

参考下面的**配置说明**。保存 `wallpaper.yml` 后，等几秒页面就会自动更新。

---

## 配置说明（`wallpaper.yml`）

```yaml
# 总开关
enabled: true

# static / carousel / off
mode: static

# 轮播间隔（秒），仅 mode=carousel 时生效
intervalSec: 30

# 切换动画时长（毫秒）
transitionMs: 800

# 整体不透明度 0~1
opacity: 1.0

# 高斯模糊像素（0=不模糊）
blur: 0

# 黑色压暗遮罩 0~1，让文字更清晰
dim: 0.20

# cover（铺满裁切） / contain（完整显示）
fit: cover

# 壁纸列表（按顺序）
wallpapers:
  - file: mountains.jpg
    title: 山景
    type: image

  - file: aurora.mp4
    title: 极光
    type: video

  - file: sparkle.gif
    title: 闪烁
    type: image
```

### 字段说明

| 顶层字段 | 取值 | 说明 |
|----------|------|------|
| `enabled` | `true` / `false` | 总开关。 |
| `mode` | `static` / `carousel` / `off` | `static` 只显示第一张；`carousel` 轮播；`off` 关闭。 |
| `intervalSec` | 数字 | 轮播切换间隔（秒）。 |
| `transitionMs` | 数字 | 切换淡入淡出动画时长（毫秒）。 |
| `opacity` | `0`~`1` | 壁纸整体不透明度。 |
| `blur` | `0`~`100` (px) | 背景高斯模糊。 |
| `dim` | `0`~`1` | 叠加一层黑色半透明遮罩，提高文字对比度。 |
| `fit` | `cover` / `contain` | `cover` 铺满并裁切；`contain` 完整显示（可能留边）。 |

### `wallpapers` 每一项

| 字段 | 必填 | 说明 |
|------|------|------|
| `file` | 是 | 文件名，相对于 `$DSH_HOME/wallpaper` 目录。 |
| `title` | 否 | 可选标题（用作图片 `alt`）。 |
| `type` | 否 | `image` 或 `video`。不填则按扩展名自动判断（`.mp4/.webm/.mov/.ogg` 视为视频，其余视为图片）。 |

---

## 效果示例

**单张静态壁纸：**

```yaml
enabled: true
mode: static
opacity: 1.0
dim: 0.25
wallpapers:
  - file: mountains.jpg
```

**单张动态视频壁纸：**

```yaml
enabled: true
mode: static
opacity: 0.9
wallpapers:
  - file: aurora.mp4
    type: video
```

**三张静态 + 一张动态，每 60 秒轮播一张：**

```yaml
enabled: true
mode: carousel
intervalSec: 60
transitionMs: 1200
dim: 0.3
wallpapers:
  - file: mountains.jpg
  - file: ocean.jpg
  - file: aurora.mp4
    type: video
  - file: sparkle.gif
```

---

## 自定义目录（可选）

默认使用 `$DSH_HOME/wallpaper`。你也可以通过环境变量 `WALLPAPER_DIR` 指定其它目录
（可用于测试、或多 profile 共享同一批壁纸）：

```bash
# Windows (PowerShell)
$env:WALLPAPER_DIR = "D:\my-wallpapers"
# Linux/macOS
export WALLPAPER_DIR="$HOME/Pictures/dsh-wallpapers"
```

启动 `dsh web` 时该目录生效。

---

## 开发 / 二次开发

本项目**直接提交预构建产物**，`lib/index.js`（host）与 `lib/client.js`（client）
就是最终运行文件，无需构建。

- host 端是普通 ESM Node 模块，只依赖 `js-yaml`。
- client 端是 `window.__ModuleLoader__.load({ id, factory })` 形式的浏览器 bundle，
  遵循 DSH 浏览器插件契约（参见同目录下参考实现 `deepseek-pet` 或 DSH 内置的
  `@deepseek-ai/dsh-client-ui-*` 系列）。它不依赖 React，纯 DOM 实现，因此无需打包步骤。

> `npm run build` 目前只是提示脚本（因为产物已预编译提交）。如果你大改 `lib/client.js`，
> 保持其 `__ModuleLoader__.load` 包裹形式即可，无需额外工具链。

### 本地让 DSH 加载本仓库（开发时）

把本仓库通过 `file:` 依赖装进 profile：

```jsonc
// profile 的 package.json
"dependencies": { "dsh-wallpaper": "file:C:/Users/<你>/Desktop/wallpaper" }
```

再执行 `pnpm install`（profile 目录内），并把 `dsh-wallpaper` 加进 `bundles`，重启 `dsh web` 即可。

---

## 发布到 GitHub

把本目录推到一个 GitHub 仓库（仓库名建议就叫 `wallpaper`）：

```bash
cd C:\Users\28388\Desktop\wallpaper
git init
git add .
git commit -m "feat: dsh-wallpaper v0.1.0 - DSH session background plugin"
git branch -M main
git remote add origin https://github.com/HLLO9728/dsh-wallpaper.git
git push -u origin main
```

`.gitignore` 已过滤 `node_modules` 与媒体文件，仓库保持干净、不含任何私有壁纸文件。

> 只发布 GitHub 时，别人用 `github:HLLO9728/dsh-wallpaper` 安装即可，无需 npm。
> （本项目暂不发布 npm。）

---

## 已知限制 / 说明

- **让壁纸“穿透”显示**：插件会自动把 DSH 主界面的**最底层全幅表面**置为透明
  （通过 MutationObserver 双向扫描 `#root`，找到铺满视口的布局框架并对其应用
  `background-color: transparent !important`，同时把其身上的 `--dsw-alias-bg-base`
  置为 `transparent`）。侧边栏等次级表面会保留自身层级以保证可读性；再配合
  `dim`/`opacity` 让聊天文字清晰。若某些版本布局变了导致壁纸被遮挡，可微调
  `lib/client.js` 里 `reveal` 的扫描逻辑。
- **轮播间隔**最小为 1 秒；`wallpaper.yml` 校验失败（如 YAML 写错）时不会崩溃，
  而是维持上一个可用配置。
- 动态视频在浏览器端自动 `muted + loop + playsInline`（符合浏览器自动播放策略）。
- 本项目与 DeepSeek Harness 官方无关，是社区插件。

---

## 实机验证

已通过**在真实 boot 的 DSH web profile**（隔离的临时 `$DSH_HOME`）中安装并实测：

| 检查点 | 结果 |
|--------|------|
| 插件 bundle 正确编入配置树（`--dump-config` 含 `wallpaper` 行） | ✅ |
| `/wallpaper/config` 返回解析后的 JSON 配置 | ✅ `200` |
| `/wallpaper/file/<file>` 返回真实媒体文件 | ✅ `200 image/png` |
| 缺失文件 | ✅ `404` |
| 错误请求方法 | ✅ `405` |
| 路径穿越（`..` / 编码 `%2e%2e`）/ `..%2F` | ✅ 全部被拦截（`403`，且 URL 规范化使其无法匹配 `/wallpaper/file` 前缀） |
| 浏览器端 bundle 被 DSH 插件系统发现并通过 `/plugins/dsh-wallpaper/client.js` 提供 | ✅ `200 text/javascript` |

> 测试中修复了一个会阻断媒体文件的真实 bug：`webServer` 的前缀路由要求 `pathname.startsWith(prefix + '/')`，因此注册前缀必须**不带**尾部 `/`。
> 本项目已按此修正（`register('prefix', '/wallpaper/file')`）。

---

## License

[MIT](LICENSE)
