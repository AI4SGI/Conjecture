# 双部署说明

项目使用两套互补的部署：

- GitHub Pages 发布纯静态前端：`https://AI4SGI.github.io/Conjecture/`
- Cloudflare Worker 提供跨域社区 API，负责点赞、留言、审核和持久化
- Cloudflare Pages 中继通过 Service Binding 连接同一个 Worker，作为
  `workers.dev` 在部分网络不可达时的第二入口；两者共享同一个 Durable Object，
  不会产生两份留言或访问量数据
- OpenNext/Cloudflare 的完整动态部署继续保留，可独立访问

## 1. GitHub Pages

仓库 `Settings → Pages → Build and deployment → Source` 选择
`GitHub Actions`。`.github/workflows/pages.yml` 会在 `main` 更新后构建
Next.js 静态导出，并自动处理 `/Conjecture` 项目子路径。

## 2. 社区 API

在 GitHub 仓库的 `Settings → Secrets and variables → Actions` 中添加：

- Secrets: `CLOUDFLARE_API_TOKEN`
- Secrets: `CLOUDFLARE_ACCOUNT_ID`
- Variable: `COMMUNITY_API_URL`

`COMMUNITY_API_URL` 填写 Worker 根地址，例如：

```text
https://jacobian-community-api.<your-subdomain>.workers.dev
```

Cloudflare API Token 至少需要 Workers Scripts、Durable Objects 与 Cloudflare
Pages 的编辑权限。`.github/workflows/community-worker.yml` 会自动维护
`ai4sgi-conjecture-community.pages.dev` 中继项目，并在每次部署后校验健康端点与
公开社区快照。若 Token 是在加入中继前创建的，需要在 Cloudflare Dashboard
重新签发或更新为同时包含 **Account / Cloudflare Pages / Edit** 的 Token，再更新
GitHub Secret `CLOUDFLARE_API_TOKEN`；这不会更改现有 Worker Secrets 或 Durable
Object 数据。

### 生产启用前还需在 Cloudflare 设置

以下五项是社区 Worker 的运行时 Secrets。它们和 GitHub Actions 中用于部署的
CLOUDFLARE_API_TOKEN、CLOUDFLARE_ACCOUNT_ID 不是同一类配置，也不会由本地
.env 自动同步到 Cloudflare。wrangler 配置文件只声明必需的 Secret 名称，不
包含任何值。

```bash
npx wrangler secret put COMMUNITY_ADMIN_KEY --config wrangler.community.jsonc
npx wrangler secret put COMMUNITY_AI_BASE_URL --config wrangler.community.jsonc
npx wrangler secret put COMMUNITY_AI_MODEL_NAME --config wrangler.community.jsonc
npx wrangler secret put COMMUNITY_AI_API_KEY --config wrangler.community.jsonc
npx wrangler secret put COMMUNITY_FINGERPRINT_SALT --config wrangler.community.jsonc
```

每条命令都会交互式提示输入值，不要把真实值直接写在命令行、wrangler
配置、源码或 GitHub 仓库中：

- COMMUNITY_ADMIN_KEY：人工审核台的管理员口令。使用独立的高强度随机值，
  并保存在密码管理器中。
- COMMUNITY_AI_BASE_URL：AI 服务的私有 OpenAI-compatible API 根地址，
  通常以 /v1 结尾。
- COMMUNITY_AI_MODEL_NAME：默认用于初审的可配置模型名。模型只判断安全性、
  相关性和留言分类，不判断数学结论是否正确。
- COMMUNITY_AI_API_KEY：上述 AI 服务的独立访问密钥；不会回退使用评测任务
  的其他 API 密钥。
- COMMUNITY_FINGERPRINT_SALT：至少 32 字节的独立随机值，仅用于对 IP 与
  User-Agent 做 HMAC 匿名指纹；系统不保存原始 IP。

设置后可运行以下命令确认 Secret 名称已经存在；该命令不会显示值：

```bash
npx wrangler secret list --config wrangler.community.jsonc
```

也可在 Cloudflare Dashboard 中进入 Workers & Pages，选择社区 Worker，依次
打开 Settings、Variables and Secrets、Add，类型选择 Secret，再逐项添加以上
名称和值并 Deploy。完整动态部署使用 wrangler.jsonc 时，Secrets 属于另一个
Worker，需要将上述命令的配置文件改为 wrangler.jsonc 后再设置一遍。

