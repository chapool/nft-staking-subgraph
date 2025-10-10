# NFT Staking 前端开发指南

这份指南为**没有 The Graph 经验的前端开发者**提供完整的实现方案，帮助您快速集成 NFT Staking 数据可视化功能。

## 📋 目标

绘制两个折线图：
1. **每小时质押数量折线图** - 展示用户质押 NFT 数量随时间的变化
2. **每小时累积收益折线图** - 展示用户累计收益随时间的增长

## 🔗 API 信息

- **GraphQL 端点**: `https://api.studio.thegraph.com/query/960/chapool-nft-staking-stats/v0.0.2`
- **查询方式**: HTTP POST 请求
- **数据格式**: JSON
- **示例用户地址**: `0x01692d53f4392273bd2e11eac510832548957304`

## 📊 第一步：理解 GraphQL 查询

### 1.1 基本查询结构

```graphql
{
  user(id: "用户地址小写") {
    # 用户基本信息
    totalStaked                    # 当前质押数量
    totalRewardsClaimedDecimal     # 已领取的收益（ETH）
    
    # 小时统计数据（用于绘制图表）
    hourlyStats(
      first: 168              # 获取最近 168 小时（7天）
      orderBy: hour           # 按小时排序
      orderDirection: asc     # 升序（从旧到新）
    ) {
      hourStartString         # 小时字符串，如 "2025-10-10T02:00"
      hour                    # 小时时间戳（Unix timestamp）
      netStaked              # 该小时的净质押数
      cumulativeRewards      # 截至该小时的累计收益（wei）
      rewardsClaimedDecimal  # 该小时领取的收益（ETH）
    }
  }
}
```

### 1.2 完整的查询示例

```graphql
query GetUserStakingData($userAddress: ID!, $hoursToFetch: Int!) {
  user(id: $userAddress) {
    id
    address
    totalStaked
    totalStakedAllTime
    totalRewardsClaimedDecimal
    firstStakeTimestamp
    lastActivityTimestamp
    
    # 获取最近 N 小时的数据
    hourlyStats(
      first: $hoursToFetch
      orderBy: hour
      orderDirection: asc
    ) {
      hourStartString
      hour
      stakedCount          # 该小时质押的数量
      unstakedCount        # 该小时取消质押的数量
      netStaked            # 净质押数（质押 - 解质押）
      cumulativeStaked     # 截至该小时的累计质押数
      cumulativeRewards    # 截至该小时的累计收益（wei）
      rewardsClaimedDecimal # 该小时收益（ETH）
    }
  }
}
```

### 1.3 查询变量

```json
{
  "userAddress": "0x01692d53f4392273bd2e11eac510832548957304",
  "hoursToFetch": 168
}
```

## 🚀 第二步：使用 curl 测试查询（命令行测试）

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "query": "{ user(id: \"0x01692d53f4392273bd2e11eac510832548957304\") { totalStaked totalRewardsClaimedDecimal hourlyStats(first: 168, orderBy: hour, orderDirection: asc) { hourStartString netStaked cumulativeRewards } } }"
  }' \
  https://api.studio.thegraph.com/query/960/chapool-nft-staking-stats/v0.0.2
```

**返回示例：**

```json
{
  "data": {
    "user": {
      "totalStaked": "11",
      "totalRewardsClaimedDecimal": "0",
      "hourlyStats": [
        {
          "hourStartString": "2025-10-10T02:00",
          "netStaked": "11",
          "cumulativeRewards": "0"
        }
      ]
    }
  }
}
```

## 💻 第三步：前端实现方案

### 方案 A：使用 React + Apollo Client（推荐）

#### 3.1 安装依赖

```bash
npm install @apollo/client graphql recharts
```

#### 3.2 创建 Apollo Client 配置

```typescript
// src/apollo/client.ts
import { ApolloClient, InMemoryCache } from '@apollo/client';

export const client = new ApolloClient({
  uri: 'https://api.studio.thegraph.com/query/960/chapool-nft-staking-stats/v0.0.2',
  cache: new InMemoryCache(),
});
```

#### 3.3 定义 GraphQL 查询

```typescript
// src/apollo/queries.ts
import { gql } from '@apollo/client';

