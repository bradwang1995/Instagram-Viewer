# 本机个人版

本机 Viewer 和 OG 核心只监听 `127.0.0.1`，不需要 Oracle、域名、端口转发或 Tunnel。现有 GitHub Pages 网站仍独立运行；线上网页不会连接你的电脑。

## 每次使用

1. 双击项目根目录的 **Start Personal Viewer.cmd**。首次启动会编译 OG 核心，完成后打开 `http://127.0.0.1:5178/`。
2. 导入原来的 Instagram 收藏 JSON。浏览器会在该本地地址保存导入记录；它与 GitHub Pages 的浏览器数据库不同，因此第一次需要重新导入。
3. 使用原有 Horizontal、Grid 和 Slideshow。主页仅展示每帖首图，点击后查看该帖多图。
4. 不用了可以双击 **Stop Personal Viewer.cmd**；关机后服务也会停止。下次启动保留缓存。

启动命令可重复执行，已运行时复用现有服务。若出现启动错误，窗口会保留提示。不要同时启动多个启动脚本。默认不注册 Windows 开机自启。

## 缓存和联网

- 帖子完整清单只获取一次，随后由本地服务返回；并发相同请求合并。
- 图片按需下载到 `embed-lab.local/personal/images/`。已缓存图片可直接读取，不依赖临时 CDN 链接；新的图片和过期清单仍需要联网。
- 磁盘媒体缓存最多约 **2 GiB 或 2000 个文件**，按较早使用的文件淘汰，单图限制 20 MiB。不自动预下载整个收藏库。
- Node 侧清单有效期 6 小时，OG SQLite 还有上游自己的缓存有效期。图片返回 403/404/410 时刷新一次清单再试；遇到限流会暂停新下载，保留已有图片。
- 核心 SQLite 数据保存在 `embed-lab.local/personal/data/`；日志和进程记录也在该个人目录。上述文件均被 Git 忽略，不随 push/deploy 发布。
- 失败会短暂冷却，不能保证所有 Instagram 帖子可用，也不会把一次失败永久写成删除/私密。

## 本机准备与维护

当前电脑已经准备 Node/npm、依赖、Go 和上游 checkout。启动脚本固定校验上游提交 `a92f5372880b61da9c2ba72e539a64ae4ef0350c`，编译 `scripts/personal_core_test.go` 中的专用回环 API（无公共 OG 转发）。它与旧 `/lab/` 报告服务独立，核心端口为 18081。

新电脑需要自行准备 Node 和 `npm ci`、兼容的 Go 工具链（当前使用 1.27.3，目录 `embed-lab.local/toolchains/go`），并将固定版本上游放到 `embed-lab.local/oginstagram-selfhost`。Windows 上按 [实验说明](./experiments/oginstagram-core/README.md) 应用 SQLite 路径补丁。启动入口不是自动安装程序，缺少这些文件时会报错。

修改个人核心源码后先停止再重新启动以重新编译。启动和停止脚本只管理自己记录的进程，不终止其他 Node/Go 服务。若端口被占用则报错，不强制抢占。

当前个人入口使用 Vite 本地服务，不适合作为公网生产服务器；不要改为 `0.0.0.0`、对公网开放端口或上传该数据目录。无需修改 Windows 脚本执行策略；若系统策略禁止运行脚本，保留错误信息再排查，不自动降低安全设置。