本地开发只在已被 .gitignore 排除的 .dev.vars 或 .env 中设置同名变量；两者
选择一个使用，不要同时维护，也不要创建包含真实值的可提交示例文件。缺少
任意 AI Secret 时，初审会显示明确的失败原因并将留言保留在 ai_pending。
Cloudflare 配置完成后，管理员可在审核台重试初审。Gemini 开头的模型统一使用
`max_tokens=65536`，其他模型使用 `max_tokens=128000`；OpenAI-compatible
base URL 可以填写 `/v1` 根路径，也可以直接填写完整 `/chat/completions` 路径。
初审任务进入 Durable Object Alarm 队列后台执行，不依赖提交页面持续连接；这也
避免了普通 `waitUntil()` 在响应结束后的短时限截断 thinking 模型。

Cloudflare Workers 生产环境不能把裸 IP 作为 `fetch()` 目标。因此评测脚本可用的
`http://35.220.164.252:3888/v1` **不能直接用作**
`COMMUNITY_AI_BASE_URL`：请求会在到达 API 中转平台之前失败，平台自然没有调用
记录。优先给中转服务配置 HTTPS 域名和 443 端口，例如
`https://review-api.example.org/v1`。如暂时只能保留 3888 端口，也必须使用能够
解析到该服务器的 DNS hostname；当前兼容日期默认启用的 custom-port 支持允许
Worker 访问未经过 Cloudflare 代理的自定义端口，但明文 HTTP 会暴露 API key，
不建议用于生产。

当前独立社区 Worker 为既有网关提供了精确的一对一 hostname override：
`35.220.164.252 → 252.164.220.35.bc.googleusercontent.com`。两者解析到同一服务器，
无密钥连通测试均到达同一 `/v1/models` 鉴权层；该映射只在配置值恰好为这个 IP
时生效，因此部署本版本即可恢复现有网关调用。审核台会显示实际 endpoint 和
`ai_review_ip_literal_replaced_with_configured_dns_hostname`。这只是兼容性恢复方案，
不替代 HTTPS。

更新运行时 Secret：

```bash
npx wrangler secret put COMMUNITY_AI_BASE_URL --config wrangler.community.jsonc
```

交互提示中输入带 DNS hostname 的新 URL。Secret 更新会立即产生 Worker 新版本，
无需把值提交 GitHub。随后打开 Human moderator console 并载入队列：AI runtime
diagnostics 应显示 `READY`，Endpoint 不应再是 IP。人工点击 **Retry AI review**
时，浏览器会保持请求连接并等待最终 AI 结果，不再只返回 “queued”；成功会显示
recommendation，失败会直接显示具体配置、网络、HTTP、空 content 或解析错误。

随后重新运行 Deploy GitHub Pages 工作流，让静态前端嵌入社区 API 地址。
Worker 的 CORS 白名单默认只接受 `https://ai4sgi.github.io` 与本地开发地址。

## 3. 审核接口

管理员请求使用：

```http
Authorization: Bearer <COMMUNITY_ADMIN_KEY>
```

社区 API 路径为 /api/community。提交后按以下状态流转：

    ai_pending → human_pending → approved / rejected

强模型只提供安全、相关性、风险标记、分类建议和语言处理，不能自动公开留言。
语言处理先将原文分类为英文、中文或其他语言：英文只生成中文译文，中文只
生成英文译文，其他语言生成中英双语译文；公开页面始终默认展示原始留言。
管理员在
页面 05 / COMMUNITY 底部展开 Human moderator console，输入
COMMUNITY_ADMIN_KEY 后，可在 Pending review 查看原始留言、私有联系邮箱和
AI 初审结果，在 Review history 查看已经通过或拒绝的完整人工审核记录。选择
公开分类、填写内部备注并通过或拒绝；只有 approved 会出现在公开列表。
Review history 中的 **Update human review** 可修改已完成结论：approved 改为
rejected 会立即从公开留言区撤回，rejected 改为 approved 会重新发布。每次更新
必须写至少 12 个字符的内部理由，旧结论保留在 `humanReviewHistory` 审计链中，
不会被覆盖。
AI 失败不会锁死人工作流：人工可以直接拒绝；如确认内容适合公开，也可以选择
分类并填写至少 12 个字符的内部理由，以带审计记录的 human override 通过。通过
后当前审核页面会立即刷新公开留言，其他已经打开的浏览器页面刷新后可见。