export const GET_USER_HOURLY_STATS = gql`
  query GetUserHourlyStats($userAddress: ID!, $hoursToFetch: Int!) {
    user(id: $userAddress) {
      id
      totalStaked
      totalRewardsClaimedDecimal
      hourlyStats(
        first: $hoursToFetch
        orderBy: hour
        orderDirection: asc
      ) {
        hourStartString
        hour
        netStaked
        cumulativeRewards
        rewardsClaimedDecimal
      }
    }
  }
`;
```

#### 3.4 创建数据获取 Hook

```typescript
// src/hooks/useStakingData.ts
import { useQuery } from '@apollo/client';
import { GET_USER_HOURLY_STATS } from '../apollo/queries';

interface HourlyStats {
  hourStartString: string;
  hour: string;
  netStaked: string;
  cumulativeRewards: string;
  rewardsClaimedDecimal: string;
}

interface User {
  id: string;
  totalStaked: string;
  totalRewardsClaimedDecimal: string;
  hourlyStats: HourlyStats[];
}

interface StakingData {
  user: User | null;
}

export const useStakingData = (userAddress: string, hours: number = 168) => {
  const { loading, error, data, refetch } = useQuery<StakingData>(
    GET_USER_HOURLY_STATS,
    {
      variables: {
        userAddress: userAddress.toLowerCase(), // 重要：必须转为小写
        hoursToFetch: hours,
      },
      pollInterval: 60000, // 每分钟自动刷新一次
    }
  );

  return {
    loading,
    error,
    user: data?.user,
    refetch,
  };
};
```

#### 3.4.1 创建完整收益数据 Hook（包含 Pending）

⚠️ **重要**：上面的 Hook 只返回 Subgraph 数据（已领取收益）。要获取完整收益（已领取 + Pending），需要额外调用合约：

```typescript
// src/hooks/useCompleteStakingData.ts
import { useEffect, useState } from 'react';
import { useStakingData } from './useStakingData';
import { ethers } from 'ethers';

interface CompleteStakingData {
  user: any;
  claimedRewards: number;      // 已领取收益
  pendingRewards: number;      // 待领取收益（Pending）
  totalRewards: number;        // 总收益 = 已领取 + Pending
  loading: boolean;
  error: any;
}

export const useCompleteStakingData = (
  userAddress: string,
  provider: ethers.providers.Provider,
  stakingContractAddress: string,
  stakingAbi: any[],
  hours: number = 168
): CompleteStakingData => {
  // 1. 从 Subgraph 获取已领取收益
  const { user, loading: subgraphLoading, error } = useStakingData(userAddress, hours);
  
  // 2. 从合约获取 Pending 收益
  const [pendingRewards, setPendingRewards] = useState<number>(0);
  const [contractLoading, setContractLoading] = useState(true);

  useEffect(() => {
    if (!user || !provider) {
      setContractLoading(false);
      return;
    }

    const contract = new ethers.Contract(
      stakingContractAddress,
      stakingAbi,
      provider
    );

    const fetchPendingRewards = async () => {
      try {
        setContractLoading(true);

        // 方法 1: 如果合约有 getUserStakes 函数
        // const userStakes = await contract.getUserStakes(userAddress);
        
        // 方法 2: 从 Subgraph activities 中获取 tokenIds
        const stakedTokenIds = user.activities
          ?.filter((a: any) => a.action === 'STAKE' || a.action === 'BATCH_STAKE')
          .flatMap((a: any) => a.tokenIds)
          .map((id: any) => id.toString()) || [];

        if (stakedTokenIds.length === 0) {
          setPendingRewards(0);
          setContractLoading(false);
          return;
        }

        let totalPending = ethers.BigNumber.from(0);
        
        // 计算每个 token 的 pending rewards
        for (const tokenId of stakedTokenIds) {
          try {
            const pending = await contract.calculatePendingRewards(tokenId);
            totalPending = totalPending.add(pending);
          } catch (err) {
            console.warn(`Failed to fetch pending for token ${tokenId}:`, err);
          }
        }

        const pendingEth = parseFloat(ethers.utils.formatEther(totalPending));
        setPendingRewards(pendingEth);
      } catch (error) {
        console.error('Failed to fetch pending rewards:', error);
        setPendingRewards(0);
      } finally {
        setContractLoading(false);
      }
    };

    fetchPendingRewards();
    
    // 每 10 秒刷新 pending rewards（实时性）
    const interval = setInterval(fetchPendingRewards, 10000);
    
    return () => clearInterval(interval);
  }, [user, userAddress, provider, stakingContractAddress, stakingAbi]);

  const claimedRewards = user 
    ? parseFloat(user.totalRewardsClaimedDecimal) 
    : 0;

  return {
    user,
    claimedRewards,
    pendingRewards,
    totalRewards: claimedRewards + pendingRewards,
    loading: subgraphLoading || contractLoading,
    error,
  };
};
```

#### 3.5 创建图表组件（包含 Pending 收益）

```typescript
// src/components/StakingCharts.tsx
import React, { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useCompleteStakingData } from '../hooks/useCompleteStakingData';
import { ethers } from 'ethers';

