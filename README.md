# EdgeEver

> **EdgeEver: A self-hosted, Cloudflare-native Evernote alternative.**
>
> **EdgeEver：基于 Cloudflare 全家桶自托管的开源『印象笔记』。**

EdgeEver 是一个开源、自托管、Cloudflare-native 的现代笔记工作区。它保留经典印象笔记的三栏体验，同时提供清晰的数据模型、REST API、MCP endpoint 和本地 CLI。

<p align="center">
  <a href="https://deploy.workers.cloudflare.com/?url=https://github.com/msh01/edgeever">
    <img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare" />
  </a>
</p>

## 在线演示

- Demo 地址：[https://demo.edgeever.org](https://demo.edgeever.org)
- 演示账号：`ee-demo`
- 演示密码：`demo#dZ6Q29Zjfor%`

公开演示环境可能会被重置，请不要保存私密内容。

## 功能

- 三栏布局：笔记本树、笔记列表、主编辑区。
- 无限级嵌套笔记本。
- TipTap 富文本编辑，服务端保存结构化 JSON、Markdown 和纯文本。
- 图片粘贴上传到 R2，D1 保存资源元数据。
- 图片自动压缩，GIF 会尝试转 animated WebP。
- 附件入口，可查看资源列表和总存储占用。
- 多选合并笔记，原笔记软删除，资源关联迁移到新笔记。
- 多选移动笔记，笔记本支持拖拽排序和调整层级。
- PWA 可安装，支持静态应用壳离线打开和自动更新。
- 单用户登录，密码使用 PBKDF2-SHA256 hash。
- REST API-first，支持 API Token、MCP 和 CLI。

## 技术栈

- 前端：Vite、React、Tailwind CSS、TipTap、TanStack Query、Dexie。
- 后端：Cloudflare Workers、Hono。
- 存储：Cloudflare D1、Cloudflare R2。
- 工具链：Bun、Wrangler、TypeScript。

## 快速开始

安装依赖：

```sh
bun install
```

应用本地 D1 迁移：

```sh
bun run db:migrate:local
```

启动本地开发：

```sh
bun run dev
```

常用检查：

```sh
bun run typecheck
bun run build
```

## 部署

最简单的方式是点击上方 **Deploy to Cloudflare** 按钮，根据 Cloudflare 向导完成授权和部署。

如果使用 CLI 部署：

```sh
cp .env.local.example .env.local
bunx wrangler d1 create edgeever
bunx wrangler r2 bucket create edgeever-resources
bun run auth:hash -- <你的密码>
bun run deploy
```

把 D1 创建命令返回的 `database_id` 和密码 hash 填入本机 `.env.local`。

## 目录结构

```text
apps/web       Vite + React 前端
apps/api       Cloudflare Worker + Hono API
packages/shared 共享类型、schema 和内容转换
migrations     D1 数据库迁移
wrangler.toml  Cloudflare Workers 配置
```

## 内容格式

EdgeEver 同时保存三种内容形态：

```text
content_json      TipTap/ProseMirror 文档，编辑器权威格式
content_markdown  API、Agent、导入导出使用
content_text      搜索、摘要和索引使用
```

## MCP / CLI

先在 EdgeEver 左侧 **设置** 里创建 API Token。给只读 Agent 使用时建议只勾选 `read:notebooks`、`read:memos`、`read:tags`；需要写入、移动、合并或上传附件时再增加对应 `write:*` scope。

### CLI

CLI 使用 API Token 访问同一套 REST API。可以直接用环境变量：

```sh
EDGEEVER_URL=https://你的域名 \
EDGEEVER_TOKEN=<api-token> \
bun run cli -- search edgeever
```

也可以保存为本机 profile，配置文件默认写入 `~/.edgeever/config.json`：

```sh
bun run cli -- profile set prod --url https://你的域名 --token <api-token>
bun run cli -- --profile prod notebooks
bun run cli -- --profile prod tags
bun run cli -- --profile prod search edgeever
bun run cli -- --profile prod get <memo-id>
bun run cli -- --profile prod create --notebook <notebook-id> --title Hello --body "来自 CLI"
bun run cli -- --profile prod update <memo-id> --tags edgeever,cli
bun run cli -- --profile prod move --notebook <notebook-id> <memo-id...>
bun run cli -- --profile prod merge --notebook <notebook-id> --title "合并笔记" <memo-id...>
bun run cli -- --profile prod upload --memo <memo-id> --file ./image.png --type image/png
bun run cli -- --profile prod export <memo-id> --format markdown --out ./memo.md
```

### MCP

MCP endpoint：

```text
https://你的域名/mcp
Authorization: Bearer <api-token>
```

当前 MCP 使用 Streamable HTTP / JSON-RPC 入口，支持 `initialize`、`tools/list`、`tools/call` 和 batch request。已暴露的 tools：

```text
search_memos
get_memo
create_memo
update_memo
move_memos
merge_memos
move_notebook
list_notebooks
list_tags
```

最小调用示例：

```sh
curl https://你的域名/mcp \
  -H "Authorization: Bearer <api-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "search_memos",
      "arguments": {
        "query": "edgeever",
        "limit": 10
      }
    }
  }'
```
