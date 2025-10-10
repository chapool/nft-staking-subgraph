# The Graph 技术限制说明

## ⚠️ 重要：Subgraph 和 Substreams 都无法定时读取链上数据

### The Graph 的工作原理

The Graph 的所有产品（Subgraph、Substreams）都是**事件驱动**的索引服务，只能：
- ✅ 监听和处理链上**事件（Events）**
- ✅ 在事件发生时**被动响应**
- ✅ 处理区块和交易数据
- ❌ **不能**定时执行任务
- ❌ **不能**主动调用合约的 view 函数（如 `calculatePendingRewards()`）
- ❌ **不能**实时计算 Pending 数据

### 📊 Subgraph vs Substreams

虽然 **Substreams** 被描述为"实时和历史数据流"技术，但它在处理 Pending Rewards 时面临**同样的限制**：

| 特性 | Subgraph | Substreams | 能解决 Pending？ |
|------|----------|------------|-----------------|
| **索引速度** | 中等 | ⚡ 更快 | ❌ |
| **并行处理** | 有限 | ✅ 强大 | ❌ |
| **编程语言** | AssemblyScript | Rust | - |
| **实时性** | 秒级延迟 | 毫秒级延迟 | ❌ |
| **数据源** | 事件日志 | 事件 + 区块 + 交易 | ❌ |
| **调用 view 函数** | ❌ 不能 | ❌ 不能 | ❌ |
| **定时轮询** | ❌ 不能 | ❌ 不能 | ❌ |

**结论：** Substreams 虽然更快更强大，但它仍然是**被动索引**，只能处理已发生的链上事件，无法"主动查询"或"定时计算"实时状态。

### 🔍 为什么 Substreams 也不能解决？

```
Pending Rewards 的本质问题：
┌──────────────────────────────────────┐
│ 用户质押 NFT                          │ ← 有事件 ✅
│   ↓                                   │
│ 每秒收益增长（无事件）❌              │ ← 无事件 ❌
│   ↓                                   │
│ 用户领取收益                          │ ← 有事件 ✅
└──────────────────────────────────────┘

Substreams 能做的：
✅ 快速索引 "质押事件"
✅ 快速索引 "领取事件"

Substreams 不能做的：
❌ 在两个事件之间，自动计算每秒的收益增长
❌ 因为中间没有任何链上事件可供索引
```

### 对本项目的影响

#### 当前 Subgraph 记录的数据：

```graphql
user {
  totalStaked: "11"                    # ✅ 当前质押数（实时更新）
  totalRewardsClaimedDecimal: "0"     # ✅ 已领取收益（实时更新）
  # ❌ 无法记录：正在累积的 Pending 收益
}
```

**说明：**
- **已领取收益** (`totalRewardsClaimed`) - ✅ 实时准确
  - 当用户调用 `claimRewards()` 时更新
  - 当用户调用 `unstake()` 时更新（自动结算）
  
- **Pending 收益** - ❌ 无法自动记录
  - Subgraph 无法定时调用 `calculatePendingRewards()`
  - 需要前端或后端服务实时计算

## 💡 解决方案

### 方案 1：前端实时计算（推荐 ⭐）

前端组合 Subgraph 数据 + 合约调用：

```typescript
// hooks/useCompleteStakingData.ts
import { useEffect, useState } from 'react';
import { useStakingData } from './useStakingData';
import { ethers } from 'ethers';

interface CompleteStakingData {
  claimedRewards: number;      // 已领取
  pendingRewards: number;      // 待领取
  totalRewards: number;        // 总收益
  loading: boolean;
}

export const useCompleteStakingData = (
  userAddress: string,
  provider: ethers.providers.Provider,
  stakingContractAddress: string,
  stakingAbi: any[]
): CompleteStakingData => {
  // 1. 从 Subgraph 获取已领取收益
  const { user, loading: subgraphLoading } = useStakingData(userAddress);
  
  // 2. 从合约获取 Pending 收益
  const [pendingRewards, setPendingRewards] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !provider) return;

    const contract = new ethers.Contract(
      stakingContractAddress,
      stakingAbi,
      provider
    );

    const fetchPendingRewards = async () => {
      try {
        // 获取用户质押的所有 tokenIds
        const userStakes = user.activities
          .filter(a => a.action === 'STAKE')
          .map(a => a.tokenIds)
          .flat();

        let totalPending = ethers.BigNumber.from(0);
        
        // 计算每个 token 的 pending rewards
        for (const tokenId of userStakes) {
          const pending = await contract.calculatePendingRewards(tokenId);
          totalPending = totalPending.add(pending);
        }

        const pendingEth = parseFloat(ethers.utils.formatEther(totalPending));
        setPendingRewards(pendingEth);
      } catch (error) {
        console.error('Failed to fetch pending rewards:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPendingRewards();
    
    // 每 10 秒刷新 pending rewards
    const interval = setInterval(fetchPendingRewards, 10000);
    
    return () => clearInterval(interval);
  }, [user, userAddress, provider, stakingContractAddress, stakingAbi]);

  const claimedRewards = user 
    ? parseFloat(user.totalRewardsClaimedDecimal) 
    : 0;

  return {
    claimedRewards,
    pendingRewards,
    totalRewards: claimedRewards + pendingRewards,
    loading: subgraphLoading || loading,
  };
};
```