interface StakingChartsProps {
  userAddress: string;
  provider: ethers.providers.Provider;
  stakingContractAddress: string;
  stakingAbi: any[];
  hours?: number; // 显示最近多少小时，默认 168（7天）
}

export const StakingCharts: React.FC<StakingChartsProps> = ({ 
  userAddress,
  provider,
  stakingContractAddress,
  stakingAbi,
  hours = 168 
}) => {
  const { 
    user, 
    claimedRewards,
    pendingRewards,
    totalRewards,
    loading, 
    error 
  } = useCompleteStakingData(
    userAddress,
    provider,
    stakingContractAddress,
    stakingAbi,
    hours
  );

  // 转换数据格式供图表使用
  const chartData = useMemo(() => {
    if (!user?.hourlyStats) return [];

    return user.hourlyStats.map((stat: any, index: number, array: any[]) => {
      const claimedRewardsAtHour = parseFloat(
        ethers.utils.formatEther(stat.cumulativeRewards)
      );

      // 最后一个数据点加上当前的 pending rewards
      const isLatest = index === array.length - 1;
      const totalRewardsAtHour = isLatest 
        ? claimedRewardsAtHour + pendingRewards 
        : claimedRewardsAtHour;

      return {
        time: stat.hourStartString,
        质押数量: parseInt(stat.netStaked),
        已领取收益: claimedRewardsAtHour.toFixed(4),
        总收益: totalRewardsAtHour.toFixed(4),
      };
    });
  }, [user, pendingRewards]);

  if (loading) return <div className="loading">⏳ 加载中...</div>;
  if (error) return <div className="error">❌ 加载失败: {error.message}</div>;
  if (!user) return <div className="no-data">⚠️ 未找到用户数据</div>;

  return (
    <div className="staking-charts">
      <h2>用户质押统计</h2>
      
      {/* 用户信息面板 */}
      <div className="user-info">
        <div className="info-item">
          <span className="label">地址:</span>
          <span className="value">{user.id}</span>
        </div>
        <div className="info-item">
          <span className="label">当前质押数量:</span>
          <span className="value">{user.totalStaked} NFT</span>
        </div>
        <div className="info-item">
          <span className="label">已领取收益:</span>
          <span className="value claimed">{claimedRewards.toFixed(4)} ETH</span>
        </div>
        <div className="info-item">
          <span className="label">待领取收益:</span>
          <span className="value pending">{pendingRewards.toFixed(4)} ETH</span>
          <span className="badge">实时</span>
        </div>
        <div className="info-item total">
          <span className="label">总收益:</span>
          <span className="value">{totalRewards.toFixed(4)} ETH</span>
        </div>
      </div>

      {/* 图表 1: 每小时质押数量 */}
      <div className="chart-container">
        <h3>📊 每小时质押数量</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="time" 
              angle={-45}
              textAnchor="end"
              height={80}
              style={{ fontSize: '12px' }}
            />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line 
              type="monotone" 
              dataKey="质押数量" 
              stroke="#8884d8" 
              strokeWidth={2}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 图表 2: 每小时累积收益（包含 Pending） */}
      <div className="chart-container">
        <h3>💰 每小时累积收益 (ETH)</h3>
        <p className="chart-hint">
          实线 = 已领取 | 虚线 = 总收益（含待领取）
        </p>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="time" 
              angle={-45}
              textAnchor="end"
              height={80}
              style={{ fontSize: '12px' }}
            />
            <YAxis />
            <Tooltip />
            <Legend />
            {/* 已领取收益 - 实线 */}
            <Line 
              type="monotone" 
              dataKey="已领取收益" 
              stroke="#82ca9d" 
              strokeWidth={2}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
            {/* 总收益（含 Pending）- 虚线 */}
            <Line 
              type="monotone" 
              dataKey="总收益" 
              stroke="#ff7300" 
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
```

#### 3.6 在主应用中使用

```typescript
// src/App.tsx
import React, { useState } from 'react';
import { ApolloProvider } from '@apollo/client';
import { ethers } from 'ethers';
import { client } from './apollo/client';
import { StakingCharts } from './components/StakingCharts';
import STAKING_ABI from './abis/Staking.json';
import './App.css';

// 合约配置
const STAKING_CONTRACT_ADDRESS = '0x51a07dE2Bd277F0E6412452e3B54982Fc32CA6E5';
const RPC_URL = 'https://sepolia.infura.io/v3/YOUR_INFURA_KEY'; // 替换为您的 RPC

function App() {
  // 示例用户地址
  const [userAddress] = useState('0x01692d53f4392273bd2e11eac510832548957304');
  
  // 创建 provider
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

  return (
    <ApolloProvider client={client}>
      <div className="App">
        <header>
          <h1>🎨 NFT Staking Dashboard</h1>
          <p className="subtitle">实时监控您的质押收益</p>
        </header>
        
        <main>
          <StakingCharts 
            userAddress={userAddress}
            provider={provider}
            stakingContractAddress={STAKING_CONTRACT_ADDRESS}
            stakingAbi={STAKING_ABI}
            hours={168} // 显示最近 7 天
          />
        </main>
      </div>
    </ApolloProvider>
  );
}

export default App;
```

**使用 MetaMask provider（推荐）：**

```typescript
// 如果用户已连接 MetaMask
import { ethers } from 'ethers';

function App() {
  const [userAddress, setUserAddress] = useState('');
  const [provider, setProvider] = useState<ethers.providers.Web3Provider | null>(null);

  useEffect(() => {
    const initProvider = async () => {
      if (window.ethereum) {
        const web3Provider = new ethers.providers.Web3Provider(window.ethereum);
        const accounts = await web3Provider.send('eth_requestAccounts', []);
        setProvider(web3Provider);
        setUserAddress(accounts[0]);
      }
    };
    
    initProvider();
  }, []);

  if (!provider || !userAddress) {
    return <div>请连接钱包...</div>;
  }

  return (
    <ApolloProvider client={client}>
      <div className="App">
        <h1>NFT Staking Dashboard</h1>
        <StakingCharts 
          userAddress={userAddress}
          provider={provider}
          stakingContractAddress={STAKING_CONTRACT_ADDRESS}
          stakingAbi={STAKING_ABI}
          hours={168}
        />
      </div>
    </ApolloProvider>
  );
}
```

#### 3.7 样式文件

```css
/* src/App.css */
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
  background: #f0f2f5;
}

