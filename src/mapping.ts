import { BigInt, BigDecimal, Bytes, log } from "@graphprotocol/graph-ts"
import {
  NFTStaked,
  NFTUnstaked,
  RewardsClaimed,
  BatchStaked,
  BatchUnstaked
} from "../generated/Staking/Staking"
import { 
  User, 
  UserHourlyStats,
  UserHourlyLevelStat,
  UserDailyStats,
  StakingActivity,
  GlobalStats
} from "../generated/schema"

// ============================================
// CONSTANTS
// ============================================

const ZERO = BigInt.fromI32(0)
const ONE = BigInt.fromI32(1)
const HOUR_IN_SECONDS = BigInt.fromI32(3600)
const DAY_IN_SECONDS = BigInt.fromI32(86400)
const WEI_TO_ETH_DIVISOR = BigInt.fromI32(10).pow(18)

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * 将时间戳对齐到小时
 */
function getHourTimestamp(timestamp: BigInt): BigInt {
  return timestamp.div(HOUR_IN_SECONDS).times(HOUR_IN_SECONDS)
}

/**
 * 将时间戳对齐到天
 */
function getDayTimestamp(timestamp: BigInt): BigInt {
  return timestamp.div(DAY_IN_SECONDS).times(DAY_IN_SECONDS)
}

/**
 * 将 Wei 转换为 BigDecimal（ETH）
 */
function weiToDecimal(wei: BigInt): BigDecimal {
  return wei.toBigDecimal().div(WEI_TO_ETH_DIVISOR.toBigDecimal())
}

/**
 * 格式化小时字符串
 */
function formatHourString(timestamp: BigInt): string {
  // 简化版：只返回时间戳字符串
  // 实际项目中可以使用更复杂的日期格式化
  const date = new Date(timestamp.toI64() * 1000)
  return date.toISOString().slice(0, 13) + ":00"
}

/**
 * 格式化天字符串
 */
function formatDayString(timestamp: BigInt): string {
  const date = new Date(timestamp.toI64() * 1000)
  return date.toISOString().slice(0, 10)
}

/**
 * 获取或创建用户
 */
function getOrCreateUser(address: Bytes, timestamp: BigInt): User {
  const userId = address.toHexString().toLowerCase()
  let user = User.load(userId)
  
  if (user == null) {
    user = new User(userId)
    user.address = address
    user.totalStaked = ZERO
    user.totalStakedAllTime = ZERO
    user.totalUnstaked = ZERO
    user.totalRewardsClaimed = ZERO
    user.totalRewardsClaimedDecimal = BigDecimal.fromString("0")
    user.firstStakeTimestamp = timestamp
    user.lastActivityTimestamp = timestamp
    user.save()
    
    // 更新全局统计
    const stats = getOrCreateGlobalStats()
    stats.totalUsers = stats.totalUsers.plus(ONE)
    stats.save()
  }
  
  return user
}

/**
 * 获取或创建用户小时统计
 */
function getOrCreateHourlyStats(
  userAddress: Bytes, 
  timestamp: BigInt,
  user: User
): UserHourlyStats {
  const hourTimestamp = getHourTimestamp(timestamp)
  const id = userAddress.toHexString().toLowerCase() + "-" + hourTimestamp.toString()
  
  let stats = UserHourlyStats.load(id)
  
  if (stats == null) {
    stats = new UserHourlyStats(id)
    stats.user = user.id
    stats.hour = hourTimestamp
    stats.hourStartString = formatHourString(hourTimestamp)
    
    // 增量数据初始化为0
    stats.stakedCount = ZERO
    stats.unstakedCount = ZERO
    stats.rewardsClaimed = ZERO
    stats.rewardsClaimedDecimal = BigDecimal.fromString("0")
    
    // 累计数据使用当前用户的累计值
    stats.cumulativeStaked = user.totalStakedAllTime
    stats.cumulativeUnstaked = user.totalUnstaked
    stats.cumulativeRewards = user.totalRewardsClaimed
    stats.netStaked = user.totalStaked
    
    stats.save()
  }
  
  return stats
}

