# 质押历史查询指南

完整的用户质押历史查询方案，包括 STAKE、UNSTAKE、CLAIM 等所有活动记录。

## ⚠️ 重要：理解批处理事件与单个事件的关系

**关键概念**：合约在批处理操作时会**同时触发**多个事件！

### 事件触发机制

当用户调用批处理函数时：

```solidity
// 示例 1: 批量质押
batchStake([tokenId1, tokenId2, tokenId3])
// 合约会触发：
emit NFTStaked(user, tokenId1, level1, timestamp)  // ← STAKE #1
emit NFTStaked(user, tokenId2, level2, timestamp)  // ← STAKE #2
emit NFTStaked(user, tokenId3, level3, timestamp)  // ← STAKE #3
emit BatchStaked(user, [tokenId1, tokenId2, tokenId3], timestamp)  // ← BATCH_STAKE

// 示例 2: 批量取消质押
batchUnstake([tokenId1, tokenId2, tokenId3])
// 合约会触发：
emit NFTUnstaked(user, tokenId1, reward1, timestamp)  // ← UNSTAKE #1
emit NFTUnstaked(user, tokenId2, reward2, timestamp)  // ← UNSTAKE #2
emit NFTUnstaked(user, tokenId3, reward3, timestamp)  // ← UNSTAKE #3
emit BatchUnstaked(user, [tokenId1, tokenId2, tokenId3], totalReward, timestamp)  // ← BATCH_UNSTAKE

// 示例 3: 批量领取收益
batchClaimRewards([tokenId1, tokenId2, tokenId3])
// 合约会触发：
emit RewardsClaimed(user, tokenId1, reward1, timestamp)  // ← CLAIM #1
emit RewardsClaimed(user, tokenId2, reward2, timestamp)  // ← CLAIM #2
emit RewardsClaimed(user, tokenId3, reward3, timestamp)  // ← CLAIM #3
emit BatchClaimed(user, [tokenId1, tokenId2, tokenId3], totalReward, timestamp)  // ← BATCH_CLAIM
```

### Subgraph 记录的数据

因此 Subgraph 会创建**4 条** `StakingActivity` 记录：

```
1. { action: "STAKE", tokenIds: [tokenId1], ... }
2. { action: "STAKE", tokenIds: [tokenId2], ... }
3. { action: "STAKE", tokenIds: [tokenId3], ... }
4. { action: "BATCH_STAKE", tokenIds: [tokenId1, tokenId2, tokenId3], ... }
```

### 查询建议

| 用途 | 应该查询 | 原因 |
|------|---------|------|
| **NFT 级别的历史** | 只查 `STAKE`/`UNSTAKE`/`CLAIM` | 每个 NFT 一条记录，不重复 ⭐ |
| **操作次数统计** | 只查 `BATCH_*` 事件 | 统计用户点击了多少次 |
| **完整事件日志** | 查询所有类型 | 用于调试和审计 |

**推荐做法**：
- 📊 **展示用户历史**：只用 `STAKE`、`UNSTAKE`、`CLAIM`（避免重复）
- 📈 **统计操作次数**：只用 `BATCH_STAKE`、`BATCH_UNSTAKE`、`BATCH_CLAIM`
- 🔍 **调试或审计**：查询所有 6 种类型

---

## 📊 数据结构

### StakingActivity 实体

```graphql
type StakingActivity {
  id: ID!                        # 唯一ID: {txHash}-{logIndex}
  user: User!                    # 用户地址
  action: StakingAction!         # 操作类型
  tokenIds: [BigInt!]!           # 涉及的 NFT Token IDs
  level: Int                     # NFT等级 (1-6: C, B, A, S, SS, SSS)
  amount: BigInt                 # 金额（unstake/claim时的收益，单位 wei）
  timestamp: BigInt!             # 时间戳
  blockNumber: BigInt!           # 区块号
  transactionHash: Bytes!        # 交易哈希
}

enum StakingAction {
  STAKE           # 单个质押（包括批处理中的每个 NFT）
  UNSTAKE         # 单个取消质押（包括批处理中的每个 NFT）
  CLAIM           # 单个领取收益（包括批处理中的每个 NFT）
  BATCH_STAKE     # 批量质押汇总事件
  BATCH_UNSTAKE   # 批量取消质押汇总事件
  BATCH_CLAIM     # 批量领取收益汇总事件
}
```

### 等级对照表

