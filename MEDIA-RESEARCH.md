# Media Research

记录日期：2026-10-27。实验日期：2026-10-23；2026-10-27 重启后确认前 3 张重新加载成功，用户完成手动体验并认可结果。

## 2026-10-27 正式视图接入（仅本地）

以下实现状态更新取代本文后面“正式视图尚未接入”的早期原型状态：

- Horizontal、Grid、Slideshow 已改用普通图片，移除正式视图的 iframe 及裁切缩放；主视图每个 post 只展示首图。
- 点开 post 后进入接近全屏的照片面板，复用三个视图，仅展示当前 post 的图片；无日期筛选，保留 Slideshow 时长及转场设置。面板图片按原顺序浏览，背景播放暂停。
- 完整清单使用 `Accept: application/activity+json` 请求 `https://oginstagram.com/p/<SHORTCODE>/?img_index=1`。固定版本 `server/helpers.go` 的 `selectActivityAttachments` 说明：默认清单最多 4 张，指定索引后返回单项，开头统计段提供 `1 / 总数`。按这个明确总数分批获取指定索引，不递增猜测终点；过滤视频并保留原始索引。
- 真实样本 `DafZycbCAR_` 返回 7 项，其中 5 张图片、2 段视频；本地浏览器实际加载了 5 张图片。
- 连续开发刷新后公共服务出现 HTTP 429，后续新请求仍被限流，因此停止外部重试。已增加同帖并发清单请求合并及短时缓存；这不代表上游限流已解除，也不保证公共服务长期可用。
- 公共清单响应未开放 CORS。本地由 Vite 的 `/api/instagram` 转发，仅清单经过本地服务，图片使用 `d.oginstagram.com`。来源可用 `VITE_INSTAGRAM_MEDIA_ORIGIN`、`VITE_INSTAGRAM_METADATA_ORIGIN` 替换。
- 用户明确选择本轮仅本地体验，不推送、不部署。将来上线前必须提供可跨域读取的清单服务；GitHub Pages 本身不能运行 Vite 开发代理。

本轮体验入口：`http://127.0.0.1:5176/`；原有 iframe 实验入口保留用于对照。

### 后续生产接入

用户随后授权推送和部署。生产清单接口现为 `https://instagram-viewer-metadata.bradwang1995.workers.dev`，仅允许本站来源的浏览器跨域读取，路由限制为指定帖子的 1–50 号媒体；不是通用 URL 代理。成功清单在边缘缓存 5 分钟，失败不缓存、不自动重试。前端另有同帖请求合并和 10 分钟内存缓存，最多保留 100 帖清单；图片预加载缓存仍最多保留 24 个图片元素。刷新页面会清空这些前端内存缓存。

Worker 与 GitHub Pages 分开发布，维护命令见 `worker/README.md`。上线前实测 Worker 返回真实帖子的 HTTP 200、ActivityPub 内容和本站 CORS 响应头。此服务仍依赖 OGInstagram，不能消除其限流及上游 Instagram 的访问限制。

## 结论与当前状态

### 生产多帖加载修复

用户报告多图加载失败、密集 429 和滚动卡顿后，检查确认：旧实现会在封面失败时移除整个 post，触发列表重排及后续封面请求；旧 service worker 还会持久保存状态不可见的 opaque 跨域响应。

当前实现通过清单接口的 `resolve=1` 解析签名媒体跳转，浏览器直接加载校验过的 Instagram CDN 图片地址。封面与面板共享单项清单缓存，元数据最多并发 2 个请求；429 后按 Retry-After 冷却，最少 60 秒，期间不继续向上游发送排队请求。离开加载窗口的待执行封面任务取消，失败图片保留原位置并提供手动重试。

主视图只挂载当前保留窗口的卡片；滚动时每帧更新窗口，持续滚轮输入每 180ms 恢复可用步数，避免整个手势停住。打开照片面板或主 Slideshow 时暂停背景视图加载，取消重复预加载路径。尺寸、间距、字体及三个视图的布局算法不变。