**使用示例：**

```typescript
// components/RewardsDisplay.tsx
import React from 'react';
import { useCompleteStakingData } from '../hooks/useCompleteStakingData';

export const RewardsDisplay: React.FC<{ userAddress: string }> = ({ 
  userAddress 
}) => {
  const { claimedRewards, pendingRewards, totalRewards, loading } = 
    useCompleteStakingData(
      userAddress,
      provider,
      STAKING_CONTRACT_ADDRESS,
      STAKING_ABI
    );

  if (loading) return <div>Loading...</div>;

  return (
    <div className="rewards-display">
      <h3>收益统计</h3>
      <div className="reward-item">
        <span>已领取收益:</span>
        <span>{claimedRewards.toFixed(4)} ETH</span>
      </div>
      <div className="reward-item">
        <span>待领取收益:</span>
        <span className="pending">{pendingRewards.toFixed(4)} ETH</span>
      </div>
      <div className="reward-item total">
        <span>总收益:</span>
        <span>{totalRewards.toFixed(4)} ETH</span>
      </div>
    </div>
  );
};
```

### 方案 2：图表中显示两条线

在时间序列图表中同时显示历史和实时数据：

```typescript
// components/RewardsChart.tsx
import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

export const RewardsChart: React.FC = ({ user, pendingRewards }) => {
  const chartData = useMemo(() => {
    if (!user?.hourlyStats) return [];

    return user.hourlyStats.map((stat, index, array) => {
      const claimedRewards = parseFloat(
        ethers.utils.formatEther(stat.cumulativeRewards)
      );

      // 最后一个数据点加上当前的 pending
      const isLatest = index === array.length - 1;
      const totalRewards = isLatest 
        ? claimedRewards + pendingRewards 
        : claimedRewards;

      return {
        time: stat.hourStartString,
        已领取: claimedRewards,
        总收益: totalRewards,
      };
    });
  }, [user, pendingRewards]);

  return (
    <LineChart width={800} height={400} data={chartData}>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey="time" />
      <YAxis />
      <Tooltip />
      <Legend />
      <Line 
        type="monotone" 
        dataKey="已领取" 
        stroke="#8884d8" 
        strokeWidth={2}
      />
      <Line 
        type="monotone" 
        dataKey="总收益" 
        stroke="#82ca9d" 
        strokeWidth={2}
        strokeDasharray="5 5"  // 虚线表示包含预估的 pending
      />
    </LineChart>
  );
};
```

### 方案 3：后端缓存服务（可选）

如果不想让前端频繁调用合约，可以创建后端服务：

```typescript
// backend/server.ts
import express from 'express';
import { ethers } from 'ethers';
import NodeCache from 'node-cache';

const app = express();
const cache = new NodeCache({ stdTTL: 60 }); // 缓存 60 秒

const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
const stakingContract = new ethers.Contract(
  STAKING_ADDRESS,
  STAKING_ABI,
  provider
);

// API: 获取用户的 pending rewards
app.get('/api/pending-rewards/:address', async (req, res) => {
  const address = req.params.address.toLowerCase();
  
  // 先查缓存
  const cached = cache.get(address);
  if (cached) {
    return res.json({ pendingRewards: cached });
  }

  try {
    // 从合约获取
    const userStakes = await stakingContract.getUserStakes(address);
    let totalPending = ethers.BigNumber.from(0);

    for (const tokenId of userStakes) {
      const pending = await stakingContract.calculatePendingRewards(tokenId);
      totalPending = totalPending.add(pending);
    }

    const pendingEth = parseFloat(ethers.utils.formatEther(totalPending));
    
    // 存入缓存
    cache.set(address, pendingEth);
    
    res.json({ pendingRewards: pendingEth });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch pending rewards' });
  }
});

app.listen(3001);
```

前端调用：

