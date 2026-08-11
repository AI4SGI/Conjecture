# 双部署说明

项目使用两套互补的部署：

- GitHub Pages 发布纯静态前端：`https://AI4SGI.github.io/Conjecture/`
- Cloudflare Worker 提供跨域社区 API，负责点赞、留言、审核和持久化
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

Cloudflare API Token 至少需要 Workers Scripts 与 Durable Objects 的编辑权限。

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
任意 AI Secret 时，初审会 fail-closed：留言保留在 ai_pending，不能进入人工
批准和公开展示。Cloudflare 配置完成后，管理员可在审核台重试初审。

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
公开分类、填写内部备注并通过或拒绝；只有 approved 会出现在公开列表。通过
后当前审核页面会立即刷新公开留言，其他已经打开的浏览器页面刷新后可见。

Durable Object 为每条留言单独持久化提交日期、UTC 具体时间、匿名来源指纹、
私有联系邮箱、AI 审核记录与人工审核记录。联系邮箱不会发送给 AI 初审；公开
接口不会返回邮箱、指纹、AI 理由或审核人信息。
边缘 Worker 同时限制 CORS 来源、JSON 类型和 12 KB 请求体，存储层继续执行
浏览器与匿名指纹双重限流、小时/日限流、目标白名单、蜜罐、重复内容与危险
文本检查。AI 服务不可用时采用 fail-closed：留言停留在 ai_pending，只能由
管理员重试 AI 初审，不能跳过 AI 直接批准。