图片 service worker 更新为 v2，激活时移除旧 v1 图片缓存；仅缓存本站明确成功的图片，最多 80 项，不缓存跨域 opaque 响应。CDN 图片由浏览器正常 HTTP 缓存处理，存储配额错误不会让成功图片显示失败。此处只清理应用图片缓存，不清理导入的帖子数据库。

目标是只展示帖子图片，不显示 Instagram 白框、头像、点赞、分享等原生控件，并由本项目程序控制下一张及自动轮播。

**已验证可行的路径：OGInstagram 纯媒体地址 → 普通 `<img>` → 我们自己的播放器。**这不是控制 Instagram iframe 内部轮播，而是独立展示各张媒体。原型已成功，正式 Horizontal、Grid、Slideshow 尚未接入；本记录不改变正式应用行为。

| 路径                                          | 实际观察                               | 可否满足目标                         |
| --------------------------------------------- | -------------------------------------- | ------------------------------------ |
| 原生 `/embed/`，手动点 Next                   | 同一个 iframe 内成功显示第二张         | 可手动浏览，但不是程序控制           |
| `/embed/?img_index=2`                         | 仍显示第一张                           | 本次未成功                           |
| `captioned` 加 index、`page=2`、autoplay 参数 | 未观察到定位第二张或自动播放           | 本次未成功                           |
| `next=1`                                      | 一次出现后面图片，重载无法稳定复现     | 不作为可用接口                       |
| 父页面访问内部 DOM、合成方向键                | `SecurityError`                        | 无法用此方式跨域控制                 |
| 两种猜测的 `postMessage next` 及定时发送      | 没有切图；只观察到加载、尺寸等返回消息 | 不作为可用协议                       |
| 普通帖子页独立打开 `?img_index=2`             | 定位第二张成功                         | 只能作为外部页面对照                 |
| 普通帖子页放进 iframe                         | 浏览器显示 refused to connect          | 套更多 iframe 或刷新不能当作解决方案 |
| OGInstagram 纯媒体 + 本地图片播放器           | 前 3 张加载、手动切换、每 2 秒循环成功 | **已验证目标体验**                   |

以上原生参数结论只覆盖同一条公开多图帖和当时浏览器环境，不能推断所有私有协议均不存在。浏览器自动化工具拥有的跨框架检查能力也不属于我们网页脚本的权限。

## 服务身份、开源许可与版本

用户口中的“插件”在这里指 **OGInstagram 开源代理服务**，不是官方 Instagram API，也不是已安装到本项目的浏览器扩展或 npm 插件。当前原型只是请求它的公共媒体域名。