/**
 * 获取或创建用户小时等级统计
 */
function getOrCreateHourlyLevelStat(
  hourlyStats: UserHourlyStats,
  level: i32
): UserHourlyLevelStat {
  const id = hourlyStats.id + "-" + level.toString()
  
  let stat = UserHourlyLevelStat.load(id)
  
  if (stat == null) {
    stat = new UserHourlyLevelStat(id)
    stat.hourlyStats = hourlyStats.id
    stat.level = level
    stat.stakedCount = ZERO
    stat.unstakedCount = ZERO
    stat.currentStaked = ZERO
    stat.save()
  }
  
  return stat
}

/**
 * 获取或创建用户日统计
 */
function getOrCreateDailyStats(
  userAddress: Bytes,
  timestamp: BigInt,
  user: User
): UserDailyStats {
  const dayTimestamp = getDayTimestamp(timestamp)
  const id = userAddress.toHexString().toLowerCase() + "-" + dayTimestamp.toString()
  
  let stats = UserDailyStats.load(id)
  
  if (stats == null) {
    stats = new UserDailyStats(id)
    stats.user = user.id
    stats.day = dayTimestamp
    stats.dayString = formatDayString(dayTimestamp)
    
    // 增量数据初始化为0
    stats.stakedCount = ZERO
    stats.unstakedCount = ZERO
    stats.rewardsClaimed = ZERO
    stats.rewardsClaimedDecimal = BigDecimal.fromString("0")
    
    // 累计数据使用当前用户的累计值
    stats.cumulativeStaked = user.totalStakedAllTime
    stats.cumulativeUnstaked = user.totalUnstaked
    stats.cumulativeRewards = user.totalRewardsClaimed
    stats.netStaked = user.totalStaked
    
    stats.save()
  }
  
  return stats
}

/**
 * 获取或创建全局统计
 */
function getOrCreateGlobalStats(): GlobalStats {
  let stats = GlobalStats.load("global")
  
  if (stats == null) {
    stats = new GlobalStats("global")
    stats.totalUsers = ZERO
    stats.totalStaked = ZERO
    stats.totalRewardsPaid = ZERO
    stats.save()
  }
  
  return stats
}

/**
 * 更新小时和日统计的累计值
 */
function updateCumulativeStats(
  user: User,
  hourlyStats: UserHourlyStats,
  dailyStats: UserDailyStats
): void {
  // 更新小时统计的累计值
  hourlyStats.cumulativeStaked = user.totalStakedAllTime
  hourlyStats.cumulativeUnstaked = user.totalUnstaked
  hourlyStats.cumulativeRewards = user.totalRewardsClaimed
  hourlyStats.netStaked = user.totalStaked
  hourlyStats.save()
  
  // 更新日统计的累计值
  dailyStats.cumulativeStaked = user.totalStakedAllTime
  dailyStats.cumulativeUnstaked = user.totalUnstaked
  dailyStats.cumulativeRewards = user.totalRewardsClaimed
  dailyStats.netStaked = user.totalStaked
  dailyStats.save()
}

// ============================================
// EVENT HANDLERS
// ============================================

/**
 * 处理 NFT 质押事件
 */
