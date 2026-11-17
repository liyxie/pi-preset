# 快速上手指南

## 安装

```bash
# 在 pi-st-preset 目录
cd pi-st-preset
pi install .
```

## 基本使用

### 1. 激活示例预设

```bash
pi
/preset coder-cn
# 或启动时激活：
pi --st-preset coder-cn
```

### 2. 查看当前激活的预设

```bash
/preset list
```

输出：
```
Available presets:
  [~] coder-cn (active) - 中文编码助手 (4 blocks)
```

### 3. 预览将发送给模型的消息列表

```bash
/preset preview
```

这会显示下次请求前装配的完整消息列表。

### 4. 关闭预设

```bash
/preset off
```

## 创建自己的预设

创建 `~/.pi/agent/st-presets/my-preset.json`：

```json
{
  "version": 1,
  "name": "我的自定义预设",
  "blocks": [
    {
      "kind": "marker",
      "id": "pi-prompt",
      "enabled": true,
      "marker": "piPrompt"
    },
    {
      "kind": "text",
      "id": "custom-style",
      "enabled": true,
      "role": "system",
      "position": { "type": "relative" },
      "content": "你是一个有帮助的助手。今天是 {{date}}。"
    },
    {
      "kind": "marker",
      "id": "chat-history",
      "enabled": true,
      "marker": "chatHistory"
    }
  ],
  "squash": { "enabled": true }
}
```

然后：
```bash
/preset reload
/preset my-preset
```

## 导入 SillyTavern 预设

如果你有现成的 SillyTavern 预设 JSON：

```bash
/preset import /path/to/st-preset.json 我的导入预设
/preset reload
/preset 我的导入预设
```

## 宏示例

内容模板中可用的宏：

- `{{user}}` - 用户名
- `{{char}}` - 角色名（来自 variables）
- `{{model}}` - 当前模型 ID
- `{{cwd}}` - 当前工作目录
- `{{date}}` - 当前日期
- `{{time}}` - 当前时间
- `{{lastUserMessage}}` - 最后一条用户消息文本
- `{{lastAssistantMessage}}` - 最后一条助手消息文本
- `{{setvar::变量名::值}}` - 设置变量（不输出内容）
- `{{getvar::变量名}}` - 获取变量值
- `{{random::选项1::选项2::选项3}}` - 随机选择
- `{{// 注释}}` - 注释（不输出内容）
- `{{trim}}` - 删除此标记两侧的空白

## 块类型

### 文本块
固定内容，支持宏：

```json
{
  "kind": "text",
  "id": "reminder",
  "enabled": true,
  "role": "system",
  "position": { "type": "depth", "depth": 0 },
  "content": "请简洁回答。"
}
```

### 标记块

**chatHistory** - 对话历史位置：
```json
{
  "kind": "marker",
  "id": "history",
  "enabled": true,
  "marker": "chatHistory"
}
```

**piPrompt** - Pi 的完整系统提示词：
```json
{
  "kind": "marker",
  "id": "pi",
  "enabled": true,
  "marker": "piPrompt"
}
```

**section** - Pi 提示词的特定段落：
```json
{
  "kind": "marker",
  "id": "skills",
  "enabled": true,
  "marker": "section",
  "section": "skills"
}
```

可用段落：`preamble`、`tools`、`rules`、`docs`、`addendum`、`project_context`、`skills`、`cwd`

## 位置类型

**relative** - 系统区（历史之前）：
```json
"position": { "type": "relative" }
```

**depth** - 注入到历史中：
```json
"position": { 
  "type": "depth", 
  "depth": 0,      // 0 = 末尾，1 = 倒数第二条消息之前，以此类推
  "order": 100     // 同深度内的排序（可选）
}
```

## 触发器

仅在特定回合类型注入块：

```json
"triggers": ["user-turn"]      // 仅用户刚发言后
"triggers": ["tool-turn"]       // 仅工具执行后
"triggers": ["user-turn", "tool-turn"]  // 两者都触发
// 省略 triggers = 总是注入
```

## 采样参数

按预设覆盖模型采样参数：

```json
"sampling": {
  "temperature": 0.7,
  "top_p": 0.9,
  "top_k": 40
}
```

支持：OpenAI、Anthropic、Google API。

## 使用技巧

1. 开发预设时频繁使用 `/preset preview`
2. 保留 `piPrompt` 标记以保持 pi 的编码能力
3. 谨慎使用深度块 - 它们会破坏前缀缓存
4. 生产环境避免 `{{random}}` 和 `{{time}}` 宏（破坏缓存）
5. 用 `/tree` 导航测试预设状态是否正确跟随分支

## 故障排查

**预设加载失败？**
```bash
/preset list
# 检查是否有 ERROR 消息
```

**预览与实际请求不匹配？**
- 对比 `.pi/provider-payload.log`（需加载 provider-payload.ts 扩展）

**状态未跟随分支？**
- 这是已知限制，如果 session_tree 事件未触发 - 重新加载扩展

**与其他预设扩展冲突？**
- session_start 时会显示警告 - 卸载 pi 的示例预设扩展