.App {
  min-height: 100vh;
}

header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 40px 20px;
  text-align: center;
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
}

header h1 {
  margin: 0 0 10px 0;
  font-size: 2.5em;
}

header .subtitle {
  margin: 0;
  opacity: 0.9;
  font-size: 1.1em;
}

main {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.staking-charts {
  margin-top: 20px;
}

.staking-charts > h2 {
  font-size: 1.8em;
  margin-bottom: 20px;
  color: #333;
}

/* 用户信息面板 */
.user-info {
  background: white;
  padding: 25px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  margin-bottom: 30px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid #f0f0f0;
}

.info-item:last-child {
  border-bottom: none;
}

.info-item.total {
  padding-top: 15px;
  margin-top: 10px;
  border-top: 2px solid #667eea;
  border-bottom: none;
  font-weight: bold;
  font-size: 1.1em;
}

.info-item .label {
  color: #666;
  font-weight: 500;
}

.info-item .value {
  font-weight: 600;
  font-size: 1.1em;
  color: #333;
}

.info-item .value.claimed {
  color: #82ca9d;
}

.info-item .value.pending {
  color: #ff7300;
}

.badge {
  display: inline-block;
  background: #ff7300;
  color: white;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 0.75em;
  margin-left: 8px;
  font-weight: 500;
}

/* 图表容器 */
.chart-container {
  background: white;
  padding: 25px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  margin-bottom: 30px;
}

.chart-container h3 {
  margin-top: 0;
  margin-bottom: 10px;
  color: #333;
  font-size: 1.4em;
}

.chart-hint {
  color: #666;
  font-size: 0.9em;
  margin: 0 0 15px 0;
  font-style: italic;
}

/* 加载和错误状态 */
.loading, .error, .no-data {
  text-align: center;
  padding: 60px 20px;
  font-size: 1.2em;
}

.loading {
  color: #667eea;
}

.error {
  color: #e53e3e;
}

.no-data {
  color: #f6ad55;
}

/* 响应式设计 */
@media (max-width: 768px) {
  header h1 {
    font-size: 1.8em;
  }
  
  .chart-container {
    padding: 15px;
  }
  
  .info-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 5px;
  }
}
```

---

### 方案 B：使用原生 JavaScript + Fetch API

如果不想使用 React 和 Apollo Client，可以使用原生 JavaScript：

```html
<!DOCTYPE html>
<html>
<head>
    <title>NFT Staking Dashboard</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }
        .chart-container {
            margin-bottom: 40px;
        }
        canvas {
            max-height: 400px;
        }
    </style>