export function handleNFTStaked(event: NFTStaked): void {
  // 1. 更新用户总体数据
  const user = getOrCreateUser(event.params.user, event.block.timestamp)
  user.totalStaked = user.totalStaked.plus(ONE)
  user.totalStakedAllTime = user.totalStakedAllTime.plus(ONE)
  user.lastActivityTimestamp = event.block.timestamp
  user.save()
  
  // 2. 更新小时统计
  const hourlyStats = getOrCreateHourlyStats(
    event.params.user,
    event.block.timestamp,
    user
  )
  hourlyStats.stakedCount = hourlyStats.stakedCount.plus(ONE)
  hourlyStats.save()
  
  // 3. 更新日统计
  const dailyStats = getOrCreateDailyStats(
    event.params.user,
    event.block.timestamp,
    user
  )
  dailyStats.stakedCount = dailyStats.stakedCount.plus(ONE)
  dailyStats.save()
  
  // 4. 更新累计值
  updateCumulativeStats(user, hourlyStats, dailyStats)
  
  // 5. 更新小时等级统计
  const levelStat = getOrCreateHourlyLevelStat(hourlyStats, event.params.level)
  levelStat.stakedCount = levelStat.stakedCount.plus(ONE)
  levelStat.currentStaked = levelStat.currentStaked.plus(ONE)
  levelStat.save()
  
  // 6. 创建活动记录
  const activityId = event.transaction.hash.toHex() + "-" + event.logIndex.toString()
  const activity = new StakingActivity(activityId)
  activity.user = user.id
  activity.action = "STAKE"
  activity.tokenIds = [event.params.tokenId]
  activity.level = event.params.level
  activity.amount = null
  activity.timestamp = event.block.timestamp
  activity.blockNumber = event.block.number
  activity.transactionHash = event.transaction.hash
  activity.save()
  
  // 7. 更新全局统计
  const globalStats = getOrCreateGlobalStats()
  globalStats.totalStaked = globalStats.totalStaked.plus(ONE)
  globalStats.save()
  
  log.info("NFT Staked: user={}, tokenId={}, level={}", [
    event.params.user.toHexString(),
    event.params.tokenId.toString(),
    event.params.level.toString()
  ])
}

/**
 * 处理 NFT 取消质押事件
 */
export function handleNFTUnstaked(event: NFTUnstaked): void {
  // 1. 更新用户总体数据
  const user = getOrCreateUser(event.params.user, event.block.timestamp)
  user.totalStaked = user.totalStaked.minus(ONE)
  user.totalUnstaked = user.totalUnstaked.plus(ONE)
  user.totalRewardsClaimed = user.totalRewardsClaimed.plus(event.params.rewards)
  user.totalRewardsClaimedDecimal = weiToDecimal(user.totalRewardsClaimed)
  user.lastActivityTimestamp = event.block.timestamp
  user.save()
  
  // 2. 更新小时统计
  const hourlyStats = getOrCreateHourlyStats(
    event.params.user,
    event.block.timestamp,
    user
  )
  hourlyStats.unstakedCount = hourlyStats.unstakedCount.plus(ONE)
  hourlyStats.rewardsClaimed = hourlyStats.rewardsClaimed.plus(event.params.rewards)
  hourlyStats.rewardsClaimedDecimal = weiToDecimal(hourlyStats.rewardsClaimed)
  hourlyStats.save()
  
  // 3. 更新日统计
  const dailyStats = getOrCreateDailyStats(
    event.params.user,
    event.block.timestamp,
    user
  )
  dailyStats.unstakedCount = dailyStats.unstakedCount.plus(ONE)
  dailyStats.rewardsClaimed = dailyStats.rewardsClaimed.plus(event.params.rewards)
  dailyStats.rewardsClaimedDecimal = weiToDecimal(dailyStats.rewardsClaimed)
  dailyStats.save()
  
  // 4. 更新累计值
  updateCumulativeStats(user, hourlyStats, dailyStats)
  
  // 5. 创建活动记录
  const activityId = event.transaction.hash.toHex() + "-" + event.logIndex.toString()
  const activity = new StakingActivity(activityId)
  activity.user = user.id
  activity.action = "UNSTAKE"
  activity.tokenIds = [event.params.tokenId]
  activity.level = null
  activity.amount = event.params.rewards
  activity.timestamp = event.block.timestamp
  activity.blockNumber = event.block.number
  activity.transactionHash = event.transaction.hash
  activity.save()
  
  // 6. 更新全局统计
  const globalStats = getOrCreateGlobalStats()
  globalStats.totalRewardsPaid = globalStats.totalRewardsPaid.plus(event.params.rewards)
  globalStats.save()
  
  log.info("NFT Unstaked: user={}, tokenId={}, rewards={}", [
    event.params.user.toHexString(),
    event.params.tokenId.toString(),
    event.params.rewards.toString()
  ])
}