Durable Object 为每条留言单独持久化提交日期、UTC 具体时间、匿名来源指纹、
私有联系邮箱、AI 审核记录与人工审核记录。联系邮箱不会发送给 AI 初审；公开
接口不会返回邮箱、指纹、AI 理由或审核人信息。
边缘 Worker 同时限制 CORS 来源、JSON 类型和 12 KB 请求体，存储层继续执行
浏览器与匿名指纹双重限流、小时/日限流、目标白名单、蜜罐、重复内容与危险
文本检查。AI 服务不可用时不会自动公开内容，任何公开决定仍必须由人工明确
作出。

### 存储、容量与备份

留言统一保存在名为 `CommunityStore` 的 SQLite-backed Cloudflare Durable
Object 中；公开网页和 GitHub 仓库都不保存私有邮箱或审核记录。Cloudflare
目前规定单个 SQLite-backed Durable Object 最大 10 GB，单个 key/value 最大
2 MB；行数本身没有固定上限，账户总容量仍受套餐额度约束。官方说明见
[Durable Objects limits](https://developers.cloudflare.com/durable-objects/platform/limits/)。

应用层最多接受 10,000 条留言，达到阈值后返回
`message_capacity_reached`，不会像旧实现那样删除最早留言。管理员载入审核队列
后可以点击 **Export private backup**，接口会以每页最多 250 条读取，然后在
浏览器下载包含原始留言、私有邮箱、AI 结果和人工审计记录的 JSON；该文件包含
敏感数据，必须放入受控的加密存储，不得提交 GitHub。

Durable Object 存储是事务性、强一致的，SQLite-backed Durable Objects 还提供
整库最近 30 天的 point-in-time recovery。恢复操作和 bookmarks 说明见
[SQLite storage API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)。
建议至少每周导出一次异地加密备份，并在 Cloudflare Dashboard 监控 Durable
Objects 的总存储量。PITR 负责 30 天内的平台恢复，定期导出负责更长期且跨平台
的兜底。

### 后续新增猜想

社区表单第一项固定为 **New Conjecture or Problem**，对应 `new/general`，可在
猜想正式进入数据集前先讨论。正式新增猜想时，页面选择器、留言表单和公开筛选
均从 `src/data/site.json` 的 conjecture 数组自动生成；一般讨论会自动兼容
新的安全 ID。若新猜想需要 `P1` 等任务级留言，再把允许的 task key 加到
`COMMUNITY_ALLOWED_TARGETS`（`wrangler.community.jsonc` 和
`wrangler.jsonc`）并重新部署 Worker。这样只增加一般讨论时无需修改留言组件，
增加任务时也只需维护数据和一处服务端白名单配置。

每个猜想的 `conjectures/<id>.json` 还必须维护 `references` 数组。06 /
REFERENCES 会自动读取其中的中英文标题、说明、作者、年份、类型和跳转链接；
新增猜想不需要修改参考资料组件。题目 following 使用 `<conjecture-id>:<task-key>`
作为存储键，因此不同猜想可以安全地重复使用 `P1`。

07 / GLOBAL REACH 在浏览器读取社区快照时原子记录访问，只在 Durable Object 保存
随机浏览器标识的不可逆哈希、最近计数日期和国家级汇总，不保存原始 IP。同一浏览器
每天计数一次；公开接口只返回总数和国家聚合。国家代码 `TW` 在写入、历史快照和
地图展示三层统一归并到 `CN`。地图使用 Natural Earth 1:110m 数据与 Natural Earth
投影，通过 `world-atlas`、`topojson-client` 和 `d3-geo` 在本地渲染。

页首 GitHub Star 在 Pages 构建时使用工作流内置的 `github.token` 读取并嵌入，
运行时再由社区 Worker 每 15 分钟刷新。Worker 优先调用 GitHub REST API，遇到
公共 API 限流时使用 Shields.io 的 GitHub 缓存 JSON；两者都失败时保留构建时
数值，不会把访客浏览器直接连接到第三方统计服务。