| Level | 等级名称 |
|-------|---------|
| 1     | C       |
| 2     | B       |
| 3     | A       |
| 4     | S       |
| 5     | SS      |
| 6     | SSS     |

---

## 🔍 GraphQL 查询示例

### 1. 查询用户所有历史（最近20条）

```graphql
query GetUserStakingHistory($userAddress: Bytes!) {
  stakingActivities(
    first: 20
    orderBy: timestamp
    orderDirection: desc
    where: { user: $userAddress }
  ) {
    id
    action
    tokenIds
    level
    amount
    timestamp
    blockNumber
    transactionHash
  }
}
```

**变量：**
```json
{
  "userAddress": "0x01692d53f4392273bd2e11eac510832548957304"
}
```

### 2. 只查询质押事件

> ⚠️ **重要说明**：合约在批处理操作时会**同时触发**单个事件和批处理事件。
> 
> 例如：`batchStake([1, 2, 3])` 会触发：
> - 3 个 `NFTStaked` 事件（每个 tokenId 一个）
> - 1 个 `BatchStaked` 事件（包含所有 tokenIds）
> 
> **因此，查询质押记录时只需要 `STAKE` 即可，无需包含 `BATCH_STAKE`**，否则会看到重复的记录。

```graphql
query GetUserStakeHistory($userAddress: Bytes!) {
  stakingActivities(
    first: 50
    orderBy: timestamp
    orderDirection: desc
    where: { 
      user: $userAddress
      action_in: [STAKE]  # 只需要 STAKE，批处理会触发多个 STAKE 事件
    }
  ) {
    id
    action
    tokenIds
    level
    timestamp
    transactionHash
  }
}
```

### 3. 只查询取消质押事件

> ⚠️ 同样地，`batchUnstake([1, 2, 3])` 会触发：
> - 3 个 `NFTUnstaked` 事件
> - 1 个 `BatchUnstaked` 事件
> 
> **查询时只需要 `UNSTAKE` 即可。**

```graphql
query GetUserUnstakeHistory($userAddress: Bytes!) {
  stakingActivities(
    first: 50
    orderBy: timestamp
    orderDirection: desc
    where: { 
      user: $userAddress
      action_in: [UNSTAKE]  # 只需要 UNSTAKE
    }
  ) {
    id
    action
    tokenIds
    level
    amount        # 取消质押时获得的收益
    timestamp
    transactionHash
  }
}
```

### 4. 查询特定时间范围的活动

```graphql
query GetUserHistoryByTimeRange(
  $userAddress: Bytes!
  $startTime: BigInt!
  $endTime: BigInt!
) {
  stakingActivities(
    first: 100
    orderBy: timestamp
    orderDirection: desc
    where: { 
      user: $userAddress
      timestamp_gte: $startTime
      timestamp_lte: $endTime
    }
  ) {
    id
    action
    tokenIds
    level
    amount
    timestamp
    blockNumber
    transactionHash
  }
}
```

**变量示例（查询最近7天）：**
```javascript
const now = Math.floor(Date.now() / 1000);
const sevenDaysAgo = now - 7 * 24 * 60 * 60;

{
  "userAddress": "0x01692d53f4392273bd2e11eac510832548957304",
  "startTime": sevenDaysAgo.toString(),
  "endTime": now.toString()
}
```

### 5. 分页查询（处理大量历史记录）

```graphql
query GetUserHistoryPaginated(
  $userAddress: Bytes!
  $first: Int!
  $skip: Int!
) {
  stakingActivities(
    first: $first
    skip: $skip
    orderBy: timestamp
    orderDirection: desc
    where: { user: $userAddress }
  ) {
    id
    action
    tokenIds
    level
    amount
    timestamp
    transactionHash
  }
}
```

**变量示例（第2页，每页20条）：**
```json
{
  "userAddress": "0x01692d53f4392273bd2e11eac510832548957304",
  "first": 20,
  "skip": 20
}
```

---

## 💻 前端实现方案

### 方案 1: React + Apollo Client

#### 1.1 定义查询

```typescript
// src/apollo/queries.ts
import { gql } from '@apollo/client';

export const GET_USER_STAKING_HISTORY = gql`
  query GetUserStakingHistory(
    $userAddress: Bytes!
    $first: Int!
    $skip: Int!
    $actionFilter: [StakingAction!]
  ) {
    stakingActivities(
      first: $first
      skip: $skip
      orderBy: timestamp
      orderDirection: desc
      where: { 
        user: $userAddress
        action_in: $actionFilter
      }
    ) {
      id
      action
      tokenIds
      level
      amount
      timestamp
      blockNumber
      transactionHash
    }
  }