</head>
<body>
    <h1>NFT Staking Dashboard</h1>
    <div id="userInfo"></div>
    
    <div class="chart-container">
        <h2>每小时质押数量</h2>
        <canvas id="stakingChart"></canvas>
    </div>
    
    <div class="chart-container">
        <h2>每小时累积收益 (ETH)</h2>
        <canvas id="rewardsChart"></canvas>
    </div>

    <script>
        const SUBGRAPH_URL = 'https://api.studio.thegraph.com/query/960/chapool-nft-staking-stats/v0.0.2';
        const USER_ADDRESS = '0x01692d53f4392273bd2e11eac510832548957304';

        // GraphQL 查询
        const query = `
          query {
            user(id: "${USER_ADDRESS}") {
              id
              totalStaked
              totalRewardsClaimedDecimal
              hourlyStats(first: 168, orderBy: hour, orderDirection: asc) {
                hourStartString
                netStaked
                cumulativeRewards
              }
            }
          }
        `;

        // 获取数据
        async function fetchStakingData() {
            try {
                const response = await fetch(SUBGRAPH_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ query }),
                });

                const result = await response.json();
                const user = result.data.user;

                if (!user) {
                    document.getElementById('userInfo').innerHTML = '<p>未找到用户数据</p>';
                    return;
                }

                // 显示用户信息
                document.getElementById('userInfo').innerHTML = `
                    <p>地址: ${user.id}</p>
                    <p>当前质押数量: ${user.totalStaked}</p>
                    <p>已领取收益: ${user.totalRewardsClaimedDecimal} ETH</p>
                `;

                // 准备图表数据
                const labels = user.hourlyStats.map(stat => stat.hourStartString);
                const stakingData = user.hourlyStats.map(stat => parseInt(stat.netStaked));
                const rewardsData = user.hourlyStats.map(stat => 
                    parseFloat((BigInt(stat.cumulativeRewards) / BigInt(10 ** 18)).toString())
                );

                // 绘制质押数量图表
                new Chart(document.getElementById('stakingChart'), {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: '质押数量',
                            data: stakingData,
                            borderColor: 'rgb(75, 192, 192)',
                            tension: 0.1
                        }]
                    },
                    options: {
                        responsive: true,
                        plugins: {
                            legend: {
                                display: true
                            }
                        }
                    }
                });

                // 绘制累积收益图表
                new Chart(document.getElementById('rewardsChart'), {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: '累积收益 (ETH)',
                            data: rewardsData,
                            borderColor: 'rgb(255, 99, 132)',
                            tension: 0.1
                        }]
                    },
                    options: {
                        responsive: true,
                        plugins: {
                            legend: {
                                display: true
                            }
                        }
                    }
                });

            } catch (error) {
                console.error('Error fetching data:', error);
                document.getElementById('userInfo').innerHTML = '<p>加载数据失败</p>';
            }
        }

        // 页面加载时获取数据
        fetchStakingData();

        // 每分钟自动刷新
        setInterval(fetchStakingData, 60000);
    </script>
