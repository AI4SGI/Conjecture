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
首次部署后，还应在本地或 Cloudflare 控制台设置审核密钥：

```bash
npx wrangler secret put COMMUNITY_ADMIN_KEY --config wrangler.community.jsonc
```

随后重新运行 `Deploy GitHub Pages` 工作流，让静态前端嵌入社区 API 地址。
Worker 的 CORS 白名单默认只接受 `https://ai4sgi.github.io` 与本地开发地址。

## 3. 审核接口

管理员请求使用：

```http
Authorization: Bearer <COMMUNITY_ADMIN_KEY>
```

社区 API 路径为 `/api/community`。未审核留言不会出现在公开列表中；
审核、拒绝、点赞去重与提交限流都在 Durable Object 中完成。