```typescript
const fetchPendingRewards = async (address: string) => {
  const response = await fetch(`/api/pending-rewards/${address}`);
  const data = await response.json();
  return data.pendingRewards;
};
```

### 方案 4：合约层面改造（需要重新部署）

如果可以修改合约，添加定期快照功能：

```solidity
// 在 Staking.sol 中添加
event RewardsSnapshot(
    address indexed user,
    uint256 pendingRewards,
    uint256 timestamp
);

// 任何人都可以触发快照（可以由 Chainlink Automation 调用）
function snapshotUserRewards(address user) external {
    uint256[] memory tokenIds = userStakes[user];
    uint256 totalPending = 0;
    
    for (uint256 i = 0; i < tokenIds.length; i++) {
        totalPending += _calculatePendingRewards(tokenIds[i]);
    }
    
    emit RewardsSnapshot(user, totalPending, block.timestamp);
}
```

然后配置 Chainlink Automation 每小时调用一次，Subgraph 就能索引这些快照。

## 📊 方案对比

| 方案 | 实时性 | 历史数据 | 复杂度 | 成本 | 推荐度 |
|------|--------|----------|--------|------|--------|
| **前端计算** | ⭐⭐⭐⭐⭐ | ❌ | 低 | 低 | ⭐⭐⭐⭐⭐ |
| **后端缓存** | ⭐⭐⭐⭐ | ❌ | 中 | 中 | ⭐⭐⭐ |
| **合约改造** | ⭐⭐⭐ | ✅ | 高 | 高 | ⭐⭐ |

## 🎯 推荐实现

**对于大多数场景，推荐使用「方案 1：前端实时计算」**

### 优势：
1. ✅ 无需修改合约
2. ✅ 无需额外服务器
3. ✅ 实时性最好（10秒刷新）
4. ✅ 实现简单
5. ✅ 成本最低

### 权衡：
- ❌ 不记录历史 pending 数据
- 但这通常不是问题，因为：
  - Pending 只是临时状态
  - 真正重要的是 claimed（已记录在 Subgraph）
  - 用户关心的是"现在能领多少"，而不是"过去某时刻 pending 是多少"

## 📝 数据流程图

```
┌─────────────┐
│   合约事件   │  ──> Subgraph ──> 历史已领取收益
│  (Claimed)  │
└─────────────┘

┌─────────────┐
│  合约状态    │  ──> 前端查询 ──> 当前 Pending 收益
│  (Pending)  │
└─────────────┘

         ↓
    前端组合显示
         ↓
   总收益 = 已领取 + Pending
```

## 💡 最佳实践

```typescript
// 完整的实现示例
const StakingDashboard: React.FC = ({ userAddress }) => {
  // 1. Subgraph 数据（历史、已领取）
  const { user, loading: subgraphLoading } = useStakingData(userAddress);
  
  // 2. 合约数据（实时、Pending）
  const [pendingRewards, setPendingRewards] = useState(0);
  
  useEffect(() => {
    // 定期刷新 pending
    const fetchPending = async () => {
      const contract = new ethers.Contract(/* ... */);
      // ... 计算 pending
      setPendingRewards(total);
    };
    
    fetchPending();
    const interval = setInterval(fetchPending, 10000); // 10秒
    return () => clearInterval(interval);
  }, [user]);
  
  // 3. 组合显示
  const totalRewards = 
    parseFloat(user?.totalRewardsClaimedDecimal || '0') + pendingRewards;
  
  return (
    <div>
      <div>已领取: {user?.totalRewardsClaimedDecimal} ETH</div>
      <div>待领取: {pendingRewards.toFixed(4)} ETH</div>
      <div>总收益: {totalRewards.toFixed(4)} ETH</div>
    </div>
  );
};
```

## ❓ 常见问题

### Q: 为什么不能让 Subgraph 定时读取？
**A:** The Graph 设计为去中心化的事件索引器，不支持主动轮询。这是架构设计决定的，无法改变。

### Q: 前端频繁调用合约会很慢吗？
**A:** 只读操作（view 函数）不需要 gas，速度很快。10秒刷新一次不会有性能问题。

### Q: 能不能只刷新一次？
**A:** 可以，但用户看到的数据会过时。10秒刷新是平衡了实时性和性能的好选择。

### Q: 如果合约调用失败怎么办？
**A:** 前端应该优雅降级，显示上次成功的数据，并提示"数据可能不是最新的"。

---

**总结：Subgraph 只记录"历史已发生的事"，不能预测"未来会发生的事"。Pending 收益需要实时计算。** 🎯