</body>
</html>
```

---

## ⚠️ 重要：Subgraph 限制说明

### Subgraph 只记录已领取的收益

**关键理解：**

The Graph Subgraph 是**事件驱动**的索引服务，只能：
- ✅ 监听链上事件（如 `NFTStaked`, `RewardsClaimed`, `NFTUnstaked`）
- ✅ 记录历史已发生的数据
- ❌ **不能**定时执行任务
- ❌ **不能**主动调用合约的 view 函数
- ❌ **不能**实时计算 Pending 收益

**对您的影响：**

```typescript
// Subgraph 返回的数据
user {
  totalRewardsClaimedDecimal: "0"  // ✅ 已领取的收益
  // ❌ 不包含：正在累积的 Pending 收益
}
```

**Pending 收益只有在以下情况才会进入 Subgraph：**
1. 用户调用 `claimRewards()` 领取收益
2. 用户调用 `unstake()` 取消质押（自动结算收益）

**要显示完整收益（已领取 + Pending），需要组合两个数据源：**
- **Subgraph** → 历史已领取收益
- **合约调用** → 当前 Pending 收益

详细说明请参考：[SUBGRAPH_LIMITATIONS.md](./SUBGRAPH_LIMITATIONS.md)

---

## 🎯 第四步：数据处理关键点

### 4.1 地址格式

⚠️ **重要**：The Graph 会自动将地址转换为小写，查询时必须使用小写：

```javascript
// ✅ 正确
const address = '0x01692d53f4392273bd2e11eac510832548957304';

// ❌ 错误
const address = '0x01692D53F4392273BD2E11EAC510832548957304';

// 转换方法
const lowercaseAddress = userAddress.toLowerCase();
```

### 4.2 Wei 转 ETH

累积收益以 wei 为单位存储，需要转换为 ETH：

```javascript
// 方法 1：使用 BigInt（推荐）
const ethValue = Number(BigInt(weiValue) / BigInt(10 ** 18));

// 方法 2：使用字符串操作
const ethValue = parseFloat(weiValue) / Math.pow(10, 18);

// 方法 3：使用 ethers.js
import { ethers } from 'ethers';
const ethValue = ethers.utils.formatEther(weiValue);
```

### 4.3 时间格式化

```javascript
// hourStartString 格式: "2025-10-10T02:00"
// 可以直接使用，或者格式化：

