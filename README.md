# NFT Staking Subgraph

这是一个用于追踪 NFT 质押统计数据的 Subgraph 项目，完全基于 [The Graph 集成指南](https://github.com/YourOrg/TheGraph-Integration-Guide.md) 开发。

## 📋 项目信息

- **网络**: Sepolia 测试网
- **合约地址**: `0x51a07dE2Bd277F0E6412452e3B54982Fc32CA6E5`
- **合约名称**: Staking
- **开始区块**: 7500000（⚠️ 需要替换为实际部署区块号）

## 📊 追踪的数据

### 实体类型

#### 1. User - 用户实体
存储用户的总体统计信息：
- 用户地址
- 当前质押总数
- 历史总质押数
- 历史解质押总数
- 历史总收益（wei 和 ETH 格式）
- 首次质押时间
- 最后活动时间

#### 2. UserHourlyStats - 用户小时统计
每小时的用户活动统计，用于绘制小时级别的时间趋势图：
- 该小时的增量数据（质押/解质押/领取收益）
- 该小时结束时的累计数据
- 净质押数（质押 - 解质押）
- 按等级细分的统计

#### 3. UserDailyStats - 用户日统计
每天的汇总数据，用于绘制日级别的时间趋势图（30天、90天范围）

#### 4. UserHourlyLevelStat - 用户小时等级统计
按 NFT 等级细分的统计（C, B, A, S, SS, SSS 对应等级 1-6）

#### 5. StakingActivity - 质押活动记录
每次操作的详细记录，用于审计和详细数据查询

#### 6. GlobalStats - 全局统计
平台总体数据（总用户数、总质押数、总发放收益）

## 🎯 支持的事件

- **NFTStaked** - 单个 NFT 质押
- **NFTUnstaked** - 单个 NFT 取消质押
- **RewardsClaimed** - 领取收益
- **BatchStaked** - 批量质押
- **BatchUnstaked** - 批量取消质押

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 更新配置

在 `subgraph.yaml` 中更新 `startBlock` 为实际的合约部署区块号：

```yaml
source:
  startBlock: 7500000  # ⚠️ 替换为实际值
```

**如何查找部署区块号：**
1. 访问 https://sepolia.etherscan.io/
2. 搜索合约地址：`0x51a07dE2Bd277F0E6412452e3B54982Fc32CA6E5`
3. 在合约页面找到 "Contract Creation" 信息
4. 记录 "Block" 数字

### 3. 生成代码

```bash
npm run codegen
```

这会根据 schema.graphql 和 ABI 生成 TypeScript 类型定义。

### 4. 构建项目

```bash
npm run build
```

### 5. 部署到 The Graph Studio

#### 5.1 创建 Subgraph

1. 访问 https://thegraph.com/studio/
2. 使用钱包（MetaMask）连接并登录
3. 点击 "Create a Subgraph"
4. 输入名称：`nft-staking-stats`
5. 选择网络：`Sepolia`

#### 5.2 认证

从 The Graph Studio 获取 Deploy Key，然后执行：

```bash
graph auth --studio <YOUR_DEPLOY_KEY>
```

#### 5.3 部署

```bash
npm run deploy
```

按提示选择版本标签（例如 v0.0.1）。

### 6. 等待同步

部署成功后，访问 Studio 页面查看同步进度。同步完成后，可以在 Playground 测试查询。

## 📝 查询示例

### 获取用户基本信息

```graphql
{
  user(id: "0x你的地址小写") {
    address
    totalStaked
    totalRewardsClaimedDecimal
    firstStakeTimestamp
    lastActivityTimestamp
  }
}
```

### 获取用户最近24小时数据

```graphql
{
  user(id: "0x你的地址小写") {
    hourlyStats(
      first: 24
      orderBy: hour
      orderDirection: desc
    ) {
      hourStartString
      netStaked
      cumulativeRewards
      rewardsClaimedDecimal
    }
  }
}
```

### 获取用户最近30天数据

```graphql
{
  user(id: "0x你的地址小写") {
    dailyStats(
      first: 30
      orderBy: day
      orderDirection: desc
    ) {
      dayString
      netStaked
      cumulativeRewards
      rewardsClaimedDecimal
    }
  }
}
```

### 获取用户活动历史

```graphql
{
  stakingActivities(
    where: { user: "0x你的地址小写" }
    first: 10
    orderBy: timestamp
    orderDirection: desc
  ) {
    action
    tokenIds
    level
    amount
    timestamp
    transactionHash
  }
}
```

### 获取全局统计

```graphql
{
  globalStats(id: "global") {
    totalUsers
    totalStaked
    totalRewardsPaid
  }
}
```

## 🛠️ 开发指南

### 项目结构

```
nft-staking-subgraph/
├── abis/
│   └── Staking.json          # 合约 ABI
├── src/
│   └── mapping.ts            # 事件处理逻辑
├── schema.graphql            # GraphQL 数据模型
├── subgraph.yaml            # Subgraph 配置
├── package.json             # 项目依赖
└── tsconfig.json            # TypeScript 配置
```

### 修改 Schema

1. 编辑 `schema.graphql`
2. 运行 `npm run codegen` 重新生成类型
3. 更新 `src/mapping.ts` 中的处理逻辑
4. 运行 `npm run build` 构建
5. 重新部署

### 调试技巧

```bash
# 查看详细构建日志
graph build --debug

# 在 mapping.ts 中使用日志
import { log } from "@graphprotocol/graph-ts"
log.info("Debug message: {}", [someValue.toString()])
```

## ⚠️ 注意事项

### 地址格式
- The Graph 会自动将地址转换为小写
- 查询时必须使用小写地址
- 例如：`0xabc...` 而不是 `0xABC...`

### 数据延迟
- The Graph 通常有 1-5 分钟的延迟
- 取决于区块确认时间和同步速度

### 时间序列数据
- `UserHourlyStats.cumulativeRewards`: 累计收益，用于绘制递增的收益曲线
- `UserHourlyStats.netStaked`: 净质押数，用于绘制质押数量曲线
- `BigDecimal` 类型：用于前端直接显示，无需再转换 wei

### StartBlock 设置
- 必须设置为合约部署的区块号
- 如果设置太早，索引会很慢
- 如果设置太晚，会丢失历史数据

## 🐛 常见问题

### Q1: 子图同步很慢怎么办？
**A:** 
- 检查 `startBlock` 是否设置正确
- Studio 的同步速度通常较快，耐心等待
- 可以在 Studio 查看同步进度和日志

### Q2: 查询不到数据？
**A:**
- 确认地址使用小写
- 检查时间范围是否正确
- 在 Playground 先测试查询
- 查看浏览器控制台的网络请求

### Q3: 编译错误？
**A:**
- 运行 `npm run codegen` 重新生成类型
- 检查 schema.graphql 语法是否正确
- 检查 mapping.ts 中的类型引用是否正确

### Q4: 部署失败？
**A:**
- 确认 Deploy Key 是否正确
- 检查网络连接
- 查看终端错误信息

## 📚 参考资源

### 官方文档
- [The Graph 官方文档](https://thegraph.com/docs/)
- [AssemblyScript 文档](https://www.assemblyscript.org/)
- [Graph CLI 文档](https://github.com/graphprotocol/graph-cli)

### 示例项目
- [Uniswap V2 Subgraph](https://github.com/Uniswap/v2-subgraph)
- [Aave Protocol Subgraph](https://github.com/aave/protocol-subgraphs)

### 社区支持
- [The Graph Discord](https://discord.gg/graphprotocol)
- [The Graph Forum](https://forum.thegraph.com/)

## 📄 License

MIT

---

**最后更新**: 2025-10-10
**维护者**: 开发团队
