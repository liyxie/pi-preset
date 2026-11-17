# pi-st-preset

SillyTavern 式预设扩展，用于 pi。

## 功能说明

在每次请求前，按照预设文件重新排列发送给模型的消息列表。类似 SillyTavern 的预设机制，你可以：

- 在对话历史的前、后或特定深度位置注入自定义 system/user/assistant 消息
- 使用宏（`{{user}}`、`{{model}}`、`{{date}}` 等）
- 控制采样参数（temperature、top_p 等）
- 导入现有的 SillyTavern 预设

## 安装

```bash
pi install ./pi-st-preset
```

或开发模式：

```bash
pi -e ./pi-st-preset/src/index.ts
```

## 使用方法

```bash
# 列出可用预设
/preset list

# 激活预设
/preset <名称>

# 预览将发送给模型的内容
/preset preview

# 关闭预设
/preset off

# 导入 SillyTavern 预设
/preset import <ST预设JSON路径> [新名称]

# 重新加载预设文件
/preset reload
```

## 预设文件

预设以 JSON 格式存储：

- 全局：`~/.pi/agent/st-presets/<名称>.json`
- 项目：`<cwd>/.pi/st-presets/<名称>.json`

参见 [presets/coder-cn.json](presets/coder-cn.json) 示例。

## 架构特点

- **请求级视图**：每次请求重建消息列表；transcript 和会话文件永不修改
- **纯扩展实现**：使用 pi 的 `context_with_system` 钩子；无需修改 pi 源码
- **原生 schema**：预设文件使用 pi 的原生格式；ST 预设可通过 `/preset import` 导入

## 文档

完整实现规范请参阅：
- [pi/docs/10-预设扩展实现方案.md](../pi/docs/10-预设扩展实现方案.md) - 详细设计文档
- [IMPLEMENTATION.md](IMPLEMENTATION.md) - 实现总结
- [QUICK_START.md](QUICK_START.md) - 快速上手指南
