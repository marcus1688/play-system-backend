const vip = require("../models/vip.model");
const { User } = require("../models/users.model");

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
}

const userVipCheckpoints = new Map();

// Get VIP requirements - optimized mapping function
async function getVipRequirements() {
  const vipConfig = await vip.findOne();
  return vipConfig.vipLevels
    .map((level) => ({
      level: level.name,
      turnover: parseFloat(level.benefits.get("Turnover Require")) || 0,
    }))
    .sort((a, b) => a.turnover - b.turnover);
}

// Efficient binary search for VIP level
function getVipLevelForTurnover(turnover, requirements) {
  if (turnover < requirements[0].turnover) return "member";

  let left = 0;
  let right = requirements.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (turnover >= requirements[mid].turnover) {
      if (
        mid === requirements.length - 1 ||
        turnover < requirements[mid + 1].turnover
      ) {
        return requirements[mid].level;
      }
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  return "member";
}

// Get next target level without additional processing
function getNextTarget(currentTurnover, requirements) {
  const nextLevel = requirements.find((req) => req.turnover > currentTurnover);
  return (
    nextLevel || {
      level: requirements[requirements.length - 1].level,
      turnover: Infinity,
    }
  );
}

async function updateUserVipLevel(userId, betAmount) {
  // Fetch user and VIP requirements in parallel
  const [user, requirements] = await Promise.all([
    User.findById(userId),
    getVipRequirements(),
  ]);

  if (!user) {
    console.log(`User ${userId} not found`);
    return null;
  }

  const newTotalTurnover = roundToTwoDecimals(user.totalturnover + betAmount);
  const checkpoint = userVipCheckpoints.get(userId);

  // Early return if below target
  if (checkpoint && newTotalTurnover < checkpoint.nextVipTarget) {
    await User.findByIdAndUpdate(userId, {
      $inc: { totalturnover: betAmount },
    });
    return null;
  }

  // Get new level and next target
  const newVipLevel = getVipLevelForTurnover(newTotalTurnover, requirements);
  const nextTarget = getNextTarget(newTotalTurnover, requirements);

  // Single DB update for both VIP level and turnover
  const updatedUser = await User.findByIdAndUpdate(
    userId,
    {
      viplevel: newVipLevel,
      $inc: { totalturnover: betAmount },
    },
    { new: true }
  );

  // Update checkpoint
  userVipCheckpoints.set(userId, {
    lastCheckedTurnover: newTotalTurnover,
    nextVipTarget: nextTarget.turnover,
  });

  return updatedUser;
}

async function initializeUserCheckpoint(userId) {
  const [user, requirements] = await Promise.all([
    User.findById(userId),
    getVipRequirements(),
  ]);

  if (!user) return;

  const nextTarget = getNextTarget(user.totalturnover, requirements);
  userVipCheckpoints.set(userId, {
    lastCheckedTurnover: user.totalturnover,
    nextVipTarget: nextTarget.turnover,
  });
}

async function processBetAndUpdateVip(userId, betAmount) {
  if (!userVipCheckpoints.has(userId)) {
    await initializeUserCheckpoint(userId);
  }
  return await updateUserVipLevel(userId, Number(betAmount));
}

module.exports = {
  processBetAndUpdateVip,
};
