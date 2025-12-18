# 📊 广告数据 API 指南

> 本文档整理了 **Google Ads**、**Meta (Facebook) Ads** 和 **Apple Search Ads** 三大平台的 API 数据拉取指南，供团队参考使用。

---

## 目录

1. [广告层级结构对比](#广告层级结构对比)
2. [各层级关系详解](#各层级关系详解)
3. [Google Ads API](#google-ads-api)
4. [Meta (Facebook) Ads API](#meta-facebook-ads-api)
5. [Apple Search Ads API](#apple-search-ads-api)
6. [数据库设计建议](#数据库设计建议)
7. [数据同步最佳实践](#数据同步最佳实践)

---

## 广告层级结构对比

### 三大平台结构对比

| 层级 | Google Ads | Meta Ads | Apple Search Ads |
|------|------------|----------|------------------|
| **第1层** | Account | Ad Account | Organization |
| **第2层** | Campaign | Campaign | Campaign |
| **第3层** | Ad Group | Ad Set | Ad Group |
| **第4层** | Ad | Ad | Ad (Keyword) |

### 层级关系图

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Account 账户层                             │
│  (付款信息、权限管理、时区货币设置)                                    │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          Campaign 广告系列                           │
│  • 广告目标 (销售/流量/安装/品牌)                                      │
│  • 总预算上限                                                        │
│  • 投放时间范围                                                       │
│  • 广告系列类型                                                       │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Ad Group / Ad Set 广告组                          │
│  • 受众定向 (年龄/性别/地区/兴趣/自定义受众)                            │
│  • 出价策略和金额                                                     │
│  • 展示位置 (Feed/Story/搜索结果)                                     │
│  • 细分预算控制                                                       │
│  • 投放排期                                                          │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                             Ad 广告                                  │
│  • 创意素材 (图片/视频/轮播)                                          │
│  • 文案 (标题/描述/CTA)                                              │
│  • 落地页 URL                                                        │
│  • 追踪参数                                                          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 各层级关系详解

### 🎯 简单比喻

| 层级 | 比喻 | 说明 |
|------|------|------|
| **Campaign** | 战役目标 | 我们要打什么仗（获客/品牌/销售） |
| **Ad Group/Set** | 作战部队 | 向谁投放、花多少钱、在哪投 |
| **Ad** | 士兵武器 | 具体用什么内容去打动用户 |

### 数据关系

```
1 Account → N Campaigns
1 Campaign → N Ad Groups/Sets  
1 Ad Group/Set → N Ads

# 外键关系
Ad.ad_group_id → Ad Group.id
Ad Group.campaign_id → Campaign.id
Campaign.account_id → Account.id
```

---

## Google Ads API

### 基本信息

| 项目 | 说明 |
|------|------|
| **官方文档** | https://developers.google.com/google-ads/api |
| **API 版本** | **v18** (稳定版) / **v21** (最新版，2025年发布) |
| **认证方式** | OAuth 2.0 + Developer Token |
| **查询语言** | GAQL (Google Ads Query Language) |
| **版本发布说明** | https://developers.google.com/google-ads/api/docs/release-notes |

### ⚠️ 版本更新提醒

> **重要**：Google Ads API 版本更新频繁，每个版本有 **约12个月的生命周期**，过期后会被废弃。
> 
> 请定期检查版本更新，避免使用已废弃的版本导致服务中断。

| 版本状态 | 说明 |
|---------|------|
| **最新版本** | v21 (2025年发布) |
| **稳定推荐** | v18 |
| **即将废弃** | v16 及更早版本 |
| **查看最新** | https://developers.google.com/google-ads/api/docs/release-notes |

**版本生命周期**：
- 新版本发布后，旧版本通常有 **12个月** 的过渡期
- 废弃版本的 API 调用会返回错误
- 建议每 **6个月** 检查一次是否需要升级

### API 访问地址

| 类型 | 地址 |
|------|------|
| **gRPC 端点** | `googleads.googleapis.com:443` |
| **REST 端点** | `https://googleads.googleapis.com/v18/` |
| **OAuth 授权** | `https://accounts.google.com/o/oauth2/auth` |
| **Token 端点** | `https://oauth2.googleapis.com/token` |

### REST API 完整地址

| 功能 | HTTP 方法 | 完整 URL |
|------|----------|---------|
| **查询数据 (Search)** | POST | `https://googleads.googleapis.com/v18/customers/{customer_id}/googleAds:search` |
| **流式查询 (SearchStream)** | POST | `https://googleads.googleapis.com/v18/customers/{customer_id}/googleAds:searchStream` |
| **获取 Campaign** | GET | `https://googleads.googleapis.com/v18/customers/{customer_id}/campaigns/{campaign_id}` |
| **列出 Campaigns** | POST | `https://googleads.googleapis.com/v18/customers/{customer_id}/googleAds:search` |
| **获取 Ad Group** | GET | `https://googleads.googleapis.com/v18/customers/{customer_id}/adGroups/{ad_group_id}` |
| **获取 Ad** | GET | `https://googleads.googleapis.com/v18/customers/{customer_id}/adGroupAds/{ad_group_id}~{ad_id}` |
| **批量操作** | POST | `https://googleads.googleapis.com/v18/customers/{customer_id}/googleAds:mutate` |

> 💡 **提示**：Google Ads API 主要使用 **gRPC** 协议，REST 是备选方案。推荐使用官方 SDK，SDK 会自动处理版本升级。

### 重要 API 资源

| API 资源 | 用途 | 重要性 |
|---------|------|-------|
| `GoogleAdsService.Search` | **核心查询接口**，用 GAQL 查询所有数据 | ⭐⭐⭐⭐⭐ |
| `GoogleAdsService.SearchStream` | 流式查询，适合大数据量 | ⭐⭐⭐⭐⭐ |
| `customer` | 账户信息 | ⭐⭐⭐⭐ |
| `campaign` | 广告系列数据 | ⭐⭐⭐⭐⭐ |
| `ad_group` | 广告组数据 | ⭐⭐⭐⭐⭐ |
| `ad_group_ad` | 广告数据 | ⭐⭐⭐⭐⭐ |
| `campaign_budget` | 预算设置 | ⭐⭐⭐⭐ |
| `ad_group_criterion` | 关键词/受众定向 | ⭐⭐⭐⭐ |
| `campaign_criterion` | Campaign级定向 | ⭐⭐⭐ |
| `asset` | 素材资源 | ⭐⭐⭐ |
| `metrics` | 效果指标 | ⭐⭐⭐⭐⭐ |
| `segments` | 数据维度分割 | ⭐⭐⭐⭐ |

### GAQL 查询示例

#### 获取 Campaign 数据

```sql
SELECT 
  campaign.id,
  campaign.name,
  campaign.status,
  campaign.advertising_channel_type,
  campaign.bidding_strategy_type,
  campaign_budget.amount_micros,
  campaign.start_date,
  campaign.end_date,
  metrics.impressions,
  metrics.clicks,
  metrics.cost_micros,
  metrics.conversions,
  metrics.conversions_value,
  metrics.ctr,
  metrics.average_cpc
FROM campaign
WHERE segments.date DURING LAST_30_DAYS
  AND campaign.status != 'REMOVED'
```

#### 获取 Ad Group 数据

```sql
SELECT
  ad_group.id,
  ad_group.name,
  ad_group.campaign,
  ad_group.status,
  ad_group.type,
  ad_group.cpc_bid_micros,
  metrics.impressions,
  metrics.clicks,
  metrics.cost_micros,
  metrics.conversions,
  metrics.ctr
FROM ad_group
WHERE segments.date DURING LAST_30_DAYS
  AND ad_group.status != 'REMOVED'
```

#### 获取 Ad 数据

```sql
SELECT
  ad_group_ad.ad.id,
  ad_group_ad.ad.name,
  ad_group_ad.ad.type,
  ad_group_ad.ad.final_urls,
  ad_group_ad.ad_group,
  ad_group_ad.status,
  ad_group_ad.policy_summary.approval_status,
  metrics.impressions,
  metrics.clicks,
  metrics.cost_micros,
  metrics.conversions
FROM ad_group_ad
WHERE segments.date DURING LAST_30_DAYS
  AND ad_group_ad.status != 'REMOVED'
```

#### 按日期分维度获取数据

```sql
SELECT
  segments.date,
  campaign.id,
  campaign.name,
  metrics.impressions,
  metrics.clicks,
  metrics.cost_micros,
  metrics.conversions
FROM campaign
WHERE segments.date BETWEEN '2024-01-01' AND '2024-01-31'
ORDER BY segments.date DESC
```

### 重要 Metrics 字段

| 字段名 | 说明 | 单位 |
|--------|------|------|
| `impressions` | 展示次数 | 次 |
| `clicks` | 点击次数 | 次 |
| `cost_micros` | 花费 | **微单位** (除以 1,000,000 得到实际金额) |
| `conversions` | 转化数 | 次 |
| `conversions_value` | 转化价值 | 货币 |
| `ctr` | 点击率 | 百分比 |
| `average_cpc` | 平均点击成本 | 微单位 |
| `average_cpm` | 千次展示成本 | 微单位 |
| `view_through_conversions` | 浏览转化 | 次 |
| `all_conversions` | 所有转化(含跨设备) | 次 |

### Python 代码示例

```python
from google.ads.googleads.client import GoogleAdsClient

# 初始化客户端
client = GoogleAdsClient.load_from_storage("google-ads.yaml")

def get_campaigns(client, customer_id):
    """获取所有Campaign数据"""
    ga_service = client.get_service("GoogleAdsService")
    
    query = """
        SELECT 
            campaign.id,
            campaign.name,
            campaign.status,
            metrics.impressions,
            metrics.clicks,
            metrics.cost_micros
        FROM campaign
        WHERE segments.date DURING LAST_30_DAYS
    """
    
    response = ga_service.search_stream(
        customer_id=customer_id,
        query=query
    )
    
    campaigns = []
    for batch in response:
        for row in batch.results:
            campaigns.append({
                'id': row.campaign.id,
                'name': row.campaign.name,
                'status': row.campaign.status.name,
                'impressions': row.metrics.impressions,
                'clicks': row.metrics.clicks,
                'cost': row.metrics.cost_micros / 1_000_000
            })
    
    return campaigns
```

---

## Meta (Facebook) Ads API

### 基本信息

| 项目 | 说明 |
|------|------|
| **官方文档** | https://developers.facebook.com/docs/marketing-apis |
| **API 版本** | **v21.0** (2024年最新) / v20.0 (稳定版) |
| **认证方式** | OAuth 2.0 Access Token |
| **Graph API** | https://graph.facebook.com/v21.0/ |
| **版本发布说明** | https://developers.facebook.com/docs/graph-api/changelog |

### ⚠️ 版本更新提醒

> **重要**：Meta Graph API 每年发布 **3-4 个版本**，每个版本有 **约2年的生命周期**。

| 版本状态 | 说明 |
|---------|------|
| **最新版本** | v21.0 (2024年9月发布) |
| **稳定推荐** | v20.0 |
| **即将废弃** | v17.0 及更早版本 |
| **查看最新** | https://developers.facebook.com/docs/graph-api/changelog |

### API 访问地址

| 类型 | 地址 |
|------|------|
| **Base URL** | `https://graph.facebook.com/v21.0/` |
| **OAuth 授权** | `https://www.facebook.com/v21.0/dialog/oauth` |
| **Token 端点** | `https://graph.facebook.com/v21.0/oauth/access_token` |
| **Token 调试** | `https://graph.facebook.com/debug_token` |

### 完整 API 地址列表

> 💡 **注意**：URL 中的版本号 `v21.0` 请根据实际使用的版本替换

| 功能 | HTTP 方法 | 完整 URL |
|------|----------|---------|
| **获取账户信息** | GET | `https://graph.facebook.com/v21.0/act_{ad_account_id}` |
| **获取所有 Campaign** | GET | `https://graph.facebook.com/v21.0/act_{ad_account_id}/campaigns` |
| **获取单个 Campaign** | GET | `https://graph.facebook.com/v21.0/{campaign_id}` |
| **获取所有 Ad Set** | GET | `https://graph.facebook.com/v21.0/act_{ad_account_id}/adsets` |
| **获取单个 Ad Set** | GET | `https://graph.facebook.com/v21.0/{adset_id}` |
| **获取所有 Ad** | GET | `https://graph.facebook.com/v21.0/act_{ad_account_id}/ads` |
| **获取单个 Ad** | GET | `https://graph.facebook.com/v21.0/{ad_id}` |
| **账户级 Insights** | GET | `https://graph.facebook.com/v21.0/act_{ad_account_id}/insights` |
| **Campaign 级 Insights** | GET | `https://graph.facebook.com/v21.0/{campaign_id}/insights` |
| **Ad Set 级 Insights** | GET | `https://graph.facebook.com/v21.0/{adset_id}/insights` |
| **Ad 级 Insights** | GET | `https://graph.facebook.com/v21.0/{ad_id}/insights` |
| **异步报表请求** | POST | `https://graph.facebook.com/v21.0/act_{ad_account_id}/insights` |
| **异步报表状态** | GET | `https://graph.facebook.com/v21.0/{report_run_id}` |
| **获取广告创意** | GET | `https://graph.facebook.com/v21.0/{ad_id}/adcreatives` |
| **获取广告图片** | GET | `https://graph.facebook.com/v21.0/act_{ad_account_id}/adimages` |
| **获取广告视频** | GET | `https://graph.facebook.com/v21.0/act_{ad_account_id}/advideos` |
| **获取自定义受众** | GET | `https://graph.facebook.com/v21.0/act_{ad_account_id}/customaudiences` |
| **获取像素** | GET | `https://graph.facebook.com/v21.0/act_{ad_account_id}/adspixels` |

> 💡 **注意**：`ad_account_id` 需要加 `act_` 前缀，如 `act_123456789`

### 重要 API Endpoints

| Endpoint | 用途 | 重要性 |
|----------|------|-------|
| `GET /{ad_account_id}` | 获取账户信息 | ⭐⭐⭐⭐ |
| `GET /{ad_account_id}/campaigns` | 获取所有Campaign | ⭐⭐⭐⭐⭐ |
| `GET /{ad_account_id}/adsets` | 获取所有Ad Set | ⭐⭐⭐⭐⭐ |
| `GET /{ad_account_id}/ads` | 获取所有Ad | ⭐⭐⭐⭐⭐ |
| `GET /{ad_account_id}/insights` | 账户级效果数据 | ⭐⭐⭐⭐⭐ |
| `GET /{campaign_id}/insights` | Campaign级效果数据 | ⭐⭐⭐⭐⭐ |
| `GET /{adset_id}/insights` | Ad Set级效果数据 | ⭐⭐⭐⭐⭐ |
| `GET /{ad_id}/insights` | Ad级效果数据 | ⭐⭐⭐⭐⭐ |
| `GET /{ad_id}/adcreatives` | 广告创意详情 | ⭐⭐⭐⭐ |
| `GET /{ad_account_id}/adimages` | 广告图片 | ⭐⭐⭐ |
| `GET /{ad_account_id}/advideos` | 广告视频 | ⭐⭐⭐ |
| `POST /{ad_account_id}/insights` | 异步报表请求 | ⭐⭐⭐⭐ |

### 常用字段

#### Campaign 字段

```python
campaign_fields = [
    'id',                    # Campaign ID
    'name',                  # 名称
    'status',                # 状态: ACTIVE, PAUSED, DELETED, ARCHIVED
    'effective_status',      # 有效状态
    'objective',             # 目标: CONVERSIONS, LINK_CLICKS, APP_INSTALLS等
    'daily_budget',          # 日预算 (分为单位)
    'lifetime_budget',       # 总预算
    'budget_remaining',      # 剩余预算
    'spend_cap',             # 花费上限
    'created_time',          # 创建时间
    'updated_time',          # 更新时间
    'start_time',            # 开始时间
    'stop_time',             # 结束时间
    'buying_type',           # 购买类型
    'bid_strategy',          # 出价策略
]
```

#### Ad Set 字段

```python
adset_fields = [
    'id',                    # Ad Set ID
    'name',                  # 名称
    'campaign_id',           # 所属Campaign ID
    'status',                # 状态
    'effective_status',      # 有效状态
    'daily_budget',          # 日预算
    'lifetime_budget',       # 总预算
    'budget_remaining',      # 剩余预算
    'targeting',             # 定向设置 (JSON)
    'optimization_goal',     # 优化目标
    'billing_event',         # 计费事件: IMPRESSIONS, LINK_CLICKS
    'bid_amount',            # 出价金额
    'bid_strategy',          # 出价策略
    'start_time',            # 开始时间
    'end_time',              # 结束时间
    'created_time',          # 创建时间
    'updated_time',          # 更新时间
    'promoted_object',       # 推广对象 (应用/像素等)
]
```

#### Ad 字段

```python
ad_fields = [
    'id',                    # Ad ID
    'name',                  # 名称
    'adset_id',              # 所属Ad Set ID
    'campaign_id',           # 所属Campaign ID
    'status',                # 状态
    'effective_status',      # 有效状态
    'creative',              # 创意信息
    'created_time',          # 创建时间
    'updated_time',          # 更新时间
    'tracking_specs',        # 追踪设置
    'conversion_specs',      # 转化设置
]
```

#### Insights (效果数据) 字段

```python
insight_fields = [
    # 基础指标
    'impressions',           # 展示次数
    'clicks',                # 点击次数 (所有)
    'spend',                 # 花费
    'reach',                 # 触达人数
    'frequency',             # 频次
    
    # 成本指标
    'cpm',                   # 千次展示成本
    'cpc',                   # 单次点击成本
    'cpp',                   # 单次触达成本
    'ctr',                   # 点击率
    
    # 转化指标
    'actions',               # 动作 (JSON数组)
    'action_values',         # 动作价值
    'conversions',           # 转化数
    'cost_per_action_type',  # 单次动作成本
    'cost_per_conversion',   # 单次转化成本
    
    # 链接相关
    'inline_link_clicks',    # 链接点击
    'inline_link_click_ctr', # 链接点击率
    'cost_per_inline_link_click', # 链接点击成本
    
    # 视频相关
    'video_p25_watched_actions',  # 观看25%
    'video_p50_watched_actions',  # 观看50%
    'video_p75_watched_actions',  # 观看75%
    'video_p100_watched_actions', # 观看100%
    
    # 时间维度
    'date_start',            # 数据开始日期
    'date_stop',             # 数据结束日期
]
```

### API 请求示例

#### 获取 Campaigns

```bash
GET https://graph.facebook.com/v19.0/act_<AD_ACCOUNT_ID>/campaigns
  ?fields=id,name,status,objective,daily_budget,lifetime_budget,created_time
  &access_token=<ACCESS_TOKEN>
  &limit=100
```

#### 获取 Insights (按天)

```bash
GET https://graph.facebook.com/v19.0/act_<AD_ACCOUNT_ID>/insights
  ?fields=campaign_id,campaign_name,impressions,clicks,spend,ctr,cpc
  &level=campaign
  &time_range={"since":"2024-01-01","until":"2024-01-31"}
  &time_increment=1
  &access_token=<ACCESS_TOKEN>
```

### Python 代码示例

```python
from facebook_business.api import FacebookAdsApi
from facebook_business.adobjects.adaccount import AdAccount
from facebook_business.adobjects.campaign import Campaign
from facebook_business.adobjects.adsinsights import AdsInsights

# 初始化
FacebookAdsApi.init(app_id, app_secret, access_token)
account = AdAccount(f'act_{ad_account_id}')

def get_campaigns_with_insights(account, date_preset='last_30d'):
    """获取Campaign及其效果数据"""
    campaigns = account.get_campaigns(fields=[
        Campaign.Field.id,
        Campaign.Field.name,
        Campaign.Field.status,
        Campaign.Field.objective,
        Campaign.Field.daily_budget,
    ])
    
    results = []
    for campaign in campaigns:
        # 获取insights
        insights = campaign.get_insights(
            fields=[
                AdsInsights.Field.impressions,
                AdsInsights.Field.clicks,
                AdsInsights.Field.spend,
                AdsInsights.Field.ctr,
                AdsInsights.Field.cpc,
            ],
            params={
                'date_preset': date_preset,
            }
        )
        
        campaign_data = {
            'id': campaign['id'],
            'name': campaign['name'],
            'status': campaign['status'],
            'objective': campaign.get('objective'),
            'daily_budget': campaign.get('daily_budget'),
        }
        
        if insights:
            campaign_data.update({
                'impressions': insights[0].get('impressions', 0),
                'clicks': insights[0].get('clicks', 0),
                'spend': insights[0].get('spend', 0),
                'ctr': insights[0].get('ctr', 0),
                'cpc': insights[0].get('cpc', 0),
            })
        
        results.append(campaign_data)
    
    return results


def get_daily_insights(account, start_date, end_date, level='campaign'):
    """获取按天的效果数据"""
    params = {
        'level': level,  # campaign, adset, ad
        'time_range': {
            'since': start_date,
            'until': end_date,
        },
        'time_increment': 1,  # 按天
    }
    
    fields = [
        'campaign_id',
        'campaign_name',
        'adset_id',
        'adset_name',
        'ad_id',
        'ad_name',
        'impressions',
        'clicks',
        'spend',
        'conversions',
        'ctr',
        'cpc',
        'date_start',
        'date_stop',
    ]
    
    insights = account.get_insights(fields=fields, params=params)
    return list(insights)
```

### 异步报表 (大数据量推荐)

```python
def create_async_report(account, params):
    """创建异步报表任务"""
    report = account.get_insights_async(
        fields=[
            'campaign_id', 'adset_id', 'ad_id',
            'impressions', 'clicks', 'spend', 'conversions'
        ],
        params=params
    )
    
    # 等待报表生成
    while True:
        report.remote_read()
        status = report[AdReportRun.Field.async_status]
        
        if status == 'Job Completed':
            break
        elif status == 'Job Failed':
            raise Exception("Report generation failed")
        
        time.sleep(10)
    
    # 获取结果
    return list(report.get_result())
```

---

## Apple Search Ads API

### 基本信息

| 项目 | 说明 |
|------|------|
| **官方文档** | https://developer.apple.com/documentation/apple_search_ads |
| **API 版本** | **v5** (最新) / v4 (稳定版) |
| **认证方式** | OAuth 2.0 (Client Credentials) |
| **Base URL** | https://api.searchads.apple.com/api/v5 |
| **版本发布说明** | https://developer.apple.com/documentation/apple_search_ads/apple_search_ads_campaign_management_api |

### ⚠️ 版本更新提醒

> **重要**：Apple Search Ads API 更新相对稳定，但建议使用最新版本以获得新功能。

| 版本状态 | 说明 |
|---------|------|
| **最新版本** | v5 |
| **稳定版本** | v4 |
| **查看最新** | https://developer.apple.com/documentation/apple_search_ads |

### API 访问地址

| 类型 | 地址 |
|------|------|
| **Base URL** | `https://api.searchads.apple.com/api/v5` |
| **OAuth Token 端点** | `https://appleid.apple.com/auth/oauth2/token` |

### 完整 API 地址列表

> 💡 **注意**：URL 中的版本号 `v5` 请根据实际使用的版本替换

| 功能 | HTTP 方法 | 完整 URL |
|------|----------|---------|
| **获取用户 ACL** | GET | `https://api.searchads.apple.com/api/v5/acls` |
| **获取所有 Campaign** | GET | `https://api.searchads.apple.com/api/v5/campaigns` |
| **获取单个 Campaign** | GET | `https://api.searchads.apple.com/api/v5/campaigns/{campaignId}` |
| **创建 Campaign** | POST | `https://api.searchads.apple.com/api/v5/campaigns` |
| **更新 Campaign** | PUT | `https://api.searchads.apple.com/api/v5/campaigns/{campaignId}` |
| **删除 Campaign** | DELETE | `https://api.searchads.apple.com/api/v5/campaigns/{campaignId}` |
| **获取 Ad Groups** | GET | `https://api.searchads.apple.com/api/v5/campaigns/{campaignId}/adgroups` |
| **获取单个 Ad Group** | GET | `https://api.searchads.apple.com/api/v5/adgroups/{adgroupId}` |
| **创建 Ad Group** | POST | `https://api.searchads.apple.com/api/v5/campaigns/{campaignId}/adgroups` |
| **获取定向关键词** | GET | `https://api.searchads.apple.com/api/v5/campaigns/{campaignId}/adgroups/{adgroupId}/targetingkeywords` |
| **添加定向关键词** | POST | `https://api.searchads.apple.com/api/v5/campaigns/{campaignId}/adgroups/{adgroupId}/targetingkeywords/bulk` |
| **获取否定关键词** | GET | `https://api.searchads.apple.com/api/v5/campaigns/{campaignId}/adgroups/{adgroupId}/negativekeywords` |
| **Campaign 报表** | POST | `https://api.searchads.apple.com/api/v5/reports/campaigns` |
| **Ad Group 报表** | POST | `https://api.searchads.apple.com/api/v5/reports/adgroups` |
| **关键词报表** | POST | `https://api.searchads.apple.com/api/v5/reports/keywords` |
| **搜索词报表** | POST | `https://api.searchads.apple.com/api/v5/reports/searchterms` |
| **创意组报表** | POST | `https://api.searchads.apple.com/api/v5/reports/creativesets` |
| **获取 App 信息** | GET | `https://api.searchads.apple.com/api/v5/search/apps?query={appName}` |
| **获取地理位置** | GET | `https://api.searchads.apple.com/api/v5/search/geo?query={location}` |

### 请求头说明

```bash
# 必须的请求头
Authorization: Bearer {access_token}
X-AP-Context: orgId={org_id}
Content-Type: application/json
```

### 认证流程

Apple Search Ads 使用 **Client Credentials** 方式：

1. 在 Apple Search Ads 后台创建 API 证书
2. 下载私钥 (.key 文件)
3. 使用私钥生成 Client Secret (JWT)
4. 换取 Access Token

```python
import jwt
import time
import requests

def generate_client_secret(client_id, team_id, key_id, private_key):
    """生成 Client Secret (JWT)"""
    headers = {
        "alg": "ES256",
        "kid": key_id
    }
    
    payload = {
        "sub": client_id,
        "aud": "https://appleid.apple.com",
        "iat": int(time.time()),
        "exp": int(time.time()) + 86400 * 180,  # 180天
        "iss": team_id
    }
    
    return jwt.encode(payload, private_key, algorithm="ES256", headers=headers)


def get_access_token(client_id, client_secret):
    """获取 Access Token"""
    response = requests.post(
        "https://appleid.apple.com/auth/oauth2/token",
        data={
            "grant_type": "client_credentials",
            "client_id": client_id,
            "client_secret": client_secret,
            "scope": "searchadsorg"
        }
    )
    return response.json()["access_token"]
```

### 重要 API Endpoints

| Endpoint | Method | 用途 | 重要性 |
|----------|--------|------|-------|
| `/acls` | GET | 获取用户权限和组织列表 | ⭐⭐⭐⭐ |
| `/campaigns` | GET | 获取所有Campaign | ⭐⭐⭐⭐⭐ |
| `/campaigns/{campaignId}` | GET | 获取单个Campaign | ⭐⭐⭐⭐ |
| `/campaigns/{campaignId}/adgroups` | GET | 获取Campaign下的Ad Groups | ⭐⭐⭐⭐⭐ |
| `/adgroups/{adgroupId}` | GET | 获取单个Ad Group | ⭐⭐⭐⭐ |
| `/campaigns/{campaignId}/adgroups/{adgroupId}/targetingkeywords` | GET | 获取定向关键词 | ⭐⭐⭐⭐⭐ |
| `/campaigns/{campaignId}/adgroups/{adgroupId}/negativekeywords` | GET | 获取否定关键词 | ⭐⭐⭐ |
| `/reports/campaigns` | POST | Campaign报表 | ⭐⭐⭐⭐⭐ |
| `/reports/adgroups` | POST | Ad Group报表 | ⭐⭐⭐⭐⭐ |
| `/reports/keywords` | POST | 关键词报表 | ⭐⭐⭐⭐⭐ |
| `/reports/searchterms` | POST | 搜索词报表 | ⭐⭐⭐⭐ |
| `/reports/creativesets` | POST | 创意组报表 | ⭐⭐⭐ |

### 数据结构

#### Campaign 对象

```json
{
    "id": 123456789,
    "orgId": 1234567,
    "name": "My App Campaign",
    "budgetAmount": {
        "amount": "1000",
        "currency": "USD"
    },
    "dailyBudgetAmount": {
        "amount": "100",
        "currency": "USD"
    },
    "adamId": 1234567890,  // App Store App ID
    "countriesOrRegions": ["US", "CA"],
    "status": "ENABLED",  // ENABLED, PAUSED
    "servingStatus": "RUNNING",
    "displayStatus": "RUNNING",
    "supplySources": ["APPSTORE_SEARCH_RESULTS"],
    "adChannelType": "SEARCH",
    "billingEvent": "TAPS",
    "startTime": "2024-01-01T00:00:00.000",
    "endTime": null
}
```

#### Ad Group 对象

```json
{
    "id": 987654321,
    "campaignId": 123456789,
    "name": "Brand Keywords",
    "status": "ENABLED",
    "servingStatus": "RUNNING",
    "displayStatus": "RUNNING",
    "defaultBidAmount": {
        "amount": "1.50",
        "currency": "USD"
    },
    "cpaGoal": {
        "amount": "5.00",
        "currency": "USD"
    },
    "startTime": "2024-01-01T00:00:00.000",
    "endTime": null,
    "automatedKeywordsOptIn": false,
    "targetingDimensions": {
        "age": null,
        "gender": null,
        "deviceClass": null,
        "daypart": null,
        "adminArea": null,
        "locality": null
    }
}
```

#### Keyword (关键词/广告) 对象

```json
{
    "id": 111222333,
    "adGroupId": 987654321,
    "campaignId": 123456789,
    "text": "photo editor",
    "status": "ACTIVE",
    "matchType": "EXACT",  // EXACT, BROAD
    "bidAmount": {
        "amount": "2.00",
        "currency": "USD"
    }
}
```

### 报表 API

#### 请求格式

```python
# POST /reports/campaigns
{
    "startTime": "2024-01-01",
    "endTime": "2024-01-31",
    "granularity": "DAILY",  # HOURLY, DAILY, WEEKLY, MONTHLY
    "selector": {
        "conditions": [
            {
                "field": "campaignStatus",
                "operator": "EQUALS",
                "values": ["ENABLED"]
            }
        ],
        "orderBy": [
            {
                "field": "localSpend",
                "sortOrder": "DESCENDING"
            }
        ],
        "pagination": {
            "offset": 0,
            "limit": 1000
        }
    },
    "groupBy": ["countryOrRegion"],  # 可选分组
    "returnRowTotals": true,
    "returnGrandTotals": true
}
```

#### 报表指标字段

| 字段名 | 说明 |
|--------|------|
| `impressions` | 展示次数 |
| `taps` | 点击/轻触次数 |
| `installs` | 安装数 |
| `newDownloads` | 新下载数 |
| `redownloads` | 重新下载数 |
| `latOnInstalls` | LAT开启的安装 |
| `latOffInstalls` | LAT关闭的安装 |
| `ttr` | 点击率 (Tap-Through Rate) |
| `avgCPA` | 平均CPA |
| `avgCPT` | 平均CPT (Cost Per Tap) |
| `localSpend` | 本地货币花费 |
| `conversionRate` | 转化率 |

### Python 代码示例

```python
import requests

class AppleSearchAdsClient:
    BASE_URL = "https://api.searchads.apple.com/api/v5"
    
    def __init__(self, access_token, org_id):
        self.access_token = access_token
        self.org_id = org_id
        self.headers = {
            "Authorization": f"Bearer {access_token}",
            "X-AP-Context": f"orgId={org_id}",
            "Content-Type": "application/json"
        }
    
    def get_campaigns(self, limit=100, offset=0):
        """获取所有Campaigns"""
        response = requests.get(
            f"{self.BASE_URL}/campaigns",
            headers=self.headers,
            params={"limit": limit, "offset": offset}
        )
        return response.json()
    
    def get_adgroups(self, campaign_id, limit=100, offset=0):
        """获取Campaign下的Ad Groups"""
        response = requests.get(
            f"{self.BASE_URL}/campaigns/{campaign_id}/adgroups",
            headers=self.headers,
            params={"limit": limit, "offset": offset}
        )
        return response.json()
    
    def get_keywords(self, campaign_id, adgroup_id, limit=100, offset=0):
        """获取Ad Group下的关键词"""
        response = requests.get(
            f"{self.BASE_URL}/campaigns/{campaign_id}/adgroups/{adgroup_id}/targetingkeywords",
            headers=self.headers,
            params={"limit": limit, "offset": offset}
        )
        return response.json()
    
    def get_campaign_report(self, start_date, end_date, granularity="DAILY"):
        """获取Campaign报表"""
        payload = {
            "startTime": start_date,
            "endTime": end_date,
            "granularity": granularity,
            "selector": {
                "pagination": {"offset": 0, "limit": 1000}
            },
            "returnRowTotals": True,
            "returnGrandTotals": True
        }
        
        response = requests.post(
            f"{self.BASE_URL}/reports/campaigns",
            headers=self.headers,
            json=payload
        )
        return response.json()
    
    def get_adgroup_report(self, campaign_id, start_date, end_date, granularity="DAILY"):
        """获取Ad Group报表"""
        payload = {
            "startTime": start_date,
            "endTime": end_date,
            "granularity": granularity,
            "selector": {
                "conditions": [
                    {
                        "field": "campaignId",
                        "operator": "EQUALS",
                        "values": [str(campaign_id)]
                    }
                ],
                "pagination": {"offset": 0, "limit": 1000}
            }
        }
        
        response = requests.post(
            f"{self.BASE_URL}/reports/adgroups",
            headers=self.headers,
            json=payload
        )
        return response.json()
    
    def get_keyword_report(self, campaign_id, start_date, end_date, granularity="DAILY"):
        """获取关键词报表"""
        payload = {
            "startTime": start_date,
            "endTime": end_date,
            "granularity": granularity,
            "selector": {
                "conditions": [
                    {
                        "field": "campaignId",
                        "operator": "EQUALS",
                        "values": [str(campaign_id)]
                    }
                ],
                "pagination": {"offset": 0, "limit": 1000}
            }
        }
        
        response = requests.post(
            f"{self.BASE_URL}/reports/keywords",
            headers=self.headers,
            json=payload
        )
        return response.json()


# 使用示例
client = AppleSearchAdsClient(access_token, org_id)

# 获取所有campaigns
campaigns = client.get_campaigns()

# 获取报表
report = client.get_campaign_report("2024-01-01", "2024-01-31")
```

---

## 数据库设计建议

### 通用表结构 (支持三平台)

```sql
-- =====================================================
-- 广告账户表
-- =====================================================
CREATE TABLE ad_accounts (
    id VARCHAR(50) PRIMARY KEY,
    platform ENUM('google_ads', 'meta_ads', 'apple_ads') NOT NULL,
    name VARCHAR(255),
    currency VARCHAR(10),
    timezone VARCHAR(50),
    status VARCHAR(50),
    created_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_platform (platform)
);

-- =====================================================
-- Campaign 广告系列表
-- =====================================================
CREATE TABLE campaigns (
    id VARCHAR(50) NOT NULL,
    platform ENUM('google_ads', 'meta_ads', 'apple_ads') NOT NULL,
    account_id VARCHAR(50),
    name VARCHAR(255),
    status VARCHAR(50),
    objective VARCHAR(100),
    
    -- 预算
    daily_budget DECIMAL(15,6),
    lifetime_budget DECIMAL(15,6),
    budget_remaining DECIMAL(15,6),
    
    -- 时间
    start_date DATETIME,
    end_date DATETIME,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    
    -- 平台特有字段 (JSON存储)
    extra_data JSON,
    
    PRIMARY KEY (id, platform),
    INDEX idx_account (account_id),
    INDEX idx_status (status),
    INDEX idx_created (created_at)
);

-- =====================================================
-- Ad Group / Ad Set 广告组表
-- =====================================================
CREATE TABLE ad_groups (
    id VARCHAR(50) NOT NULL,
    platform ENUM('google_ads', 'meta_ads', 'apple_ads') NOT NULL,
    campaign_id VARCHAR(50),
    name VARCHAR(255),
    status VARCHAR(50),
    
    -- 预算与出价
    daily_budget DECIMAL(15,6),
    bid_amount DECIMAL(15,6),
    bid_strategy VARCHAR(100),
    
    -- 定向 (JSON存储)
    targeting JSON,
    
    -- 时间
    start_date DATETIME,
    end_date DATETIME,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    
    -- 平台特有字段
    extra_data JSON,
    
    PRIMARY KEY (id, platform),
    INDEX idx_campaign (campaign_id),
    INDEX idx_status (status)
);

-- =====================================================
-- Ad 广告表
-- =====================================================
CREATE TABLE ads (
    id VARCHAR(50) NOT NULL,
    platform ENUM('google_ads', 'meta_ads', 'apple_ads') NOT NULL,
    campaign_id VARCHAR(50),
    ad_group_id VARCHAR(50),
    name VARCHAR(255),
    status VARCHAR(50),
    ad_type VARCHAR(100),
    
    -- 创意信息 (JSON)
    creative_data JSON,
    
    -- URL
    final_url TEXT,
    display_url VARCHAR(500),
    
    -- 时间
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    
    -- 平台特有字段
    extra_data JSON,
    
    PRIMARY KEY (id, platform),
    INDEX idx_ad_group (ad_group_id),
    INDEX idx_campaign (campaign_id),
    INDEX idx_status (status)
);

-- =====================================================
-- 效果数据表 (按天存储)
-- =====================================================
CREATE TABLE ad_metrics_daily (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    platform ENUM('google_ads', 'meta_ads', 'apple_ads') NOT NULL,
    level ENUM('account', 'campaign', 'ad_group', 'ad', 'keyword') NOT NULL,
    entity_id VARCHAR(50) NOT NULL,
    date DATE NOT NULL,
    
    -- 基础指标
    impressions BIGINT DEFAULT 0,
    clicks BIGINT DEFAULT 0,
    spend DECIMAL(15,6) DEFAULT 0,
    
    -- 转化指标
    conversions DECIMAL(15,4) DEFAULT 0,
    conversions_value DECIMAL(15,6) DEFAULT 0,
    installs BIGINT DEFAULT 0,  -- App专用
    
    -- 触达指标 (Meta专用)
    reach BIGINT DEFAULT 0,
    frequency DECIMAL(10,4) DEFAULT 0,
    
    -- 计算指标
    ctr DECIMAL(10,6) DEFAULT 0,
    cpc DECIMAL(15,6) DEFAULT 0,
    cpm DECIMAL(15,6) DEFAULT 0,
    cpa DECIMAL(15,6) DEFAULT 0,
    
    -- 平台特有指标 (JSON)
    extra_metrics JSON,
    
    -- 数据更新时间
    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- 唯一索引防重复
    UNIQUE KEY uk_entity_date (platform, level, entity_id, date),
    INDEX idx_date (date),
    INDEX idx_entity (entity_id),
    INDEX idx_platform_level (platform, level)
);

-- =====================================================
-- 关键词表 (Google Ads & Apple Search Ads)
-- =====================================================
CREATE TABLE keywords (
    id VARCHAR(50) NOT NULL,
    platform ENUM('google_ads', 'apple_ads') NOT NULL,
    campaign_id VARCHAR(50),
    ad_group_id VARCHAR(50),
    text VARCHAR(500),
    match_type ENUM('EXACT', 'PHRASE', 'BROAD') NOT NULL,
    status VARCHAR(50),
    bid_amount DECIMAL(15,6),
    
    -- 质量分数 (Google专用)
    quality_score INT,
    
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    
    PRIMARY KEY (id, platform),
    INDEX idx_ad_group (ad_group_id),
    INDEX idx_text (text(100))
);

-- =====================================================
-- 数据同步日志表
-- =====================================================
CREATE TABLE sync_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    platform ENUM('google_ads', 'meta_ads', 'apple_ads') NOT NULL,
    account_id VARCHAR(50),
    sync_type ENUM('full', 'incremental') NOT NULL,
    data_type VARCHAR(50),  -- campaigns, adgroups, ads, metrics
    date_range_start DATE,
    date_range_end DATE,
    status ENUM('running', 'success', 'failed') NOT NULL,
    records_synced INT DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    
    INDEX idx_platform_account (platform, account_id),
    INDEX idx_status (status),
    INDEX idx_started (started_at)
);
```

### 视图示例

```sql
-- Campaign 汇总视图
CREATE VIEW v_campaign_summary AS
SELECT 
    c.id,
    c.platform,
    c.name,
    c.status,
    c.daily_budget,
    SUM(m.impressions) as total_impressions,
    SUM(m.clicks) as total_clicks,
    SUM(m.spend) as total_spend,
    SUM(m.conversions) as total_conversions,
    CASE WHEN SUM(m.impressions) > 0 
         THEN SUM(m.clicks) / SUM(m.impressions) * 100 
         ELSE 0 END as avg_ctr,
    CASE WHEN SUM(m.clicks) > 0 
         THEN SUM(m.spend) / SUM(m.clicks) 
         ELSE 0 END as avg_cpc
FROM campaigns c
LEFT JOIN ad_metrics_daily m ON c.id = m.entity_id 
    AND c.platform = m.platform 
    AND m.level = 'campaign'
GROUP BY c.id, c.platform, c.name, c.status, c.daily_budget;
```

---

## 数据同步最佳实践

### 1. 同步策略

| 策略 | 说明 | 适用场景 |
|------|------|---------|
| **增量同步** | 每天只拉取前一天的数据 | 日常更新 |
| **全量回补** | 定期回补历史数据 | 数据修正、归因窗口调整 |
| **实时同步** | Webhook或高频轮询 | 预算监控、异常告警 |

### 2. 归因窗口注意事项

| 平台 | 归因窗口 | 建议 |
|------|---------|------|
| **Google Ads** | 默认30天点击归因 | 每周回补过去30天数据 |
| **Meta Ads** | 7天点击/1天浏览 | 每3天回补过去7天数据 |
| **Apple Ads** | 30天归因 | 每周回补过去30天数据 |

### 3. API 限制

| 平台 | 限制 | 建议 |
|------|------|------|
| **Google Ads** | 每秒请求有限制 | 使用 `SearchStream` 减少请求数 |
| **Meta Ads** | 配额基于业务用量 | 检查 `x-business-use-case-usage` 头 |
| **Apple Ads** | 20请求/秒 | 适当添加延迟 |

### 4. 错误处理

```python
import time
from functools import wraps

def retry_with_backoff(max_retries=3, base_delay=1):
    """指数退避重试装饰器"""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    if attempt == max_retries - 1:
                        raise
                    delay = base_delay * (2 ** attempt)
                    print(f"Attempt {attempt + 1} failed: {e}. Retrying in {delay}s...")
                    time.sleep(delay)
            return None
        return wrapper
    return decorator
```

### 5. 数据校验

```python
def validate_metrics(data):
    """验证数据一致性"""
    issues = []
    
    # CTR 校验
    if data['impressions'] > 0:
        expected_ctr = data['clicks'] / data['impressions']
        if abs(expected_ctr - data['ctr']) > 0.0001:
            issues.append(f"CTR mismatch: {data['ctr']} vs calculated {expected_ctr}")
    
    # 花费不能为负
    if data['spend'] < 0:
        issues.append(f"Negative spend: {data['spend']}")
    
    # 点击不能大于展示
    if data['clicks'] > data['impressions']:
        issues.append(f"Clicks > Impressions: {data['clicks']} > {data['impressions']}")
    
    return issues
```

---

## 附录：常用时间范围参数

### Google Ads

```python
# GAQL 时间范围
time_ranges = [
    "TODAY",
    "YESTERDAY", 
    "LAST_7_DAYS",
    "LAST_14_DAYS",
    "LAST_30_DAYS",
    "THIS_WEEK_SUN_TODAY",
    "THIS_WEEK_MON_TODAY",
    "LAST_WEEK_SUN_SAT",
    "LAST_WEEK_MON_SUN",
    "THIS_MONTH",
    "LAST_MONTH",
]

# 自定义范围
# WHERE segments.date BETWEEN '2024-01-01' AND '2024-01-31'
```

### Meta Ads

```python
# date_preset 预设
date_presets = [
    "today",
    "yesterday",
    "this_month",
    "last_month",
    "this_quarter",
    "last_3d",
    "last_7d",
    "last_14d",
    "last_28d",
    "last_30d",
    "last_90d",
    "last_week_mon_sun",
    "last_week_sun_sat",
    "last_quarter",
    "last_year",
    "this_week_mon_today",
    "this_week_sun_today",
    "this_year",
]

# 自定义范围
# time_range={"since":"2024-01-01","until":"2024-01-31"}
```

### Apple Search Ads

```python
# 日期格式: YYYY-MM-DD
# startTime, endTime

# granularity 粒度
granularities = ["HOURLY", "DAILY", "WEEKLY", "MONTHLY"]
```

---

## 联系方式

如有问题，请联系数据团队。

---

*最后更新: 2024年12月*