`;
```

#### 1.2 创建 Hook

```typescript
// src/hooks/useStakingHistory.ts
import { useQuery } from '@apollo/client';
import { GET_USER_STAKING_HISTORY } from '../apollo/queries';

export type StakingAction = 'STAKE' | 'UNSTAKE' | 'CLAIM' | 'BATCH_STAKE' | 'BATCH_UNSTAKE' | 'BATCH_CLAIM';

export interface StakingActivity {
  id: string;
  action: StakingAction;
  tokenIds: string[];
  level: number | null;
  amount: string | null;
  timestamp: string;
  blockNumber: string;
  transactionHash: string;
}

interface UseStakingHistoryOptions {
  userAddress: string;
  pageSize?: number;
  actionFilter?: StakingAction[];
}

export const useStakingHistory = ({
  userAddress,
  pageSize = 20,
  actionFilter = []  // 默认显示所有（包括 BATCH 事件用于统计）
}: UseStakingHistoryOptions) => {
  const [page, setPage] = useState(0);

  const { loading, error, data, fetchMore } = useQuery(
    GET_USER_STAKING_HISTORY,
    {
      variables: {
        userAddress: userAddress.toLowerCase(),
        first: pageSize,
        skip: page * pageSize,
        actionFilter: actionFilter.length > 0 ? actionFilter : null,
      },
      pollInterval: 60000, // 每分钟刷新
    }
  );

  const activities: StakingActivity[] = data?.stakingActivities || [];

  const loadMore = () => {
    setPage(page + 1);
  };

  return {
    activities,
    loading,
    error,
    loadMore,
    hasMore: activities.length === pageSize,
  };
};
```

#### 1.3 创建历史记录组件