/**
 * 处理收益领取事件
 */
export function handleRewardsClaimed(event: RewardsClaimed): void {
  // 1. 更新用户总体数据
  const user = getOrCreateUser(event.params.user, event.block.timestamp)
  user.totalRewardsClaimed = user.totalRewardsClaimed.plus(event.params.amount)
  user.totalRewardsClaimedDecimal = weiToDecimal(user.totalRewardsClaimed)
  user.lastActivityTimestamp = event.block.timestamp
  user.save()
  
  // 2. 更新小时统计
  const hourlyStats = getOrCreateHourlyStats(
    event.params.user,
    event.block.timestamp,
    user
  )
  hourlyStats.rewardsClaimed = hourlyStats.rewardsClaimed.plus(event.params.amount)
  hourlyStats.rewardsClaimedDecimal = weiToDecimal(hourlyStats.rewardsClaimed)
  hourlyStats.save()
  
  // 3. 更新日统计
  const dailyStats = getOrCreateDailyStats(
    event.params.user,
    event.block.timestamp,
    user
  )
  dailyStats.rewardsClaimed = dailyStats.rewardsClaimed.plus(event.params.amount)
  dailyStats.rewardsClaimedDecimal = weiToDecimal(dailyStats.rewardsClaimed)
  dailyStats.save()
  
  // 4. 更新累计值
  updateCumulativeStats(user, hourlyStats, dailyStats)
  
  // 5. 创建活动记录
  const activityId = event.transaction.hash.toHex() + "-" + event.logIndex.toString()
  const activity = new StakingActivity(activityId)
  activity.user = user.id
  activity.action = "CLAIM"
  activity.tokenIds = [event.params.tokenId]
  activity.level = null
  activity.amount = event.params.amount
  activity.timestamp = event.block.timestamp
  activity.blockNumber = event.block.number
  activity.transactionHash = event.transaction.hash
  activity.save()
  
  // 6. 更新全局统计
  const globalStats = getOrCreateGlobalStats()
  globalStats.totalRewardsPaid = globalStats.totalRewardsPaid.plus(event.params.amount)
  globalStats.save()
  
  log.info("Rewards Claimed: user={}, tokenId={}, amount={}", [
    event.params.user.toHexString(),
    event.params.tokenId.toString(),
    event.params.amount.toString()
  ])
}

/**
 * 处理批量质押事件
 */
export function handleBatchStaked(event: BatchStaked): void {
  const tokenCount = event.params.tokenIds.length
  
  // 1. 更新用户总体数据
  const user = getOrCreateUser(event.params.user, event.block.timestamp)
  user.totalStaked = user.totalStaked.plus(BigInt.fromI32(tokenCount))
  user.totalStakedAllTime = user.totalStakedAllTime.plus(BigInt.fromI32(tokenCount))
  user.lastActivityTimestamp = event.block.timestamp
  user.save()
  
  // 2. 更新小时统计
  const hourlyStats = getOrCreateHourlyStats(
    event.params.user,
    event.block.timestamp,
    user
  )
  hourlyStats.stakedCount = hourlyStats.stakedCount.plus(BigInt.fromI32(tokenCount))
  hourlyStats.save()
  
  // 3. 更新日统计
  const dailyStats = getOrCreateDailyStats(
    event.params.user,
    event.block.timestamp,
    user
  )
  dailyStats.stakedCount = dailyStats.stakedCount.plus(BigInt.fromI32(tokenCount))
  dailyStats.save()
  
  // 4. 更新累计值
  updateCumulativeStats(user, hourlyStats, dailyStats)
  
  // 5. 创建活动记录
  const activityId = event.transaction.hash.toHex() + "-" + event.logIndex.toString()
  const activity = new StakingActivity(activityId)
  activity.user = user.id
  activity.action = "BATCH_STAKE"
  activity.tokenIds = event.params.tokenIds
  activity.level = null
  activity.amount = null
  activity.timestamp = event.block.timestamp
  activity.blockNumber = event.block.number
  activity.transactionHash = event.transaction.hash
  activity.save()
  
  // 6. 更新全局统计
  const globalStats = getOrCreateGlobalStats()
  globalStats.totalStaked = globalStats.totalStaked.plus(BigInt.fromI32(tokenCount))
  globalStats.save()
  
  log.info("Batch Staked: user={}, count={}", [
    event.params.user.toHexString(),
    tokenCount.toString()
  ])
}

