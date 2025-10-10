# 部署指南

## 📋 前提条件

- ✅ Node.js (v16+) 已安装
- ✅ Graph CLI 已安装（`npm install -g @graphprotocol/graph-cli`）
- ✅ MetaMask 钱包已准备
- ✅ 项目已成功构建（`npm run build`）

## 🚀 部署步骤

### 第一步：创建 Subgraph

1. 访问 The Graph Studio: https://thegraph.com/studio/
2. 连接 MetaMask 钱包
3. 点击 **"Create a Subgraph"**
4. 填写信息：
   - **名称**: `nft-staking-stats`（或您喜欢的名称）
   - **网络**: `Sepolia`
5. 点击创建

### 第二步：更新配置

#### 2.1 更新起始区块号

编辑 `subgraph.yaml` 文件，更新 `startBlock`:

```yaml
source:
  address: "0x51a07dE2Bd277F0E6412452e3B54982Fc32CA6E5"
  abi: Staking
  startBlock: 7500000  # ⚠️ 替换为实际值
```

**如何获取起始区块号：**
1. 访问: https://sepolia.etherscan.io/address/0x51a07dE2Bd277F0E6412452e3B54982Fc32CA6E5
2. 找到 "Contract Creation" 部分
3. 记录区块号

#### 2.2 重新构建（如果修改了配置）

```bash
npm run build
```

### 第三步：认证

从 The Graph Studio 获取您的 **Deploy Key**（在 Subgraph 页面右上角），然后执行：

```bash
graph auth --studio <YOUR_DEPLOY_KEY>
```

**示例：**
```bash
graph auth --studio 1234567890abcdef1234567890abcdef
```

成功后会显示：
```
Deploy key set for https://api.studio.thegraph.com/deploy/
```

### 第四步：部署

```bash
npm run deploy
```

或者直接使用：
```bash
graph deploy --studio nft-staking-stats
```

**部署过程中的提示：**

1. **版本标签**（Version Label）
   ```
   ? Version Label (e.g. v0.0.1) › v0.0.1
   ```
   输入版本号，例如 `v0.0.1`

2. 等待上传和部署完成

### 第五步：验证部署

部署成功后，您会看到类似的输出：

```
✔ Upload subgraph to IPFS

Build completed: QmXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

Deployed to https://thegraph.com/studio/subgraph/nft-staking-stats

Subgraph endpoints:
Queries (HTTP):     https://api.studio.thegraph.com/query/<id>/nft-staking-stats/v0.0.1
```

## 📊 监控同步进度

### 查看同步状态

1. 访问您的 Subgraph 页面
2. 查看 **"Syncing"** 状态
3. 等待同步到 100%

**同步时间说明：**
- 取决于 `startBlock` 的设置和历史数据量
- 通常需要几分钟到几小时
- Sepolia 测试网通常较快

### 在 Playground 测试

同步完成后，在 Studio 的 Playground 中测试查询：

```graphql
{
  globalStats(id: "global") {
    totalUsers
    totalStaked
    totalRewardsPaid
  }
}
```

## 🔄 更新 Subgraph

### 修改后重新部署

1. 修改 schema、mapping 或配置
2. 重新生成代码：`npm run codegen`
3. 重新构建：`npm run build`
4. 增加版本号并部署：
   ```bash
   graph deploy --studio nft-staking-stats
   ```
   输入新版本号，如 `v0.0.2`

## 🐛 常见问题

### Q1: Deploy Key 无效

**错误：**
```
✖ Failed to authenticate: Invalid deploy key
```

**解决方案：**
- 确认从正确的 Subgraph 页面复制了 Deploy Key
- 尝试重新复制 Deploy Key
- 检查是否有多余的空格

### Q2: 合约地址未验证

**错误：**
```
✖ Failed to fetch contract ABI
```

**解决方案：**
- 确认合约地址正确
- 确认合约已在 Etherscan 上验证
- 手动提供 ABI（当前项目已包含）

### Q3: 构建失败

**错误：**
```
✖ Failed to compile subgraph
```

**解决方案：**
1. 运行 `npm run codegen` 重新生成类型
2. 检查 `schema.graphql` 语法
3. 检查 `mapping.ts` 中的代码错误
4. 查看详细错误信息

### Q4: 同步卡住或很慢

**解决方案：**
- 检查 `startBlock` 是否设置合理（不要太早）
- 在 Studio 查看日志，确认没有错误
- 耐心等待，初次同步需要时间

### Q5: 查询返回空数据

**原因：**
- 同步尚未完成
- 链上没有相关事件
- 查询语法错误

**解决方案：**
- 确认同步进度达到 100%
- 在 Playground 测试基本查询
- 检查地址格式（必须小写）

## 📝 部署检查清单

部署前确认：
- [ ] `startBlock` 已更新为正确的区块号
- [ ] 运行 `npm run codegen` 成功
- [ ] 运行 `npm run build` 成功
- [ ] Deploy Key 已正确设置
- [ ] Subgraph 名称与命令中的名称一致

部署后确认：
- [ ] 部署成功，获得了 Subgraph URL
- [ ] 同步进度正常
- [ ] 在 Playground 能查询到数据（同步完成后）
- [ ] GraphQL 端点可访问

## 🎉 部署成功！

部署成功后，您可以：

1. **在前端应用中使用**
   ```typescript
   const SUBGRAPH_URL = 'https://api.studio.thegraph.com/query/<id>/nft-staking-stats/v0.0.1';
   ```

2. **监控和管理**
   - 在 Studio 查看查询分析
   - 监控同步状态
   - 查看日志和错误

3. **发布到去中心化网络**（可选）
   - 从 Studio 发布到 The Graph 去中心化网络
   - 需要添加 GRT 信号

## 📚 相关资源

- [The Graph Studio 文档](https://thegraph.com/docs/en/studio/overview/)
- [部署文档](https://thegraph.com/docs/en/deploying/deploying-a-subgraph-to-studio/)
- [查询文档](https://thegraph.com/docs/en/querying/graphql-api/)

---

**需要帮助？**
- [The Graph Discord](https://discord.gg/graphprotocol)
- [The Graph Forum](https://forum.thegraph.com/)

