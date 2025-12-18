# 🍎 SKAdNetwork 4.0 完全指南

> 深入理解苹果隐私归因框架，掌握 iOS 广告投放与优化策略

---

## 🆕 重要更新提醒

> **2024年6月 WWDC24 更新**：苹果发布了 **AdAttributionKit**，这是 SKAdNetwork 的继任者，将在 iOS 17.4+ 上逐步取代 SKAN。
> 
> AdAttributionKit 主要变化：
> - 支持**替代应用市场**（欧盟 DMA 要求）
> - 更灵活的**重参与归因**
> - 与 SKAN 4.0 的 API 高度兼容
> 
> **当前建议**：继续使用 SKAN 4.0，同时关注 AdAttributionKit 的发展。两者 API 兼容，迁移成本较低。

---

## ⚠️ 重要注意事项（必读）

### 🔴 SKAN 4.0 带来的重大变化

**如果你只看一段，请看这里：**

| 变化 | 影响 | 应对措施 |
|------|------|---------|
| **数据延迟 24-144 小时** | 无法实时优化广告 | 接受更长学习周期，使用预测模型 |
| **无用户级数据** | 无法精准分析单个用户 | 依赖聚合数据和第一方数据 |
| **隐私阈值限制** | 小量级 Campaign 数据缺失严重 | **集中预算**，避免过度分散 |
| **只有 0-63 的转化值** | 无法传递完整转化信息 | 精心设计 Conversion Value 编码方案 |
| **归因窗口最长 35 天** | 长期 LTV 无法追踪 | 建立预测模型估算长期价值 |

### 🚨 最关键的三件事

**1. 集中预算是王道**
- 分散的小 Campaign 几乎拿不到有效数据
- 苹果有"隐私阈值"，安装量不够就不给完整数据
- **建议**：宁可少开几个 Campaign，也要保证每个都有足够量级

**2. Conversion Value 设计决定数据质量**
- 你只有 64 个值 (0-63) 来编码所有用户行为
- 设计不好 = 数据没用
- **建议**：提前规划，与 MMP 配合，定期优化

**3. 三次回传机会要用好**
- 第1次 (0-2天)：唯一能拿 Fine Value 的机会
- 第2次 (3-7天)：验证短期留存
- 第3次 (8-35天)：评估中期价值
- **建议**：为每个窗口设计对应的指标

### ⏰ 时间线提醒

| 回传 | 用户行为窗口 | 数据延迟 | 你能拿到的数据 |
|------|-------------|---------|---------------|
| 第1次 | 安装后 0-2 天 | +24-48小时 | Fine Value (0-63) 或 Coarse |
| 第2次 | 安装后 3-7 天 | +24-144小时 | 仅 Coarse (low/medium/high) |
| 第3次 | 安装后 8-35 天 | +24-144小时 | 仅 Coarse (low/medium/high) |

**换算一下**：一个用户今天安装，你最快也要 **明天** 才能看到第一次数据，完整数据要等 **5周以上**。

---

## 目录

