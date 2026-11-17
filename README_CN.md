# pi-st-preset 完整使用文档

## 目录

- [快速开始](#快速开始)
- [核心概念](#核心概念)
- [预设文件格式](#预设文件格式)
- [命令参考](#命令参考)
- [高级用法](#高级用法)
- [故障排查](#故障排查)
- [技术细节](#技术细节)

## 快速开始

### 安装扩展

```bash
# 方式 1：本地安装
cd pi-st-preset
pi install .

# 方式 2：开发模式
pi -e ./pi-st-preset/src/index.ts

# 方式 3：启动时激活预设
pi --st-preset coder-cn
```

### 第一次使用

```bash
# 启动 pi
pi

# 列出可用预设
/preset list

# 激活内置的中文编码助手预设
/preset coder-cn

# 发送一条消息测试
你好

# 预览装配后的消息列表
/preset preview

# 关闭预设
/preset off
```

## 核心概念

### 什么是预设？

预设是一个 JSON 文件，定义了如何在每次请求前重新排列发送给模型的消息列表。类似 SillyTavern 的预设机制。

### 请求级视图

- 每次请求前，预设会**重新装配**消息列表
- 原始的 transcript 和会话文件**永不修改**
- 切换或关闭预设立即生效，可完全回退

### 装配流程

1. 从 transcript 提取当前系统消息和对话历史
2. 根据触发器（user-turn/tool-turn）过滤启用的块
3. 展开所有宏（{{user}}、{{date}} 等）
4. 分组：系统区块、深度注入块、历史后块
5. 在历史中按深度注入块（保持工具调用配对）
6. 构建系统消息头（合并 system 块，带工具声明）
7. 处理中途 system 消息（转为 user 或保持）
8. 返回最终消息列表发送给模型

## 预设文件格式

### 文件位置

- **全局**：`~/.pi/agent/st-presets/<名称>.json`
- **项目**：`<cwd>/.pi/st-presets/<名称>.json`（需项目被信任）

### 基本结构

```json
{
  "version": 1,
  "name": "显示名称",
  "description": "预设描述",
  "blocks": [],
  "variables": {
    "user": "自定义用户名",
    "char": "角色名"
  },
  "sampling": {
    "temperature": 0.7
  },
  "squash": { 
    "enabled": true,
    "separator": "\\n\\n"
  },
  "midSystemFallback": "user",
  "keepTools": true
}
```

### 块类型

#### 1. 文本块

固定内容，支持宏替换：

```json
{
  "kind": "text",
  "id": "唯一标识",
  "name": "显示名称",
  "enabled": true,
  "role": "system",
  "content": "内容模板，支持 {{宏}}",
  "position": { "type": "relative" },
  "triggers": ["user-turn"]
}
```

**位置类型**：

- `relative`：系统区，按 blocks 数组顺序排在历史之前
- `depth`：深度区，插入历史中指定深度

```json
"position": { "type": "relative" }

"position": { 
  "type": "depth", 
  "depth": 0,
  "order": 100
}
```

**触发器**：

```json
"triggers": ["user-turn"]
"triggers": ["tool-turn"]
"triggers": ["user-turn", "tool-turn"]
```

#### 2. 标记块

内容在装配时从 pi 当前状态获取：

**chatHistory** - 对话历史本体：
```json
{
  "kind": "marker",
  "id": "chat-history",
  "enabled": true,
  "marker": "chatHistory"
}
```

**piPrompt** - Pi 原生完整提示词：
```json
{
  "kind": "marker",
  "id": "pi-prompt",
  "enabled": true,
  "marker": "piPrompt",
  "role": "system"
}
```

**section** - Pi 提示词的特定段落：
```json
{
  "kind": "marker",
  "id": "skills-section",
  "enabled": true,
  "marker": "section",
  "section": "skills",
  "role": "system"
}
```

可用段落：`preamble`、`tools`、`rules`、`docs`、`addendum`、`project_context`、`skills`、`cwd`

### 宏系统

在文本块的 `content` 中可用：

| 宏 | 说明 |
|---|---|
| `{{user}}` | 用户名 |
| `{{char}}` | 角色名 |
| `{{model}}` | 模型 ID |
| `{{cwd}}` | 工作目录 |
| `{{date}}` | 当前日期 |
| `{{time}}` | 当前时间 |
| `{{lastUserMessage}}` | 最后用户消息 |
| `{{lastAssistantMessage}}` | 最后助手消息 |
| `{{setvar::名称::值}}` | 设置变量 |
| `{{getvar::名称}}` | 获取变量 |
| `{{random::a::b::c}}` | 随机选择 |
| `{{// 注释}}` | 注释 |
| `{{trim}}` | 删除两侧空白 |

### 采样参数

```json
"sampling": {
  "temperature": 0.7,
  "top_p": 0.9,
  "top_k": 40,
  "frequency_penalty": 0,
  "presence_penalty": 0
}
```

支持的 API：OpenAI、Anthropic、Google

### 其他选项

```json
{
  "squash": {
    "enabled": true,
    "separator": "\\n\\n"
  },
  "midSystemFallback": "user",
  "keepTools": true
}
```

## 命令参考

### /preset

交互式选择器

### /preset <名称>

激活指定预设

### /preset off

关闭当前预设

### /preset list

列出所有可用预设

### /preset reload

重新加载预设文件

### /preset preview

预览装配结果

### /preset import <路径> [名称]

导入 SillyTavern 预设

## 高级用法

### 示例 1：保留 pi 能力的角色扮演预设

```json
{
  "version": 1,
  "name": "技术顾问",
  "blocks": [
    {
      "kind": "marker",
      "id": "pi",
      "enabled": true,
      "marker": "piPrompt"
    },
    {
      "kind": "text",
      "id": "role",
      "enabled": true,
      "role": "system",
      "content": "你是一位资深技术顾问。",
      "position": { "type": "relative" }
    },
    {
      "kind": "marker",
      "id": "history",
      "enabled": true,
      "marker": "chatHistory"
    }
  ]
}
```

### 示例 2：只保留部分能力

```json
{
  "version": 1,
  "name": "纯对话模式",
  "blocks": [
    {
      "kind": "marker",
      "id": "skills",
      "enabled": true,
      "marker": "section",
      "section": "skills"
    },
    {
      "kind": "text",
      "id": "style",
      "enabled": true,
      "role": "system",
      "content": "友好对话，不编写代码。",
      "position": { "type": "relative" }
    },
    {
      "kind": "marker",
      "id": "history",
      "enabled": true,
      "marker": "chatHistory"
    }
  ],
  "keepTools": false
}
```

## 故障排查

### 预设加载失败

检查 JSON 语法，运行 `/preset reload`

### 预览与实际不匹配

对比 `.pi/provider-payload.log`

### 状态未跟随分支

重新加载扩展或重启 pi

### 与其他扩展冲突

不要同时加载 pi 的示例预设扩展

## 技术细节

### 架构原理

使用 pi 的 `context_with_system` 钩子，在每次请求前重建消息列表。

### 工具调用配对保护

深度注入时自动避免拆散 toolCall 和 toolResult。

### 会话树回退

预设状态跟随 `/tree` 导航自动回退。

## 参考资料

- [pi/docs/10-预设扩展实现方案.md](../pi/docs/10-预设扩展实现方案.md) - 完整设计文档
- [IMPLEMENTATION.md](IMPLEMENTATION.md) - 实现总结