const formatTime = (hourString) => {
  const date = new Date(hourString);
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};
```

---

## 📱 第五步：响应式设计建议

```typescript
// 添加时间范围选择器
const TimeRangeSelector: React.FC<{ onChange: (hours: number) => void }> = ({ onChange }) => {
  return (
    <div className="time-range-selector">
      <button onClick={() => onChange(24)}>24小时</button>
      <button onClick={() => onChange(168)}>7天</button>
      <button onClick={() => onChange(720)}>30天</button>
    </div>
  );
};
```

---

## 🔧 第六步：错误处理

```typescript
// 完善的错误处理示例
const StakingChartsWithError: React.FC<StakingChartsProps> = ({ userAddress }) => {
  const { loading, error, user } = useStakingData(userAddress);

  if (loading) {
    return (
      <div className="loading">
        <Spinner />
        <p>正在加载数据...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error">
        <p>❌ 加载失败: {error.message}</p>
        <button onClick={() => window.location.reload()}>重试</button>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="no-data">
        <p>⚠️ 该地址还没有质押记录</p>
        <p>请先质押 NFT 后再查看统计数据</p>
      </div>
    );
  }

  if (user.hourlyStats.length === 0) {
    return (
      <div className="no-data">
        <p>暂无小时统计数据</p>
      </div>
    );
  }

  // 正常渲染图表...
};
```

---

## 📚 第七步：完整项目结构

```
nft-staking-frontend/
├── public/
├── src/
│   ├── apollo/
│   │   ├── client.ts           # Apollo Client 配置
│   │   └── queries.ts          # GraphQL 查询定义
│   ├── components/
│   │   ├── StakingCharts.tsx   # 图表组件
│   │   ├── TimeRangeSelector.tsx
│   │   └── LoadingSpinner.tsx
│   ├── hooks/
│   │   └── useStakingData.ts   # 数据获取 Hook
│   ├── utils/
│   │   └── formatters.ts       # 数据格式化工具
│   ├── App.tsx
│   ├── App.css
│   └── index.tsx
├── package.json
└── tsconfig.json
```

---

## 🧪 第八步：测试查询

在浏览器控制台或 Postman 中测试：

```javascript
fetch('https://api.studio.thegraph.com/query/960/chapool-nft-staking-stats/v0.0.2', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    query: `{
      user(id: "0x01692d53f4392273bd2e11eac510832548957304") {
        totalStaked
        hourlyStats(first: 10, orderBy: hour, orderDirection: asc) {
          hourStartString
          netStaked
        }
      }
    }`
  })
})
.then(res => res.json())
.then(data => console.log(data));
```

---

## 💡 常见问题 FAQ

### Q1: 查询返回 null？
**A:** 检查地址是否为小写，The Graph 会自动转换地址为小写。

### Q2: 如何获取实时数据？
**A:** 使用 Apollo Client 的 `pollInterval` 选项，或者手动调用 `refetch()`。

### Q3: 数据单位是什么？
**A:** 
- `netStaked`: 数量（整数）
- `cumulativeRewards`: wei（需要除以 10^18 转换为 ETH）
- `rewardsClaimedDecimal`: 已经转换为 ETH 的字符串

### Q3.1: Subgraph 返回的收益包含 Pending 吗？
**A:** ❌ **不包含！** 这是最常见的误解。

**Subgraph 只记录：**
- ✅ 用户调用 `claimRewards()` 时领取的收益
- ✅ 用户调用 `unstake()` 时自动结算的收益

**Subgraph 不记录：**
- ❌ 正在累积但还没领取的 Pending 收益

**要显示完整收益，必须：**
```typescript
// 1. 从 Subgraph 获取已领取
const claimedRewards = user.totalRewardsClaimedDecimal;

// 2. 从合约获取 Pending
const pendingRewards = await contract.calculatePendingRewards(tokenId);

// 3. 相加得到总收益
const totalRewards = claimedRewards + pendingRewards;
```

详见：[SUBGRAPH_LIMITATIONS.md](./SUBGRAPH_LIMITATIONS.md)

### Q4: 如何显示不同时间范围？
**A:** 修改 `hoursToFetch` 参数：
- 24 小时: `hoursToFetch: 24`
- 7 天: `hoursToFetch: 168`
- 30 天: `hoursToFetch: 720`

### Q5: 图表性能优化？
**A:** 
- 限制数据点数量（不超过 1000 个点）
- 使用虚拟滚动
- 按需加载数据（分页）

---

## 🚀 快速开始模板

克隆这个模板开始：

```bash
npx create-react-app nft-staking-dashboard --template typescript
cd nft-staking-dashboard
npm install @apollo/client graphql recharts
```

然后复制上面的代码文件，运行：

```bash
npm start
```

---

## 📞 需要帮助？

- GitHub Issues: https://github.com/chapool/nft-staking-subgraph/issues
- The Graph 文档: https://thegraph.com/docs/
- Recharts 文档: https://recharts.org/

---

**祝开发顺利！** 🎉