1. [什么是 SKAdNetwork](#什么是-skadnetwork)
2. [SKAN 发展历程](#skan-发展历程)
3. [SKAN 4.0 核心变化](#skan-40-核心变化)
4. [对广告行业的影响](#对广告行业的影响)
5. [SKAN 4.0 技术详解](#skan-40-技术详解)
6. [Conversion Value 配置策略](#conversion-value-配置策略)
7. [实际应用指南](#实际应用指南)
8. [优化策略](#优化策略)
9. [各广告平台支持情况](#各广告平台支持情况)
10. [常见问题解答](#常见问题解答)

---

## 什么是 SKAdNetwork

### 背景：ATT 与隐私变革

2021年，苹果发布 **App Tracking Transparency (ATT)** 框架，要求应用必须获得用户明确授权才能追踪其跨应用行为。

**ATT 弹窗授权率**：全球约 **25-35%**

这意味着 **65-75% 的用户无法被传统方式追踪**。

### SKAdNetwork 的角色

**SKAdNetwork (SKAN)** 是苹果提供的**隐私保护归因框架**，允许广告网络在不获取用户级数据的情况下，衡量广告活动的效果。

### 传统归因 vs SKAN 归因

| 步骤 | 传统归因 | SKAN 归因 |
|------|---------|----------|
| 1 | 用户点击广告 | 用户点击广告 |
| 2 | 记录 IDFA/设备ID | 记录匿名点击信号 |
| 3 | 安装应用 | 安装应用 |
| 4 | MMP 匹配设备ID | 应用发送 Conversion Value |
| 5 | 归因到具体广告+用户 | 苹果延迟发送聚合回传 |
| 6 | **完整用户级数据** | **仅有限的转化信号，无用户级数据** |

### 核心概念

| 概念 | 说明 |
|------|------|
| **Postback** | 苹果发送给广告网络的归因回传，包含有限的转化信息 |
| **Conversion Value** | 0-63 的数值，用于编码用户行为（如注册、付费等）|
| **Timer Window** | 转化值的更新窗口期 |
| **Privacy Threshold** | 隐私阈值，决定回传中包含多少信息 |
| **Crowd Anonymity** | 人群匿名性，安装量越大，获得的数据越完整 |

---

## SKAN 发展历程

| 版本 | 发布时间 | 最低 iOS | 主要特性 |
|------|---------|---------|---------|
| SKAN 1.0 | 2018 | - | 基础框架，仅支持安装归因 |
| SKAN 2.0 | 2020 | iOS 14 | 引入 Conversion Value (0-63)，支持 View-Through |
| SKAN 2.2 | 2021年4月 | iOS 14.5 | 支持多个广告网络同时接收回传 |
| SKAN 3.0 | 2021年5月 | iOS 14.6 | 增加 did-win 参数，判断最终归因 |
| **SKAN 4.0** | 2022年10月 | **iOS 16.1** | 三次回传、Coarse CV、分层 Source ID、Web-to-App |

---

## SKAN 4.0 核心变化

### 1️⃣ 三次回传机制 (Multiple Postbacks)

**这是 SKAN 4.0 最重要的变化！**

之前版本只有一次回传机会，现在可以获得三次回传，覆盖更长的用户生命周期：

| 回传 | 时间窗口 | 数据类型 | 延迟发送 | 应用场景 |
|------|---------|---------|---------|---------|
| **第1次** | 0-2 天 | Fine (0-63) 或 Coarse | 24-48小时 | 注册、教程、首日付费 |
| **第2次** | 3-7 天 | 仅 Coarse | 24-144小时 | 首周留存、首次付费 |
| **第3次** | 8-35 天 | 仅 Coarse | 24-144小时 | 复购、订阅续费、长期留存 |

### 2️⃣ 粗粒度转化值 (Coarse Conversion Value)

新增三级粗粒度值，在隐私阈值未达到时作为后备：

| 类型 | 范围 | 精度 | 使用场景 |
|------|------|------|---------|
| **Fine Value** | 0-63 (6位二进制) | 64种状态 | 需达到隐私阈值 |
| **Coarse Value** | low / medium / high | 3种状态 | 隐私阈值未达到时的后备 |

**Coarse 与 Fine 映射建议**：

| Coarse | Fine Value 范围 | 业务含义 |
|--------|----------------|---------|
| **low** | 0-21 | 仅安装，无后续行为 |
| **medium** | 22-42 | 完成注册/教程 |
| **high** | 43-63 | 付费用户 |

### 3️⃣ 分层来源标识符 (Hierarchical Source Identifier)

Source ID 从 2 位扩展到最多 4 位，根据隐私阈值层级解锁：

**Source ID 4位编码示例**：`5678`

| 位置 | 含义 | 解锁条件 |
|------|------|---------|
| 第1位 (5) | 国家/地区 | 始终可用 |
| 第2位 (6) | 广告系列 ID | Tier 1 解锁 |
| 第3位 (7) | 广告位置 | Tier 2 解锁 |
| 第4位 (8) | 广告素材变体 | Tier 3 解锁 |

**隐私层级 (Crowd Anonymity Tiers)**：

| Tier | 安装量要求 | 可获得的数据 |
|------|-----------|-------------|
| Tier 0 | 极少 | 无 Source ID，无 CV |
| Tier 1 | 少量 | 2位 Source ID，Coarse CV |
| Tier 2 | 中等 | 3位 Source ID，Coarse CV |
| Tier 3 | 大量 | 4位 Source ID，Fine CV |

> ⚠️ **注意**：苹果未公开具体安装量阈值，需要自行测试估算

### 4️⃣ 锁定窗口机制 (Locking Windows)

可以提前锁定某个窗口，加速回传：

```swift
// iOS 代码示例
SKAdNetwork.updatePostbackConversionValue(
    fineValue: 42,
    coarseValue: .high,
    lockWindow: true  // 锁定当前窗口，提前发送回传
)
```

**锁定窗口的好处**：
- 更快获得回传数据
- 适用于用户行为明确后不再变化的场景
- 例如：用户完成首次付费后，锁定第1窗口

### 5️⃣ Web-to-App 归因

SKAN 4.0 支持从 Safari 网页到 App 的归因：

| 步骤 | 说明 |
|------|------|
| 1 | 用户在 Safari 中看到广告 |
| 2 | 点击广告，跳转到 App Store |
| 3 | 安装并打开 App |
| 4 | SKAN 将安装归因到网页广告来源 |

**要求**：
- 网页需要实现 SKAdNetwork JavaScript API
- 需要在 Info.plist 中配置支持的广告网络

---

## 对广告行业的影响

### 🔴 负面影响

| 影响 | 说明 |
|------|------|
| **数据延迟** | 回传延迟 24-144 小时，无法实时优化 |
| **数据粒度下降** | 无用户级数据，无法精准分析 |
| **归因不确定性** | 隐私阈值未达到时数据缺失 |
| **LTV 预测困难** | 有限的转化值难以准确预测用户价值 |
| **A/B 测试受限** | 小规模测试难以达到隐私阈值 |
| **再营销受阻** | 无法基于用户行为创建再营销受众 |

### 🟢 正面影响

| 影响 | 说明 |
|------|------|
| **用户信任提升** | 隐私保护增强用户对品牌的信任 |
| **公平竞争** | 大小广告主面对相同的数据限制 |
| **创意重要性提升** | 无法精准定向，创意质量更重要 |
| **第一方数据价值** | 促使企业建设自有数据资产 |

### 📊 数据损失估算

| 数据维度 | 传统归因 | SKAN 4.0 | 损失程度 |
|---------|---------|----------|---------|
| 用户级数据 | ✅ 完整 | ❌ 无 | 100% |
| 实时数据 | ✅ 实时 | ❌ 延迟24-144h | N/A |
| 转化详情 | ✅ 所有事件 | ⚠️ 0-63编码 | ~90% |
| 归因准确性 | ✅ 高 | ⚠️ 中等 | ~20-40% |
| 长期LTV | ✅ 完整 | ⚠️ 35天内 | ~50% |
| 广告素材归因 | ✅ 精确 | ⚠️ 取决于阈值 | ~30-60% |
| 地域归因 | ✅ 精确 | ⚠️ 取决于阈值 | ~20-50% |

---

## SKAN 4.0 技术详解

### 完整的 Postback 数据结构

```json
{
    "version": "4.0",
    "ad-network-id": "example123.skadnetwork",
    "source-identifier": "5678",
    "app-id": 123456789,
    "transaction-id": "6aafb7a5-0170-41b5-bbe4-fe71dedf1e28",
    "redownload": false,
    "source-domain": "example.com",
    "fidelity-type": 1,
    "did-win": true,
    "postback-sequence-index": 0,
    "conversion-value": 42,
    "coarse-conversion-value": "high",
    "source-app-id": 987654321
}
```

### 字段说明

| 字段 | 说明 | 可用性 |
|------|------|--------|
| `version` | SKAN 版本 | 始终存在 |
| `ad-network-id` | 广告网络标识符 | 始终存在 |
| `source-identifier` | 来源标识符 (2-4位) | 取决于隐私阈值 |
| `app-id` | 被推广的 App ID | 始终存在 |
| `transaction-id` | 唯一事务ID | 始终存在 |
| `redownload` | 是否为重新下载 | 始终存在 |
| `fidelity-type` | 归因类型 (0=浏览, 1=点击) | 始终存在 |
| `did-win` | 是否为最终归因 | 始终存在 |
| `postback-sequence-index` | 回传序号 (0/1/2) | 始终存在 |
| `conversion-value` | Fine Value (0-63) | 仅第1次，需达阈值 |
| `coarse-conversion-value` | Coarse Value | 始终存在 |
| `source-app-id` | 来源 App ID | 取决于隐私阈值 |
| `source-domain` | 来源网站域名 | Web-to-App 时 |

### iOS 客户端实现

```swift
import StoreKit

class SKANManager {
    
    // SKAN 4.0 更新转化值
    func updateConversionValue(fineValue: Int, coarseValue: SKAdNetwork.CoarseConversionValue, lockWindow: Bool = false) {
        if #available(iOS 16.1, *) {
            SKAdNetwork.updatePostbackConversionValue(fineValue, coarseValue: coarseValue, lockWindow: lockWindow) { error in
                if let error = error {
                    print("SKAN 4.0 update failed: \(error)")
                } else {
                    print("SKAN 4.0 update success: fine=\(fineValue), coarse=\(coarseValue)")
                }
            }
        } else if #available(iOS 15.4, *) {
            // SKAN 3.0 后备
            SKAdNetwork.updatePostbackConversionValue(fineValue) { error in
                if let error = error {
                    print("SKAN 3.0 update failed: \(error)")
                }
            }
        } else {
            // SKAN 2.0 后备
            SKAdNetwork.registerAppForAdNetworkAttribution()
            SKAdNetwork.updateConversionValue(fineValue)
        }
    }
    
    // 计算 Coarse Value
    func getCoarseValue(fineValue: Int) -> SKAdNetwork.CoarseConversionValue {
        if #available(iOS 16.1, *) {
            switch fineValue {
            case 0...21: return .low
            case 22...42: return .medium
            case 43...63: return .high
            default: return .low
            }
        }
        fatalError("iOS 16.1+ required")
    }
}
```

### 服务端接收 Postback

```python
from flask import Flask, request, jsonify
import json

app = Flask(__name__)

@app.route('/skan/postback', methods=['POST'])
def receive_postback():
    """接收 SKAN Postback"""
    postback = request.json
    
    # 解析关键字段
    data = {
        'version': postback.get('version'),
        'ad_network_id': postback.get('ad-network-id'),
        'source_identifier': postback.get('source-identifier'),
        'app_id': postback.get('app-id'),
        'transaction_id': postback.get('transaction-id'),
        'postback_index': postback.get('postback-sequence-index', 0),
        'did_win': postback.get('did-win'),
        'fidelity_type': postback.get('fidelity-type'),
        'redownload': postback.get('redownload'),
        'fine_value': postback.get('conversion-value'),
        'coarse_value': postback.get('coarse-conversion-value'),
        'source_app_id': postback.get('source-app-id'),
        'source_domain': postback.get('source-domain'),
    }
    
    # 解析 Source Identifier
    parsed_source = parse_source_identifier(data['source_identifier'])
    
    # 存储到数据库
    save_postback(data)
    
    return jsonify({'status': 'ok', 'parsed': parsed_source})


def parse_source_identifier(source_id):
    """解析分层来源标识符"""
    if not source_id:
        return {}
    
    source_str = str(source_id).zfill(4)
    
    return {
        'country': source_str[0],
        'campaign': source_str[1],
        'placement': source_str[2],
        'creative': source_str[3],
    }
```

---

## Conversion Value 配置策略

### ❓ 首先搞清楚：Conversion Value 是什么？

> ⚠️ **重要提醒**：Conversion Value **不是**直接的事件回传，而是用一个 **0-63 的数字** 来"编码"代表用户行为。

#### 传统转化回传 vs SKAN Conversion Value

| 对比项 | 传统转化回传 (有IDFA) | SKAN Conversion Value |
|--------|----------------------|----------------------|
| **回传内容** | 直接告诉平台"用户做了什么" | 只能传一个数字 (0-63) |
| **数据量** | 多个事件 + 详细参数 | 仅 1 个数字，最多 64 种状态 |
| **事件名** | `purchase`、`registration` 等 | `42`、`55` 等数字 |
| **金额** | 直接传 `$49.99` | 需要编码成数字区间 |
| **用户级** | 知道是哪个用户 | 完全匿名，不知道是谁 |
| **实时性** | 实时回传 | 延迟 24-144 小时 |

#### 举个例子

**传统方式（用户授权了 IDFA）**：
```
告诉 Meta：
  用户 A 完成了 registration
  然后 add_to_cart
  最后 purchase，金额 $50
```

**SKAN 方式（用户未授权）**：
```
告诉 Meta：
  Conversion Value = 55
  
（Meta 需要根据你预设的映射表，知道 55 代表"付费 $20-$49.99"）
```

#### 所以 CV 配置策略在做什么？

**本质上是设计一套"翻译表"**，把你关心的多种用户行为"压缩"成 0-63 这 64 个数字。

| 你想追踪的事件 | 编码成 CV |
|---------------|----------|
| 仅安装 | 0 |
| 注册完成 | 10 |
| 完成教程 | 15 |
| 加购 | 20 |
| 付费 $0-$5 | 45 |
| 付费 $5-$20 | 50 |
| 付费 $20-$50 | 55 |
| 付费 $50+ | 60 |

#### 在广告平台怎么配置？

| 平台 | 配置路径 |
|------|---------|
| **Meta Ads** | 事件管理工具 → 聚合事件衡量 → 转化值配置（设置 8 个优先级事件） |
| **Google Ads** | 工具与设置 → 转化 → SKAdNetwork 映射（选择 REVENUE/EVENT/ENGAGEMENT） |
| **AppsFlyer** | Conversion Studio 可视化配置 |
| **Adjust** | Conversion Hub 智能映射 |

> 💡 **一句话总结**：CV 配置策略 = 把你关心的转化事件"翻译"成 0-63 的数字，因为苹果只允许传数字，不允许传具体事件信息。

---

### 设计原则

| 原则 | 说明 |
|------|------|
| **业务导向** | 编码对业务最重要的转化事件 |
| **互斥递进** | 值越高代表用户价值越高，只能从低向高更新 |
| **时间窗口匹配** | 第1窗口编码快速行为，后续窗口编码长期行为 |
| **Coarse 对齐** | 确保 Fine Value 与 Coarse Value 逻辑一致 |

### 方案一：纯事件型编码

**适用于**：工具类、社交类 App

| CV值 | 用户行为 | Coarse |
|------|---------|--------|
| 0 | 仅安装 | low |
| 1 | 打开App | low |
| 5 | 完成注册 | low |
| 10 | 完成新手教程 | low |
| 15 | 添加好友/关注 | low |
| 20 | 发布首条内容 | medium |
| 25 | 连续3天活跃 | medium |
| 30 | 邀请好友 | medium |
| 35 | 开启通知权限 | medium |
| 40 | 使用核心功能5次 | medium |
| 45 | 订阅/付费 | high |
| 50 | 首次购买 | high |
| 55 | 复购 | high |
| 60 | 高级会员 | high |
| 63 | 鲸鱼用户 | high |

### 方案二：收入区间型编码

**适用于**：电商类、游戏类 App

使用 6 位二进制：高2位表示行为阶段，低4位表示收入区间

**行为阶段 (高2位)**：

| 二进制 | 阶段 | CV 范围 |
|--------|------|---------|
| 00 | 仅安装 | 0-15 |
| 01 | 注册完成 | 16-31 |
| 10 | 加购/收藏 | 32-47 |
| 11 | 付费 | 48-63 |

**收入区间 (低4位，针对付费用户)**：

| 二进制 | 收入范围 |
|--------|---------|
| 0000 | $0 |
| 0001 | $0.01-$0.99 |
| 0010 | $1-$4.99 |
| 0011 | $5-$9.99 |
| 0100 | $10-$19.99 |
| 0101 | $20-$49.99 |
| 0110 | $50-$99.99 |
| 0111 | $100-$199.99 |
| 1000 | $200-$499.99 |
| 1001 | $500+ |

### 方案三：三窗口协同编码

充分利用 SKAN 4.0 的三次回传：

**第1窗口 (0-2天) - Fine Value 0-63**

| CV范围 | 含义 |
|--------|------|
| 0-10 | 安装未打开/快速卸载 |
| 11-25 | 打开但未完成注册 |
| 26-40 | 完成注册，浏览内容 |
| 41-55 | 首次关键行为（加购/发帖/匹配）|
| 56-63 | 快速付费用户 |

**第2窗口 (3-7天) - Coarse Value**

| Coarse | 含义 |
|--------|------|
| low | 3-7天内未再活跃 |
| medium | 有活跃但未付费 |
| high | 完成首次付费 |

**第3窗口 (8-35天) - Coarse Value**

| Coarse | 含义 |
|--------|------|
| low | 用户流失 |
| medium | 活跃但未复购 |
| high | 复购/订阅续费 |

### Python 代码：CV 计算

```python
def calculate_fine_value(events: list, revenue: float) -> int:
    """根据用户行为计算 Fine Conversion Value"""
    
    # 基于收入的基础值
    if revenue >= 100:
        return 63
    elif revenue >= 50:
        return 60
    elif revenue >= 20:
        return 55
    elif revenue >= 5:
        return 50
    elif revenue > 0:
        return 45
    
    # 如果无收入，基于事件计算
    event_values = {
        'app_open': 5,
        'registration': 10,
        'tutorial_complete': 15,
        'add_to_cart': 20,
        'level_5': 25,
        'day_2_retention': 30,
        'share_content': 35,
        'invite_friend': 40,
    }
    
    base_value = 0
    for event in events:
        if event in event_values:
            base_value = max(base_value, event_values[event])
    
    return min(base_value, 63)


def calculate_coarse_value(fine_value: int) -> str:
    """根据 Fine Value 计算 Coarse Value"""
    if fine_value >= 43:
        return 'high'
    elif fine_value >= 22:
        return 'medium'
    else:
        return 'low'
```

---

## 实际应用指南

### 📋 App 接入 SKAN 4.0 完整清单

> 按顺序完成以下工作，你的 App 就能正确支持 SKAN 4.0

---

#### ✅ 第一步：决定使用 MMP 还是自己实现

| 方式 | 优点 | 缺点 | 推荐场景 |
|------|------|------|---------|
| **使用 MMP** | 省事、功能全、有分析面板 | 有费用 | 绝大多数公司 |
| **自己实现** | 省钱、完全控制 | 工作量大、需要专人维护 | 大厂或预算极有限 |

**推荐**：直接使用 MMP（AppsFlyer、Adjust、Singular 等），可以节省大量开发和维护成本。

---

#### ✅ 第二步：Info.plist 添加广告网络 ID

**必须做**，否则 SKAN 归因不生效。

```xml
<!-- 在 Info.plist 中添加 -->
<key>SKAdNetworkItems</key>
<array>
    <dict>
        <key>SKAdNetworkIdentifier</key>
        <string>广告网络ID.skadnetwork</string>
    </dict>
    <!-- 添加所有合作广告网络的 ID -->
</array>
```

**去哪里找这些 ID？**
- MMP 会提供完整列表（推荐）
- GitHub：https://github.com/nickrealdini/SKAdNetwork-identifier-list
- 各广告平台文档

**需要添加多少个？** 通常 **100-300 个**，把主流广告网络都加上。

---

#### ✅ 第三步：集成 MMP SDK（推荐方式）

**如果使用 AppsFlyer**：

```swift
// 1. CocoaPods 安装
// pod 'AppsFlyerFramework'

// 2. AppDelegate 中初始化
import AppsFlyerLib

func application(_ application: UIApplication, didFinishLaunchingWithOptions ...) {
    // 初始化 AppsFlyer
    AppsFlyerLib.shared().appsFlyerDevKey = "你的DevKey"
    AppsFlyerLib.shared().appleAppID = "你的AppID"
    
    // 启用 SKAN（SDK 会自动处理）
    AppsFlyerLib.shared().waitForATTUserAuthorization(timeoutInterval: 60)
    
    // 启动
    AppsFlyerLib.shared().start()
}

// 3. 上报事件（MMP 会自动转换为 Conversion Value）
AppsFlyerLib.shared().logEvent("af_purchase", withValues: [
    "af_revenue": 49.99,
    "af_currency": "USD"
])
```

**如果使用 Adjust**：

```swift
// 1. CocoaPods 安装
// pod 'Adjust'

// 2. 初始化
import Adjust

func application(_ application: UIApplication, didFinishLaunchingWithOptions ...) {
    let config = ADJConfig(appToken: "你的Token", environment: ADJEnvironmentProduction)
    config?.linkMeEnabled = true
    Adjust.appDidLaunch(config)
}

// 3. 上报事件
let event = ADJEvent(eventToken: "购买事件Token")
event?.setRevenue(49.99, currency: "USD")
Adjust.trackEvent(event)
```

> 💡 **MMP SDK 会自动**：调用 SKAN API、管理 CV 更新、处理窗口锁定

---

#### ✅ 第四步：（如果不用MMP）自己实现 SKAN 调用

```swift
import StoreKit

class SKANManager {
    static let shared = SKANManager()
    private var currentCV: Int = 0
    
    /// 更新 Conversion Value
    func updateCV(newValue: Int, shouldLock: Bool = false) {
        // CV 只能递增
        guard newValue > currentCV else { return }
        currentCV = newValue
        
        if #available(iOS 16.1, *) {
            // SKAN 4.0
            let coarse = getCoarseValue(newValue)
            SKAdNetwork.updatePostbackConversionValue(newValue, coarseValue: coarse, lockWindow: shouldLock) { error in
                if let error = error {
                    print("SKAN 更新失败: \(error)")
                }
            }
        } else if #available(iOS 15.4, *) {
            // SKAN 3.0
            SKAdNetwork.updatePostbackConversionValue(newValue) { _ in }
        } else {
            // SKAN 2.0
            SKAdNetwork.updateConversionValue(newValue)
        }
    }
    
    private func getCoarseValue(_ fine: Int) -> SKAdNetwork.CoarseConversionValue {
        if #available(iOS 16.1, *) {
            if fine >= 43 { return .high }
            if fine >= 22 { return .medium }
            return .low
        }
        fatalError()
    }
}

// 使用示例
SKANManager.shared.updateCV(newValue: 10)  // 用户完成注册
SKANManager.shared.updateCV(newValue: 55, shouldLock: true)  // 用户付费，锁定窗口
```

---

#### ✅ 第五步：设计你的 Conversion Value 方案

**这一步最重要！** 需要业务、产品、投放一起讨论。

**核心问题**：用 64 个数字 (0-63) 表达哪些用户行为？

**简单模板**（可直接用）：

| CV 值 | 触发条件 | Coarse |
|-------|---------|--------|
| 0 | 仅安装 | low |
| 5 | 打开 App | low |
| 10 | 完成注册 | low |
| 15 | 完成新手引导 | low |
| 20 | 首次关键行为（加购/发帖/匹配等）| medium |
| 30 | 次日留存 | medium |
| 40 | 3日留存 | medium |
| 45 | 付费 $0-$5 | high |
| 50 | 付费 $5-$20 | high |
| 55 | 付费 $20-$50 | high |
| 60 | 付费 $50-$100 | high |
| 63 | 付费 $100+ | high |

**在代码中实现**：

```swift
// 事件触发时调用
func onUserEvent(_ event: String, revenue: Double = 0) {
    var cv = 0
    
    // 收入优先
    if revenue >= 100 { cv = 63 }
    else if revenue >= 50 { cv = 60 }
    else if revenue >= 20 { cv = 55 }
    else if revenue >= 5 { cv = 50 }
    else if revenue > 0 { cv = 45 }
    // 事件次之
    else if event == "day3_retention" { cv = 40 }
    else if event == "day2_retention" { cv = 30 }
    else if event == "key_action" { cv = 20 }
    else if event == "tutorial_complete" { cv = 15 }
    else if event == "registration" { cv = 10 }
    else if event == "app_open" { cv = 5 }
    
    SKANManager.shared.updateCV(newValue: cv)
}
```

---

#### ✅ 第六步：在广告平台配置 CV 映射

**Meta Ads（Facebook）**：
1. 进入 **事件管理工具**
2. 选择 **聚合事件衡量**
3. 配置 **8 个优先级转化事件**
4. 设置 **Conversion Value 映射表**（告诉 Meta 每个 CV 值代表什么）

**Google Ads**：
1. 进入 **工具与设置 → 衡量 → 转化**
2. 选择 **SKAdNetwork 映射**
3. 选择 Schema 类型：REVENUE / EVENT / ENGAGEMENT
4. 配置映射规则

**Apple Search Ads**：
- 无需额外配置，ASA 原生支持 SKAN

---

#### ✅ 第七步：测试验证

**测试清单**：

| 测试项 | 如何验证 |
|--------|---------|
| Info.plist 配置 | Xcode 检查，确保广告网络 ID 已添加 |
| SDK 初始化 | 查看控制台日志，确认 MMP SDK 启动成功 |
| CV 更新 | 用测试设备触发事件，检查 CV 是否正确更新 |
| 回传接收 | 等待 24-48 小时后，在 MMP 后台查看 Postback |

**AppsFlyer 测试方法**：
```
后台 → SKAN Dashboard → 查看回传数据
```

**Adjust 测试方法**：
```
后台 → SKAdNetwork → Testing Console
```

---

#### 📊 总结：工作清单一览

| 步骤 | 工作内容 | 负责人 | 耗时估算 |
|------|---------|--------|---------|
| 1 | 决定用 MMP 还是自己实现 | 产品/技术负责人 | 1 天 |
| 2 | Info.plist 添加广告网络 ID | iOS 开发 | 0.5 天 |
| 3 | 集成 MMP SDK | iOS 开发 | 1-2 天 |
| 4 | 设计 CV 方案 | 产品 + 投放 + 开发 | 2-3 天 |
| 5 | 实现 CV 更新逻辑 | iOS 开发 | 1-2 天 |
| 6 | 广告平台配置 | 投放 | 1 天 |
| 7 | 测试验证 | QA + 开发 | 2-3 天 |
| **总计** | | | **约 1-2 周** |

---

### 详细配置说明

#### Info.plist 配置

```xml
<key>SKAdNetworkItems</key>
<array>
    <!-- Facebook -->
    <dict>
        <key>SKAdNetworkIdentifier</key>
        <string>v9wttpbfk9.skadnetwork</string>
    </dict>
    <!-- Google -->
    <dict>
        <key>SKAdNetworkIdentifier</key>
        <string>cstr6suwn9.skadnetwork</string>
    </dict>
    <!-- Unity Ads -->
    <dict>
        <key>SKAdNetworkIdentifier</key>
        <string>4DZT52R2T5.skadnetwork</string>
    </dict>
    <!-- 添加所有合作广告网络的 ID -->
</array>
```

> 💡 **提示**：从 https://github.com/nickrealdini/SKAdNetwork-identifier-list 获取最新 ID 列表

### 2. 使用 MMP

| MMP | SKAN 4.0 支持 | 特点 |
|-----|--------------|------|
| **AppsFlyer** | ✅ 完整支持 | Conversion Studio 可视化配置 |
| **Adjust** | ✅ 完整支持 | Conversion Hub 智能映射 |
| **Singular** | ✅ 完整支持 | SKAN Advanced Analytics |
| **Branch** | ✅ 完整支持 | 预测建模集成 |
| **Kochava** | ✅ 完整支持 | SKAdNetwork Intelligence |

**使用 MMP 的好处**：
- 自动管理 Conversion Value 更新
- 聚合多个广告网络的回传
- 提供分析面板和报表
- 预测建模补充缺失数据

### 3. Source Identifier 编码建议

**第1位 (0-9): 地区/国家**

| 值 | 地区 |
|----|------|
| 0 | 美国 |
| 1 | 英国 |
| 2 | 日本 |
| 3 | 韩国 |
| 4 | 德国 |
| 5 | 法国 |
| 6 | 中国 |
| 7 | 东南亚 |
| 8 | 其他欧洲 |
| 9 | 其他地区 |

**第2位 (0-9): Campaign 分组**

| 值 | 用途 |
|----|------|
| 0-3 | 用户获取 Campaign |
| 4-6 | 再营销 Campaign |
| 7-9 | 品牌 Campaign |

**第3位 (0-9): 广告位置/类型**

| 值 | 位置 |
|----|------|
| 0 | Feed |
| 1 | Stories |
| 2 | Reels |
| 3 | 搜索 |
| 4 | 展示广告 |
| 5 | 视频广告 |
| 6-9 | 其他 |

**第4位 (0-9): 创意变体**

0-9 表示不同创意版本

**示例**：`0315` = 美国 + UA Campaign组3 + Stories + 创意版本5

---

## 优化策略

### 1. 广告投放优化

| 策略 | 说明 |
|------|------|
| **集中预算突破隐私阈值** | 避免过度分散，集中资源到核心Campaign，确保达到Tier 3 |
| **创意驱动增长** | 无法精准定向时，创意是最大变量，增加测试频率和数量 |
| **广泛定向 + 机器学习** | 使用平台自动定向：Facebook Advantage+、Google PMax、Apple Search Match |
| **优化转化事件选择** | 选择48小时内能发生的事件优化，长周期转化用代理事件 |
| **利用多次回传** | 第1窗口优化快速行为，第2窗口验证留存，第3窗口评估LTV |

### 2. 数据分析优化

```python
class SKANAnalyzer:
    
    def __init__(self, postbacks_df):
        self.df = postbacks_df
    
    def calculate_null_rate(self):
        """计算数据缺失率"""
        total = len(self.df)
        null_fine = self.df['fine_value'].isna().sum()
        null_source_id = self.df['source_identifier'].isna().sum()
        
        return {
            'fine_value_null_rate': null_fine / total,
            'source_id_null_rate': null_source_id / total,
        }
    
    def cohort_analysis(self):
        """基于三次回传的用户群组分析"""
        cohorts = self.df.pivot_table(
            index='transaction_id',
            columns='postback_index',
            values='coarse_value',
            aggfunc='first'
        )
        
        # 分析用户流转
        flow = cohorts.groupby([0, 1, 2]).size().reset_index(name='count')
        flow.columns = ['window_1', 'window_2', 'window_3', 'count']
        
        return flow
```

### 3. 窗口锁定策略

```swift
class ConversionManager {
    
    static let shared = ConversionManager()
    private var currentFineValue: Int = 0
    private var hasLocked: Bool = false
    
    func updateConversion(event: String, revenue: Double) {
        guard !hasLocked else { return }
        
        let newValue = calculateValue(event: event, revenue: revenue)
        
        if newValue > currentFineValue {
            currentFineValue = newValue
            
            // 判断是否应该锁定
            let shouldLock = evaluateLockCondition(value: newValue, event: event)
            
            updateSKAN(fineValue: currentFineValue, lock: shouldLock)
            
            if shouldLock {
                hasLocked = true
            }
        }
    }
    
    private func evaluateLockCondition(value: Int, event: String) -> Bool {
        // 锁定条件：
        // 1. 用户完成高价值付费 (CV >= 55)
        // 2. 用户达到最高值 (CV = 63)
        // 3. 明确的最终行为
        
        if value >= 55 { return true }
        if event == "subscription_purchased" { return true }
        if event == "vip_unlocked" { return true }
        
        return false
    }
}
```

---

## 各广告平台支持情况

| 平台 | SKAN 4.0 | 多次回传 | Coarse CV | Source ID 4位 | Web-to-App |
|------|----------|---------|-----------|---------------|------------|
| **Meta (Facebook)** | ✅ | ✅ | ✅ | ✅ | ⚠️ 部分 |
| **Google Ads** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Apple Search Ads** | ⚠️ 有限支持 | ⚠️ | ⚠️ | ⚠️ | N/A |
| **TikTok** | ✅ | ✅ | ✅ | ⚠️ 进行中 | ❌ |
| **Snapchat** | ✅ | ✅ | ✅ | ⚠️ 部分 | ❌ |
| **Twitter/X** | ⚠️ 部分 | ⚠️ | ✅ | ❌ | ❌ |
| **Unity Ads** | ✅ | ✅ | ✅ | ✅ | ❌ |
| **ironSource** | ✅ | ✅ | ✅ | ✅ | ❌ |
| **AppLovin** | ✅ | ✅ | ✅ | ✅ | ❌ |

> ⚠️ **Apple Search Ads 注意**：ASA 使用自己的归因系统 (Apple Ads Attribution API)，对 SKAN 4.0 的全部特性支持有限。ASA 的归因数据相对更完整，建议单独处理。

---

## 常见问题解答

### Q1: SKAN 4.0 什么时候完全取代旧版本？

取决于用户的 iOS 版本分布：
- iOS 16.1+ 用户使用 SKAN 4.0
- iOS 14.5-16.0 用户使用 SKAN 2.2/3.0
- **建议**：同时兼容多个版本

### Q2: 为什么我的 Fine Value 经常是 null？

**原因**：
1. 未达到隐私阈值 (安装量太少)
2. Campaign 过于分散
3. 目标地区/人群太窄

**解决方案**：
- 集中预算到核心 Campaign
- 使用广泛定向
- 合并小规模 Ad Set

### Q3: 如何判断我达到了哪个隐私层级？

苹果不公开具体阈值，可以通过以下方式推断：
1. 观察返回的 Source ID 位数
2. 观察 Fine Value 的返回率
3. 通常需要每天 **几十到上百** 的安装量才能稳定获得完整数据

### Q4: 三次回传的延迟会影响优化吗？

会有影响，建议：
- 第1窗口数据用于快速优化
- 使用预测模型补充第2、3窗口数据
- 关注 Coarse Value 趋势而非精确数值
- 接受更长的学习周期

### Q5: Web-to-App 归因如何配置？

需要：
1. 在网页添加 SKAdNetwork JavaScript
2. 配置 Private Click Measurement (PCM)
3. App 端支持处理归因
4. 目前支持有限，建议关注苹果官方更新

### Q6: SKAN 数据和 MMP 数据不一致怎么办？

这是正常现象：
- SKAN 是延迟聚合数据
- MMP 可能有概率建模补充
- **建议**：使用 MMP 数据做主要分析，SKAN 数据作为验证参考

---

## 附录

### Conversion Value 速查表

| CV | 二进制 | Coarse |
|----|--------|--------|
| 0 | 000000 | low |
| 10 | 001010 | low |
| 21 | 010101 | low |
| 22 | 010110 | medium |
| 32 | 100000 | medium |
| 42 | 101010 | medium |
| 43 | 101011 | high |
| 53 | 110101 | high |
| 63 | 111111 | high |

### API 限制提醒

| 平台 | 限制 | 建议 |
|------|------|------|
| Google Ads | 每秒请求有限制 | 使用 SearchStream 减少请求数 |
| Meta Ads | 配额基于业务用量 | 检查 x-business-use-case-usage 头 |
| Apple Ads | 20请求/秒 | 适当添加延迟 |

### 相关资源

| 资源 | 链接 |
|------|------|
| Apple SKAdNetwork 官方文档 | https://developer.apple.com/documentation/storekit/skadnetwork |
| Apple AdAttributionKit 文档 (新) | https://developer.apple.com/documentation/adattributionkit |
| SKAN 4.0 实施指南 | https://developer.apple.com/app-store/ad-attribution/ |
| SKAdNetwork ID 列表 | https://github.com/nickrealdini/SKAdNetwork-identifier-list |
| AppsFlyer SKAN 指南 | https://www.appsflyer.com/resources/guides/skan-guide/ |
| Adjust SKAN 中心 | https://www.adjust.com/product/skadnetwork-solutions/ |
| Singular SKAN 文档 | https://www.singular.net/skadnetwork/ |

### 版本历史

| 日期 | 版本 | 更新内容 |
|------|------|---------|
| 2024年12月 | 1.2 | 添加 AdAttributionKit 提醒，更新 Apple Search Ads 支持情况 |
| 2024年12月 | 1.1 | 优化表格格式，添加 CV 概念说明，添加 App 接入清单 |
| 2024年12月 | 1.0 | 初始版本 |

---

*最后更新: 2024年12月*
*文档版本: 1.2*
