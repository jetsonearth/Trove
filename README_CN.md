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

## 快速开始

> **环境要求：** macOS、Python 3.10+、Google Chrome 已登录 [claude.ai](https://claude.ai) 和/或 [chatgpt.com](https://chatgpt.com)，以及一个 [Obsidian](https://obsidian.md) vault。

### 第一步：安装

```bash
git clone https://github.com/jetsonearth/Trove.git
cd Trove
./setup.sh
```

安装脚本会问你两个问题：

| 提示 | 填什么 |
|------|--------|
| **Obsidian vault path** | 你的 vault 文件夹完整路径，比如 `~/my-vault` |
| **Claude org ID** | 按回车跳过（Trove 运行时会尝试自动检测），或者你有的话直接粘贴。如果自动检测失败，看下面的[如何获取 Claude Org ID](#如何获取-claude-org-id)。 |

然后它会安装依赖，并设置每日定时任务（每晚 23:50 自动运行）。

### 第二步：测试一下

```bash
python3 fetch_ai_chats.py --dry-run
```

这会预览要拉取的内容，不会实际写入文件。你应该能看到今天的对话列表。如果报错，看下面的[常见问题](#常见问题)。

### 第三步：正式运行

```bash
python3 fetch_ai_chats.py
```

搞定。打开你的 Obsidian vault 看看 - 对话已经在那里了。

从现在起，Trove 每晚自动运行。你也可以随时手动执行。

## 使用方法

```bash
python3 fetch_ai_chats.py                       # 拉取今天所有 provider 的对话
python3 fetch_ai_chats.py --provider claude      # 只拉 Claude
python3 fetch_ai_chats.py --provider chatgpt     # 只拉 ChatGPT
python3 fetch_ai_chats.py --date 2026-04-03      # 拉取指定日期
python3 fetch_ai_chats.py --dry-run              # 预览，不实际写入
python3 fetch_ai_chats.py --force                # 重新拉取已导出的对话
```

## 输出效果

每段对话变成 vault 中的一个 markdown 文件：

```
~/my-vault/Claude/4-4-26 Demand aggregation strategy insights.md
~/my-vault/GPT/4-4-26 Red Hat Partner Certifications.md
```

每个文件都带 Obsidian 兼容的 frontmatter，方便搜索、打标签、建链接：

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

## 工作原理

1. 读取 Chrome 的 session cookie（自动检测正确的 Chrome profile）
2. 调用 Claude / ChatGPT 的 API 拉取当天的对话
3. 转换为干净的 markdown 格式，带 frontmatter 元数据
4. 保存到你的 vault，每段对话一个文件

**认证方式：** Trove 用 [pycookiecheat](https://github.com/n8henrie/pycookiecheat) 从 macOS Keychain 解密 Chrome cookie，用 [curl_cffi](https://github.com/lexiforest/curl_cffi) 模拟 Chrome 的 TLS 指纹发请求。不需要 API key - 只要你在 Chrome 里登录了，就直接能用。

## 配置

`trove.json`（由 setup.sh 创建，已 gitignore）：

```json
{
  "vault": "/path/to/your/obsidian-vault",
  "claude_org_id": "",
  "claude_output_dir": "Claude",
  "chatgpt_output_dir": "GPT"
}
```

| 字段 | 说明 | 必填？ |
|------|------|--------|
| `vault` | Obsidian vault 的绝对路径 | 是 |
| `claude_org_id` | Claude 组织 UUID。留空则自动检测 | 否 |
| `claude_output_dir` | vault 中存放 Claude 对话的子文件夹 | 否（默认 `Claude`）|
| `chatgpt_output_dir` | vault 中存放 ChatGPT 对话的子文件夹 | 否（默认 `GPT`）|

## 如何获取 Claude Org ID

Trove 会尝试自动检测，但如果失败，你可以手动获取：

1. 在 Chrome 打开 [claude.ai](https://claude.ai)
2. 打开 DevTools：**Cmd + Option + I**
3. 切到 **Network** 标签
4. 刷新页面
5. 点击列表中任意一个请求，看请求 URL - 你会看到类似 `/api/organizations/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx/...` 的路径
6. 复制那个 UUID，粘贴到 `trove.json` 的 `claude_org_id` 字段

## 常见问题

| 问题 | 解决方法 |
|------|----------|
| `Could not find 'sessionKey' cookie` | 你没在 Chrome 登录 claude.ai。登录后重试。 |
| `Could not find '__Secure-next-auth.session-token' cookie` | 你没在 Chrome 登录 chatgpt.com。登录后重试。 |
| `Could not determine org ID` | 在 `trove.json` 里手动填 `claude_org_id`。获取方法：打开 claude.ai -> DevTools（Cmd+Option+I）-> Network 标签 -> 刷新页面 -> 找到任意一个 `/api/organizations/{UUID}/` 的请求，那个 UUID 就是。 |
| `No new conversations to export` | 今天没有新对话。试试 `--date YYYY-MM-DD` 拉取其他日期。 |
| `pip3 install` 失败 | 试试 `pip3 install --user curl_cffi pycookiecheat`，或者用 virtualenv。 |

## 支持的 Provider

| Provider | 状态 | 认证方式 |
|----------|------|----------|
| Claude   | 可用 | Chrome cookie (sessionKey) |
| ChatGPT  | 可用 | Chrome cookie -> Bearer token |
| DeepSeek | 计划中 | TBD |
| Kimi     | 计划中 | TBD |

## License

MIT