```typescript
// src/components/StakingHistory.tsx
import React, { useState } from 'react';
import { useStakingHistory, StakingAction } from '../hooks/useStakingHistory';
import { ethers } from 'ethers';
import './StakingHistory.css';

interface StakingHistoryProps {
  userAddress: string;
}

export const StakingHistory: React.FC<StakingHistoryProps> = ({ userAddress }) => {
  const [actionFilter, setActionFilter] = useState<StakingAction[]>([]);
  
  const { activities, loading, error, loadMore, hasMore } = useStakingHistory({
    userAddress,
    pageSize: 20,
    actionFilter,
  });

  // 格式化时间
  const formatTime = (timestamp: string) => {
    const date = new Date(parseInt(timestamp) * 1000);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 格式化金额（wei -> ETH）
  const formatAmount = (amount: string | null) => {
    if (!amount) return '-';
    return `${parseFloat(ethers.utils.formatEther(amount)).toFixed(4)} ETH`;
  };

  // 获取等级名称
  const getLevelName = (level: number | null) => {
    if (!level) return '-';
    const levels = ['', 'C', 'B', 'A', 'S', 'SS', 'SSS'];
    return levels[level] || '-';
  };

  // 获取操作类型的中文名称和样式
  const getActionInfo = (action: StakingAction) => {
    const actionMap: Record<StakingAction, { name: string; className: string; emoji: string }> = {
      STAKE: { name: '质押', className: 'action-stake', emoji: '⬆️' },
      UNSTAKE: { name: '取消质押', className: 'action-unstake', emoji: '⬇️' },
      CLAIM: { name: '领取收益', className: 'action-claim', emoji: '💰' },
      BATCH_STAKE: { name: '批量质押', className: 'action-batch-stake', emoji: '⬆️⬆️' },
      BATCH_UNSTAKE: { name: '批量取消质押', className: 'action-batch-unstake', emoji: '⬇️⬇️' },
      BATCH_CLAIM: { name: '批量领取', className: 'action-batch-claim', emoji: '💰💰' },
    };
    return actionMap[action];
  };

  // 截断交易哈希
  const truncateHash = (hash: string) => {
    return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
  };

  if (loading && activities.length === 0) {
    return <div className="loading">⏳ 加载历史记录...</div>;
  }

  if (error) {
    return <div className="error">❌ 加载失败: {error.message}</div>;
  }

  return (
    <div className="staking-history">
      <h2>📜 质押历史</h2>

      {/* 筛选器 */}
      <div className="filter-bar">
        <button
          className={actionFilter.length === 0 ? 'active' : ''}
          onClick={() => setActionFilter([])}
        >
          全部
        </button>
        <button
          className={actionFilter.includes('STAKE') ? 'active' : ''}
          onClick={() => setActionFilter(['STAKE'])}  // 只需要 STAKE，批处理会触发多个 STAKE
        >
          质押
        </button>
        <button
          className={actionFilter.includes('UNSTAKE') ? 'active' : ''}
          onClick={() => setActionFilter(['UNSTAKE'])}  // 只需要 UNSTAKE
        >
          取消质押
        </button>
        <button
          className={actionFilter.includes('CLAIM') ? 'active' : ''}
          onClick={() => setActionFilter(['CLAIM'])}  // 只需要 CLAIM
        >
          领取收益
        </button>
      </div>

      {/* 历史记录表格 */}
      <div className="history-table">
        {activities.length === 0 ? (
          <div className="no-data">暂无历史记录</div>
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th>操作</th>
                  <th>NFT Token IDs</th>
                  <th>等级</th>
                  <th>金额</th>
                  <th>时间</th>
                  <th>交易</th>
                </tr>
              </thead>
              <tbody>
                {activities.map((activity) => {
                  const actionInfo = getActionInfo(activity.action);
                  return (
                    <tr key={activity.id}>
                      <td>
                        <span className={`action-badge ${actionInfo.className}`}>
                          {actionInfo.emoji} {actionInfo.name}
                        </span>
                      </td>
                      <td>
                        <div className="token-ids">
                          {activity.tokenIds.length === 1 ? (
                            <span className="token-id">#{activity.tokenIds[0]}</span>
                          ) : (
                            <>
                              <span className="token-count">{activity.tokenIds.length} NFTs</span>
                              <div className="token-list">
                                {activity.tokenIds.map((id) => (
                                  <span key={id} className="token-id">#{id}</span>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className="level-badge">
                          {getLevelName(activity.level)}
                        </span>
                      </td>
                      <td className="amount">{formatAmount(activity.amount)}</td>
                      <td className="timestamp">{formatTime(activity.timestamp)}</td>
                      <td>
                        <a
                          href={`https://sepolia.etherscan.io/tx/${activity.transactionHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="tx-link"
                        >
                          {truncateHash(activity.transactionHash)} 🔗
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* 加载更多按钮 */}
            {hasMore && (
              <div className="load-more">
                <button onClick={loadMore} disabled={loading}>
                  {loading ? '加载中...' : '加载更多'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
```

#### 1.4 样式文件

```css
/* src/components/StakingHistory.css */
.staking-history {
  background: white;
  padding: 25px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  margin-top: 30px;
}

.staking-history h2 {
  margin-top: 0;
  margin-bottom: 20px;
  font-size: 1.5em;
  color: #333;
}

/* 筛选器 */
.filter-bar {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.filter-bar button {
  padding: 8px 16px;
  border: 2px solid #e0e0e0;
  background: white;
  border-radius: 20px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
}

.filter-bar button:hover {
  background: #f5f5f5;
}

.filter-bar button.active {
  background: #667eea;
  color: white;
  border-color: #667eea;
}

/* 表格 */
.history-table {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
}

thead {
  background: #f8f9fa;
}

th {
  padding: 12px;
  text-align: left;
  font-weight: 600;
  color: #666;
  border-bottom: 2px solid #e0e0e0;
}

td {
  padding: 12px;
  border-bottom: 1px solid #f0f0f0;
}

tbody tr:hover {
  background: #f8f9fa;
}

/* 操作徽章 */
.action-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 500;
}

.action-stake {
  background: #e6f4ea;
  color: #1e7e34;
}

.action-unstake {
  background: #fce8e6;
  color: #c5221f;
}

.action-claim {
  background: #fff4e5;
  color: #f57c00;
}

.action-batch-stake {
  background: #d1f2eb;
  color: #138496;
}

.action-batch-unstake {
  background: #f8d7da;
  color: #721c24;
}

.action-batch-claim {
  background: #ffe8cc;
  color: #e65100;
}

/* Token IDs */
.token-ids {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.token-id {
  display: inline-block;
  background: #f0f0f0;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
  margin-right: 4px;
}

.token-count {
  font-weight: 600;
  color: #667eea;
}

.token-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}

/* 等级徽章 */
.level-badge {
  display: inline-block;
  background: #667eea;
  color: white;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
}

/* 金额 */
.amount {
  font-weight: 600;
  color: #4caf50;
}

/* 时间戳 */
.timestamp {
  color: #666;
  font-size: 13px;
}

/* 交易链接 */
.tx-link {
  color: #667eea;
  text-decoration: none;
  font-size: 13px;
}

.tx-link:hover {
  text-decoration: underline;
}

/* 加载更多 */
.load-more {
  text-align: center;
  margin-top: 20px;
}

.load-more button {
  padding: 10px 24px;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
}

.load-more button:hover:not(:disabled) {
  background: #5568d3;
}

.load-more button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* 响应式 */
@media (max-width: 768px) {
  table {
    font-size: 12px;
  }
  
  th, td {
    padding: 8px 4px;
  }
  
  .token-list {
    max-width: 120px;
  }
}
```

---

## 🧪 测试查询

### 使用 curl 测试

```bash
# 查询所有历史
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "query": "{ stakingActivities(first: 10, orderBy: timestamp, orderDirection: desc, where: { user: \"0x01692d53f4392273bd2e11eac510832548957304\" }) { id action tokenIds level amount timestamp transactionHash } }"
  }' \
  https://api.studio.thegraph.com/query/960/chapool-nft-staking-stats/v0.0.2

# 只查询质押事件（不包含批处理事件，避免重复）
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "query": "{ stakingActivities(first: 10, orderBy: timestamp, orderDirection: desc, where: { user: \"0x01692d53f4392273bd2e11eac510832548957304\", action_in: [STAKE] }) { id action tokenIds level timestamp } }"
  }' \
  https://api.studio.thegraph.com/query/960/chapool-nft-staking-stats/v0.0.2
```

---

## 📊 数据统计示例

### 统计用户质押次数

```typescript
const getStakingStats = (activities: StakingActivity[]) => {
  const stats = {
    totalStakes: 0,
    totalUnstakes: 0,
    totalClaims: 0,
    totalNFTsStaked: 0,
    totalNFTsUnstaked: 0,
    totalRewardsCollected: BigInt(0),
  };

  activities.forEach(activity => {
    // ⚠️ 注意：批处理会同时触发单个事件和批处理事件
    // - 统计 NFT 数量：只计算 STAKE/UNSTAKE/CLAIM（避免重复）
    // - 统计操作次数：只计算 BATCH_* 事件
    
    if (activity.action === 'STAKE') {
      stats.totalStakes++;  // 统计每个 NFT 的质押
      stats.totalNFTsStaked += activity.tokenIds.length;  // 通常是 1
    }
    
    if (activity.action === 'UNSTAKE') {
      stats.totalUnstakes++;  // 统计每个 NFT 的取消质押
      stats.totalNFTsUnstaked += activity.tokenIds.length;  // 通常是 1
      if (activity.amount) {
        stats.totalRewardsCollected += BigInt(activity.amount);
      }
    }
    
    if (activity.action === 'CLAIM') {
      stats.totalClaims++;  // 统计每个 NFT 的领取
      if (activity.amount) {
        stats.totalRewardsCollected += BigInt(activity.amount);
      }
    }
  });

  return stats;
};
```

---

## 🎯 常见问题

### Q1: 如何查询特定 NFT 的历史？
**A:** 在查询中添加 `tokenIds_contains` 过滤：
```graphql
where: { 
  user: $userAddress
  tokenIds_contains: ["2175"]
}
```

### Q2: 历史记录会实时更新吗？
**A:** 是的！每次有新的质押/取消质押操作，Subgraph 会自动索引并添加到 `stakingActivities`。

### Q3: 历史记录可以删除吗？
**A:** 不可以。`StakingActivity` 是 `immutable: true`，一旦创建就无法修改或删除，保证了数据的可审计性。

### Q4: 如何导出历史记录？
**A:** 查询所有记录后，在前端导出为 CSV：
```typescript
const exportToCSV = (activities: StakingActivity[]) => {
  const csv = activities.map(a => 
    `${a.action},${a.tokenIds.join(';')},${a.timestamp},${a.transactionHash}`
  ).join('\n');
  
  const blob = new Blob([csv], { type: 'text/csv' });
  // 触发下载...
};
```

---

**完整的质押历史查询已就绪！** 🎉

