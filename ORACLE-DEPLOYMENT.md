# Oracle 免费试运行执行计划

核对日期：2026-10-28。当前状态：本机核心验证完成，Oracle 账号和云实例尚未创建；网站仍使用当前生产媒体来源。

## 1. 注册前准备（由账号持有人完成）

- 常用邮箱、真实姓名、居住国家、账单地址、可验证的手机号。
- 本人的有效信用卡，或 Oracle 接受的可按信用卡方式验证的借记卡；不使用虚拟卡、预付卡。可能有可撤销的临时预授权。
- 密码管理器和 MFA 验证方式。密码、验证码、银行卡资料、SSH 私钥均不放入聊天或 Git。
- 入口：[Oracle Cloud Free Tier](https://www.oracle.com/cloud/free/)。每人仅一个免费账号。

## 2. 注册步骤

1. 选择真实居住国家，填写姓名、邮箱并完成邮件验证。
2. 设置密码、cloud account name（例如可用的 `brad-instagram-lab`）；个人用途无需虚构公司。
3. 选择 Home Region。如果人和主要使用地点在多伦多，建议在注册列表提供时选 Canada Southeast (Toronto)。这只是就近建议，不保证免费库存；Home Region 注册后不能更改，免费计算资源必须建在该区域。
4. 填写地址和手机号，自己完成付款方式验证、条款确认和账号提交。
5. 登录 OCI Console，设置 MFA，记录 account name 和 Home Region。

不要主动升级 Pay As You Go。注册可能同时附送 30 天试用金，但本计划只用 Always Free；不能因试用金抵扣后显示 $0 就认为长期免费。

依据：[注册说明](https://docs.oracle.com/en-us/iaas/Content/GSG/Tasks/signingup_topic-Sign_Up_for_Free_Oracle_Cloud_Promotion.htm)、[免费账号 FAQ](https://www.oracle.com/cloud/free/faq/)。

## 3. 创建实例的建议选项

路径：Compute → Instances → Create instance。界面文案以当前控制台为准。

| 项目 | 建议 |
| --- | --- |
| Compartment | 新建 `instagram-lab`，便于集中核对和清理资源 |
| Name | `oginstagram-trial` |
| Region | 账号的 Home Region |
| Image | 官方 Ubuntu 24.04 LTS ARM64（若提供且显示免费兼容）；不用 Marketplace 收费镜像 |
| Shape | `VM.Standard.A1.Flex`，Ampere ARM |
| CPU / Memory | 1 OCPU / 4 GB，单实例起步 |
| Boot volume | 50 GB，默认性能，不加额外磁盘或付费备份策略 |
| Network | 专用实验 VCN、public subnet、Internet Gateway；不用 NAT Gateway、负载均衡器 |
| Public IP | 用于初次 SSH 和出口验证的公网 IPv4；创建前核对控制台该资源计价 |
| SSH | SSH key；私钥由用户保存在本机，服务器仅接收公钥 |
| Ingress | SSH 22 仅允许本人的公网 IP/32；不要向公网开放实验服务 18080 |
| Extras | 不启用付费监控、GPU、额外存储、自动备份等选项 |

创建前核对所有资源和现有总用量。当前官方 A1 免费月额度为 1,500 OCPU-hours / 9,000 GB-hours，约合合计 2 OCPU / 12 GB；块存储合计 200 GB。1 OCPU / 4 GB / 50 GB 是本项目的起步建议，不是必须用满额度。控制台可能显示形状估价，不能仅凭一个美元数字判断：应同时确认 Always Free 资格、总额度和各附属资源是否收费；不明确时先不创建。

若报 `Out of host capacity`，尝试同一区域的其他 Availability Domain 或稍后重试；不要换收费 Shape、升级付费账号或创建多个免费账号来绕过库存。AMD Micro 可另行评估，不自动替换。

依据：[Always Free 资源和库存限制](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)。预算通知只会提醒，不是硬性停费开关。

## 4. 账号准备好后，由工程侧执行

1. 核对免费资格、用量、Ubuntu/ARM 架构、磁盘和 SSH 权限；配置更新和持久数据目录。
2. 固定 OGInstagram 上游提交 `a92f5372880b61da9c2ba72e539a64ae4ef0350c`，构建 ARM64 版本；保留许可证。
3. 将本机直连适配整理成正式服务配置。现有 `TestLabServe`、开发模式、固定实验签名 key 和占位首页不能直接作为公网生产服务。
4. 在服务器直连网络下复测公开多图帖；再核查本机失败样本。先少量顺序请求，不自动购买代理。
5. 验证清单完整性、图片实际解码、缓存命中、重启持久化、超时/限流处理。区分确认不可用帖子与暂时获取失败。
6. 通过后部署独立 HTTPS 后端，配置签名/访问控制、允许的前端来源、请求预算和日志；CORS 本身不是鉴权。域名和 HTTPS 入口另行确认，不为测试强制购买域名。
7. 最后接入现有 GitHub Pages 网站。保留旧媒体来源配置便于回退；不迁移整个网站。

未通过服务器网络测试前，不承诺本机成功率可以复制到云端。长期低使用率的免费实例可能被 Oracle 回收，需保留代码和必要数据备份。当前没有购买代理、开通收费资源或部署 Oracle。

## 5. 用户下一步

先完成注册，告知是否成功及选择的 Home Region 即可。不要发送密码、付款资料、验证码或私钥；随后再逐步创建实例和配置本地 SSH 访问。