- 上游仓库：[seirenkr/OGInstagram](https://github.com/seirenkr/OGInstagram)。
- 已核实源码提交：[`a92f5372880b61da9c2ba72e539a64ae4ef0350c`](https://github.com/seirenkr/OGInstagram/tree/a92f5372880b61da9c2ba72e539a64ae4ef0350c)。这是 2026-10-27 获取的上游 HEAD，不代表公共服务正在运行该版本。
- 许可：[MIT LICENSE](https://github.com/seirenkr/OGInstagram/blob/a92f5372880b61da9c2ba72e539a64ae4ef0350c/LICENSE)，版权声明为 `Copyright (c) 2026 LilasKR`。允许复制、修改和分发软件，保留许可要求的版权及许可声明。
- 第三方依赖和素材另查 [THIRD_PARTY_NOTICES.md](https://github.com/seirenkr/OGInstagram/blob/a92f5372880b61da9c2ba72e539a64ae4ef0350c/THIRD_PARTY_NOTICES.md)。代码许可不代表 Instagram 图片本身的使用授权。
- 运行说明：[固定版本 README](https://github.com/seirenkr/OGInstagram/blob/a92f5372880b61da9c2ba72e539a64ae4ef0350c/README.md)。

**我们可以维护自己的 fork 和服务，不必永远绑定公共域名；但开源不代表上游 Instagram 的访问限制、网络依赖和运维成本会消失。**本次只核实源码和配置，没有 fork、安装、启动或部署上游服务。

## 已验证的请求约定

| 域名                | 上游说明               | 本项目用途       |
| ------------------- | ---------------------- | ---------------- |
| `oginstagram.com`   | 作者、说明、统计、媒体 | 非本次纯图片目标 |
| `g.oginstagram.com` | 作者及媒体             | 非本次纯图片目标 |
| `d.oginstagram.com` | 仅媒体文件             | **原型实际采用** |

原始链接：`https://www.instagram.com/p/<SHORTCODE>/`

```text
第一张：https://d.oginstagram.com/p/<SHORTCODE>/?img_index=1
第二张：https://d.oginstagram.com/p/<SHORTCODE>/?img_index=2
第三张：https://d.oginstagram.com/p/<SHORTCODE>/?img_index=3
```

- `img_index` 是从 **1** 开始的整数，不是布尔值 `true`，也不要把原生 `/embed/` 追加到代理地址上。
- 上游 [shared/routes.ts](https://github.com/seirenkr/OGInstagram/blob/a92f5372880b61da9c2ba72e539a64ae4ef0350c/shared/routes.ts) 中，`mediaSelection` 还处理从 0 开始的 `index` / `order`，并对索引作边界约束；它们没有在本次浏览器实验中验证。继续采用实际验证过的 `img_index`，不要混用编号体系。
- 本次纯媒体请求跳转到了 Instagram CDN 的 JPG。它不是返回完整轮播清单的 JSON API；不能假设每次都直接返回同一种响应形式。
- 原型用不带 `crossOrigin` 属性的普通图片元素加载成功。不需要通过网页脚本读取跨域 HTML，也没有通过 fetch 读取图片字节。**这不证明 fetch、Canvas 导出或 CORS 已获允许。**
- 程序在预加载的图片元素之间每 2000ms 切换，不需要每次刷新 Instagram 页面。正式播放器可以完全不显示按钮，测试按钮只是验证工具。

## 实验入口与复现依据

项目现有文件：

- [src/pages/EmbedLab.tsx](./src/pages/EmbedLab.tsx)：原生 iframe 参数和控制实验，只在开发环境的 `/embed-lab` 开放，自动读取项目根目录的 `saved_posts.json`。
- [src/tests/EmbedLab.test.tsx](./src/tests/EmbedLab.test.tsx)：JSON 预载和参数定时器等本地行为测试；它不证明 Instagram 在线行为。
- `embed-lab.local/proxy-test.html`：纯图片实验，仅当前本地目录保存，受 `*.local` 忽略规则保护，**没有提交进仓库**。
- `embed-lab.local/report.md`：早期详细实验报告；其“尚未测试代理”状态已由本文补充的成功实验取代。
- `embed-lab.local/upstream-reference/`：固定提交的 README、LICENSE、package.json、.env.example、server/config.go、shared/routes.ts 参考副本，仅本地保存，不是完整源码 checkout。

本地启动命令：

```powershell
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5175 --strictPort
```

- 原生实验：`http://127.0.0.1:5175/embed-lab`
- 纯图片实验：`http://127.0.0.1:5175/embed-lab.local/proxy-test.html`

纯图片原型使用 JSON 中第一条公开 `/p/` 多图帖，前 3 张成功加载尺寸分别为 `2810×3523`、`2487×3102`、`2431×3032`；已验证手动下一张以及两秒自动切至第三张再回第一张。原型硬编码了已知的 3 张，**没有实现整帖图片数量发现**。新 checkout 不包含被忽略的 JSON、HTML 和截图；重新复现时应使用自己可访问的公开多图帖，按上面的 URL 规则预载前 3 张，再切换显示。

## 自行维护时应保留的配置知识

下面记录的是上游固定版本设置，**不是本项目已配置的环境变量**，也不是一份已通过验证的自托管部署教程。配置入口为 [.env.example](https://github.com/seirenkr/OGInstagram/blob/a92f5372880b61da9c2ba72e539a64ae4ef0350c/.env.example) 和 [server/config.go](https://github.com/seirenkr/OGInstagram/blob/a92f5372880b61da9c2ba72e539a64ae4ef0350c/server/config.go)。

| 配置                                          | 上游用途 / 注意点                                                                                   |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `BASE_URL`                                    | 默认 `https://oginstagram.com`；派生允许的主域、`www.`、`d.`、`g.` 主机。自托管应替换为自己的服务源 |
| `PROXY_USERNAME` / `PROXY_PASSWORD`           | 上游网络代理凭据，需成对设置；该版本生产模式要求提供。示例使用 DataImpulse，不是 Instagram 账号密码 |
| `TRUSTED_PROXIES`                             | 可信反向代理地址范围；生产模式要求，不能误填成不受限制的范围                                        |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | 上游首页预览验证配置；该版本生产模式要求提供                                                        |
| `OFFLOAD_SIGNING_KEYS`                        | 生产模式要求的媒体链接签名密钥集合；格式见示例，不在本仓库记录真实值                                |
| `DATA_DIR` / `ASSETS_DIR`                     | 默认 `./data` / `../web/dist`；容器使用自己的目录映射                                               |
| `DEVELOPMENT`                                 | 仅字面值 `true` 打开开发模式；不应把它当生产环境配置的替代方案                                      |
| `OG_IMAGE`                                    | Docker 镜像选择，示例默认 `oginstagram:local`                                                       |

上游 [package.json](https://github.com/seirenkr/OGInstagram/blob/a92f5372880b61da9c2ba72e539a64ae4ef0350c/package.json) 固定 `pnpm@11.13.1`，Node 要求为 `^22.13.0 || >=24`；检查流程还包括 Go 后端测试，因此不是单纯把 React 页面放到静态托管即可运行完整服务。原型使用公共服务时没有输入这些凭据。

上游 README 提供 `pnpm install --frozen-lockfile`、`pnpm run dev`、`pnpm run check`；生产部署另参考 `compose.yaml`、`tools/deploy.sh` 和其 Cloudflare Tunnel / 数据目录要求。这里只记录入口，不执行这些安装和部署操作。

## 故障排查与维护自己的版本

1. **先区分 UI 问题和媒体来源问题。**以一条已知公开多图帖，分别检查代理第 1、2、3 张能否加载；再检查自己的播放器。能显示首张不代表后面几张一定存在或可访问。
2. **检查实际响应和重定向。**记录错误码、最终内容类型以及是否跳到验证页或错误页；不要把 `load`、HTTP 200 或下一张编号变化当作图片已经成功加载。
3. **不要永久保存一次返回的 CDN 签名链接。**它可能失效；保留帖子 shortcode、索引、来源服务等可重新解析的标识。实际有效期本次没有测量。
4. **如果是上游解析或访问问题，查看对应源码。**先从固定版本的 `shared/routes.ts`、`server/routes.go` 和 `server/config.go` 定位参数和配置，再沿调用链排查实际获取 / 解析逻辑；这些文件不是已验证的修复点。
5. **需要修改时，在独立 checkout / fork 中工作。**先保留本文固定提交作为基线，复现失败并运行上游检查，再做最小修复；保留 MIT 声明及相关第三方通知。本次未建立 fork 或维护分支。
6. **将自有实例作为可替换的媒体来源。**未来接入正式展厅时，服务基址应可替换，避免域名散落在播放器里。此项是后续实现建议，不是本次已完成改动。

## 尚未解决的工程问题

- 完整轮播数量和视频混排发现；超范围索引的实际行为尚未测试，不能通过一直递增猜测数量。
- 更多帖子和长时间运行的成功率、限流、访问验证、错误重试以及图片过期处理。
- 公共代理服务可用性及自托管的真实网络条件和运维成本。
- 用户帖子链接会发送给第三方服务；JSON 不必上传，但不能继续把这种路径描述成“所有请求仅到 Instagram”。
- 正式展厅尚未集成此方案；原有 iframe 展示和浏览体验基线保持不变。

## 文档边界与发布约束

本文是核心浏览机制的研究与维护参考，不替代 [EXPERIENCE.md](./EXPERIENCE.md) 的正式体验基线或 [PROGRESS.md](./PROGRESS.md) 的产品进度。正式接入需要另行实施和验证。

本轮仍遵守会话中的本地验证范围，不推送或部署。仓库的 `.github/workflows/deploy-pages.yml` 会在推送 `main` 时触发部署；以后发布本文所在提交时，应先检查是否同时包含尚未发布的实验页提交，不应仅凭“文档改动”假定不会部署。
