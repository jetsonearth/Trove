<p align="center">
  <h1 align="center">Trove</h1>
  <p align="center"><b>你的 AI 对话是宝藏，别让它们消失。</b></p>
  <p align="center">
    <a href="README.md">English</a> | <a href="README_CN.md">中文</a>
  </p>
</p>

## 为什么做 Trove?

每天，你都在和 AI 进行大量对话 - 头脑风暴产品想法、debug 棘手的代码、研究陌生的领域、做各种决策。每一段对话都是你思维的快照：你问了什么问题、你怎么推理的、你得出了什么结论。

但这些对话正在消失。它们被埋在 Claude 的侧边栏或 ChatGPT 的历史记录里，无法搜索，彼此断裂，对你真正在用的工具完全不可见。你没法 grep 它们，没法把它们关联到你的笔记，更没法把它们喂给需要理解你思路的 agent。

**你和 AI 的对话不只是聊天记录 - 它们是你思维的延伸。** 它们捕捉了灵感闪现的瞬间、推理的链条、和 idea generation 的过程 - 这些你的大脑本身留不住的东西。它们是 context - 那种决定了 AI 助手是每次从零开始、还是真正理解你工作的 context。

这就是为什么叫 Trove（宝藏）。这些对话值得被珍藏。Trove 自动把你每天的 Claude 和 ChatGPT 对话同步到 Obsidian vault，变成干净的、可搜索的 markdown 文件。不用手动导出，不用复制粘贴，不用折腾配置 - 它直接从 Chrome 读取 cookie，开箱即用。

一旦你的对话进入 Obsidian，它们就成了你知识图谱的一部分。把它们链接到项目、跨越几个月的思考做搜索、喂给 agent 来维持思维的连续性。建立一个真正记得你和 AI 一起想明白了什么的第二大脑。

## 工作原理

1. 读取 Chrome 的 session cookie（自动检测正确的 Chrome profile）
2. 调用 Claude 和 ChatGPT 的内部 API 拉取当天的对话
3. 转换为 Obsidian 兼容的 markdown 格式，带 frontmatter 元数据
4. 保存到你的 vault，每段对话一个文件
5. 可选地链接到你的 daily note

## 安装

```bash
git clone https://github.com/jetsonearth/Trove.git
cd Trove
./setup.sh
```

搞定。setup 脚本会：
- 安装 Python 依赖（`curl_cffi`、`pycookiecheat`）
- 询问你的 Obsidian vault 路径和 Claude org ID
- 注册每日定时任务（通过 macOS LaunchAgent，每天 23:50 自动运行）

**前提条件**：Python 3.10+，Chrome 浏览器已登录 claude.ai / chatgpt.com。

## 使用方法

```bash
python3 fetch_ai_chats.py                       # 拉取今天所有 provider 的对话
python3 fetch_ai_chats.py --provider claude      # 只拉 Claude
python3 fetch_ai_chats.py --provider chatgpt     # 只拉 ChatGPT
python3 fetch_ai_chats.py --date 2026-04-03      # 拉取指定日期
python3 fetch_ai_chats.py --dry-run              # 预览，不实际写入
python3 fetch_ai_chats.py --force                # 重新拉取已导出的对话
```

## 输出格式

每段对话变成 vault 中的一个 markdown 文件：

```
~/my-vault/Claude/4-4-26 需求聚合策略分析.md
~/my-vault/GPT/4-4-26 Red Hat Partner Certifications.md
```

带 Obsidian 可索引和查询的 frontmatter：

```yaml
---
title: "Demand aggregation strategy insights"
source: "https://claude.ai/chat/694ee83f-..."
author:
  - "[[Claude]]"
created: 2026-04-04
description: "Claude conversation with 18 messages"
tags:
  - "Claude"
---
```

## 查找 Claude Org ID

1. 在 Chrome 打开 claude.ai
2. 打开 DevTools（Cmd+Option+I）-> Network 标签
3. 刷新页面
4. 找到任意一个请求 `/api/organizations/{UUID}/` 的请求 - 那个 UUID 就是你的 org ID

## 认证原理

Trove 使用两个库绕过 Cloudflare 防护，不需要任何手动配置：

- **pycookiecheat**：从 macOS Keychain 解密 Chrome cookie，自动检测正确的 Chrome profile
- **curl_cffi**：使用 Chrome 的 TLS 指纹发送 HTTP 请求，让 Cloudflare 认为是真实浏览器

这意味着：只要你在 Chrome 里登录了 claude.ai / chatgpt.com，Trove 就直接能用。

## 配置

`trove.json`（由 setup.sh 创建，已 gitignore）：

```json
{
  "vault": "/path/to/your/obsidian-vault",
  "claude_org_id": "your-org-id",
  "claude_output_dir": "Claude",
  "chatgpt_output_dir": "GPT"
}
```

## 支持的 Provider

| Provider | 状态 | 认证方式 |
|----------|------|----------|
| Claude   | 可用 | Chrome cookie (sessionKey) |
| ChatGPT  | 可用 | Chrome cookie -> Bearer token |
| DeepSeek | 计划中 | TBD |
| Kimi     | 计划中 | TBD |

## License

MIT