/**
 * 处理批量取消质押事件
 */
export function handleBatchUnstaked(event: BatchUnstaked): void {
  const tokenCount = event.params.tokenIds.length
  
  // 1. 更新用户总体数据
  const user = getOrCreateUser(event.params.user, event.block.timestamp)
  user.totalStaked = user.totalStaked.minus(BigInt.fromI32(tokenCount))
  user.totalUnstaked = user.totalUnstaked.plus(BigInt.fromI32(tokenCount))
  user.totalRewardsClaimed = user.totalRewardsClaimed.plus(event.params.totalRewards)
  user.totalRewardsClaimedDecimal = weiToDecimal(user.totalRewardsClaimed)
  user.lastActivityTimestamp = event.block.timestamp
  user.save()
  
  // 2. 更新小时统计
  const hourlyStats = getOrCreateHourlyStats(
    event.params.user,
    event.block.timestamp,
    user
  )
  hourlyStats.unstakedCount = hourlyStats.unstakedCount.plus(BigInt.fromI32(tokenCount))
  hourlyStats.rewardsClaimed = hourlyStats.rewardsClaimed.plus(event.params.totalRewards)
  hourlyStats.rewardsClaimedDecimal = weiToDecimal(hourlyStats.rewardsClaimed)
  hourlyStats.save()
  
  // 3. 更新日统计
  const dailyStats = getOrCreateDailyStats(
    event.params.user,
    event.block.timestamp,
    user
  )
  dailyStats.unstakedCount = dailyStats.unstakedCount.plus(BigInt.fromI32(tokenCount))
  dailyStats.rewardsClaimed = dailyStats.rewardsClaimed.plus(event.params.totalRewards)
  dailyStats.rewardsClaimedDecimal = weiToDecimal(dailyStats.rewardsClaimed)
  dailyStats.save()
  
  // 4. 更新累计值
  updateCumulativeStats(user, hourlyStats, dailyStats)
  
  // 5. 创建活动记录
  const activityId = event.transaction.hash.toHex() + "-" + event.logIndex.toString()
  const activity = new StakingActivity(activityId)
  activity.user = user.id
  activity.action = "BATCH_UNSTAKE"
  activity.tokenIds = event.params.tokenIds
  activity.level = null
  activity.amount = event.params.totalRewards
  activity.timestamp = event.block.timestamp
  activity.blockNumber = event.block.number
  activity.transactionHash = event.transaction.hash
  activity.save()
  
  // 6. 更新全局统计
  const globalStats = getOrCreateGlobalStats()
  globalStats.totalRewardsPaid = globalStats.totalRewardsPaid.plus(event.params.totalRewards)
  globalStats.save()
  
  log.info("Batch Unstaked: user={}, count={}, rewards={}", [
    event.params.user.toHexString(),
    tokenCount.toString(),
    event.params.totalRewards.toString()
  ])
}

