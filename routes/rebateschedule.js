const express = require("express");
const router = express.Router();
const schedule = require("node-schedule");
const RebateSchedule = require("../models/rebateSchedule.model");
const RebateLog = require("../models/rebate.model");
const Deposit = require("../models/deposit.model");
const Withdraw = require("../models/withdraw.model");
const Bonus = require("../models/bonus.model");
const { authenticateAdminToken } = require("../auth/adminAuth");
const { User, UserGameData } = require("../models/users.model");
const vip = require("../models/vip.model");
const UserWalletLog = require("../models/userwalletlog.model");
const { getYesterdayGameLogs } = require("../services/gameData");
const { updateKioskBalance } = require("../services/kioskBalanceService");
const kioskbalance = require("../models/kioskbalance.model");
const axios = require("axios");
const cron = require("node-cron");
const { adminUser, adminLog } = require("../models/adminuser.model");
const Promotion = require("../models/promotion.model");
const { v4: uuidv4 } = require("uuid");

const moment = require("moment-timezone");

function getNextRunTime(hour, minute) {
  const now = moment().tz("Asia/Kuala_Lumpur");
  const nextRun = moment()
    .tz("Asia/Kuala_Lumpur")
    .hour(hour)
    .minute(minute)
    .second(0);
  if (nextRun.isBefore(now)) {
    nextRun.add(1, "day");
  }
  return nextRun.format("YYYY-MM-DD HH:mm:ss");
}

// 每天3点Rebate
// if (process.env.NODE_ENV !== "development") {
//   cron.schedule(
//     "0 3 * * *",
//     async () => {
//       console.log(
//         `Starting rebate calculation at: ${new Date().toISOString()}`
//       );
//       try {
//         await runRebateCalculation();
//         await RebateSchedule.findOneAndUpdate({}, { lastRunTime: new Date() });
//         console.log(
//           `Rebate calculation completed successfully at: ${new Date().toISOString()}`
//         );
//       } catch (error) {
//         console.error(
//           `Rebate calculation error at ${new Date().toISOString()}:`,
//           error
//         );
//       }
//     },
//     {
//       scheduled: true,
//       timezone: "Asia/Kuala_Lumpur",
//     }
//   );
//   console.log(
//     `Rebate calculation job scheduled for 3:00 AM (Asia/Kuala_Lumpur). Next run: ${getNextRunTime(
//       3,
//       0
//     )}`
//   );
// }
// Admin Get Rebate Report
router.get(
  "/admin/api/rebate-report",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const dateFilter = {};
      if (startDate && endDate) {
        dateFilter.createdAt = {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        };
      }
      const rebateLogs = await RebateLog.find(dateFilter).sort({
        createdAt: -1,
      });
      const currentType = rebateLogs[0]?.type || "winlose";
      const formattedLogs = rebateLogs.map((log, index) => {
        if (currentType === "turnover") {
          return {
            type: "turnover",
            id: log.id,
            claimed: log.claimed,
            claimedBy: log.claimedBy,
            claimedAt: log.claimedAt,
            username: log.username,
            liveCasino: log.livecasino,
            sports: log.sports,
            slotGames: log.slot,
            fishing: log.fishing,
            poker: log.poker,
            mahjong: log.mahjong,
            eSports: log.esports,
            horse: log.horse,
            lottery: log.lottery,
            formula: log.formula,
            totalRebate: log.totalRebate,
            totalTurnover: log.totalturnover,
            rebateissuesdate: log.createdAt,
          };
        } else {
          return {
            type: "winlose",
            id: log.id,
            claimed: log.claimed,
            claimedBy: log.claimedBy,
            claimedAt: log.claimedAt,
            username: log.username,
            totaldeposit: log.totaldeposit,
            totalwithdraw: log.totalwithdraw,
            totalbonus: log.totalbonus,
            totalwinlose: log.totalwinlose,
            formula: log.formula,
            totalRebate: log.totalRebate,
            rebateissuesdate: log.createdAt,
          };
        }
      });
      res.json({
        success: true,
        data: formattedLogs,
        type: currentType,
      });
    } catch (error) {
      console.error("Error fetching rebate report:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch rebate report",
        error: error.message,
      });
    }
  }
);

// Admin Get Rebate Schedule
router.get(
  "/admin/api/rebate-schedule",
  authenticateAdminToken,
  async (req, res) => {
    try {
      let schedule = await RebateSchedule.findOne();
      if (!schedule) {
        schedule = await RebateSchedule.create({
          hour: 3,
          minute: 0,
          isActive: true,
          calculationType: "turnover",
          winLosePercentage: 0,
          categoryPercentages: {
            liveCasino: 0,
            sports: 0,
            slotGames: 0,
            fishing: 0,
            poker: 0,
            mahjong: 0,
            eSports: 0,
            horse: 0,
            lottery: 0,
          },
        });
      }
      res.json({ success: true, data: schedule });
    } catch (error) {
      console.error("Error fetching rebate schedule:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch rebate schedule",
        error: error.message,
      });
    }
  }
);

// Admin Create Rebate-Schedule
router.post(
  "/admin/api/rebate-schedule",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const {
        hour,
        minute,
        isActive,
        calculationType,
        winLosePercentage,
        categoryPercentages,
      } = req.body;
      let schedule = await RebateSchedule.findOne();
      if (!schedule) {
        schedule = new RebateSchedule();
      }

      schedule.hour = hour;
      schedule.minute = minute;
      schedule.isActive = isActive;
      schedule.calculationType = calculationType;

      if (calculationType === "winlose") {
        schedule.winLosePercentage = winLosePercentage;
      } else {
        schedule.categoryPercentages = categoryPercentages;
      }

      await schedule.save();

      res.status(200).json({
        success: true,
        message: {
          en: "Rebate schedule updated successfully",
          zh: "返水计划更新成功",
        },
        data: schedule,
      });
    } catch (error) {
      console.error("Error updating rebate schedule:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Internal server error",
          zh: "服务器内部错误",
        },
      });
    }
  }
);

// Admin Manual Action Route (If Needed)
router.post(
  "/admin/api/rebate-calculate/manual",
  // authenticateAdminToken,
  async (req, res) => {
    try {
      await runRebateCalculation();
      res.json({
        success: true,
        message: "Rebate calculation completed",
      });
    } catch (error) {
      console.error("Error running manual rebate calculation:", error);
      res.status(500).json({
        success: false,
        message: "Failed to run rebate calculation",
        error: error.message,
      });
    }
  }
);

// Admin Claim Rebate for User
router.post(
  "/admin/api/claim-rebate",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { username, rebateLogId } = req.body;
      const promotion = await Promotion.findById(global.REBATE_PROMOTION_ID);
      const transactionId = uuidv4();
      const userId = req.user.userId;
      const adminuser = await adminUser.findById(userId);
      if (!adminuser) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Admin User not found",
            zh: "未找到管理员用户",
          },
        });
      }
      const rebateLog = await RebateLog.findById(rebateLogId);
      if (!rebateLog) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Rebate record not found",
            zh: "返水记录未找到",
          },
        });
      }
      if (rebateLog.claimed) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Rebate already claimed",
            zh: "返水已被领取",
          },
        });
      }
      const user = await User.findOne({ username: username });
      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "用户未找到",
          },
        });
      }
      const kioskSettings = await kioskbalance.findOne({});
      if (kioskSettings && kioskSettings.status) {
        const kioskResult = await updateKioskBalance(
          "subtract",
          rebateLog.totalRebate,
          {
            username: username,
            transactionType: "rebate claim",
            remark: `Manual rebate claim by ${adminuser.username}`,
            processBy: adminuser.username,
          }
        );
        if (!kioskResult.success) {
          return res.status(200).json({
            success: false,
            message: {
              en: "Failed to update kiosk balance",
              zh: "更新Kiosk余额失败",
            },
          });
        }
      }
      user.wallet += rebateLog.totalRebate;
      await user.save();

      const NewBonusTransaction = new Bonus({
        transactionId: transactionId,
        userId: user._id,
        username: user.username,
        fullname: user.fullname,
        transactionType: "bonus",
        processBy: adminuser.username,
        amount: rebateLog.totalRebate,
        walletamount: user.wallet,
        status: "approved",
        method: "auto",
        remark: `Rebate ${moment(rebateLog.rebateissuesdate)
          .subtract(1, "day")
          .format("DD-MM-YYYY")}`,
        promotionname: promotion.maintitle,
        promotionnameEN: promotion.maintitleEN,
        promotionId: promotion._id,
        processtime: "00:00:00",
      });
      await NewBonusTransaction.save();

      const walletLog = new UserWalletLog({
        userId: user._id,
        transactionid: NewBonusTransaction.transactionId,
        transactiontime: new Date(),
        transactiontype: "rebate",
        amount: rebateLog.totalRebate,
        status: "approved",
        promotionnameEN: `${moment(rebateLog.rebateissuesdate)
          .subtract(1, "day")
          .format("DD-MM-YYYY")}`,
      });
      await walletLog.save();

      rebateLog.claimed = true;
      rebateLog.claimedBy = adminuser.username;
      rebateLog.claimedAt = new Date();
      await rebateLog.save();
      res.status(200).json({
        success: true,
        message: {
          en: `Rebate claimed successfully for ${username}`,
          zh: `${username} 的返水已成功领取`,
        },
      });
    } catch (error) {
      console.error("Error claiming rebate:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Internal server error",
          zh: "服务器内部错误",
        },
      });
    }
  }
);

// Run Rebate Function
async function runRebateCalculation() {
  try {
    const schedule = await RebateSchedule.findOne();
    if (!schedule) return;
    const now = moment().tz("Asia/Kuala_Lumpur");
    const startDate = moment(now).subtract(1, "day").startOf("day").toDate();
    const endDate = moment(now).subtract(1, "day").endOf("day").toDate();
    if (schedule.calculationType === "winlose") {
      await calculateWinLoseRebate(
        schedule.winLosePercentage,
        startDate,
        endDate
      );
    } else {
      await calculateTurnoverRebate(
        schedule.categoryPercentages,
        startDate,
        endDate
      );
    }
  } catch (error) {
    console.error("Rebate calculation error:", error);
    throw error;
  }
}

// Rebate Based on Winlose
async function calculateWinLoseRebate(percentage, startDate, endDate) {
  try {
    console.log("Calculating for period:", { startDate, endDate });
    const promotion = await Promotion.findById(global.REBATE_PROMOTION_ID);
    const transactionId = uuidv4();
    const deposits = await Deposit.find({
      createdAt: {
        $gte: moment(new Date(startDate)).utc().toDate(),
        $lte: moment(new Date(endDate)).utc().toDate(),
      },
      status: "approved",
      reverted: false,
    });
    const withdraws = await Withdraw.find({
      createdAt: {
        $gte: moment(new Date(startDate)).utc().toDate(),
        $lte: moment(new Date(endDate)).utc().toDate(),
      },
      status: "approved",
      reverted: false,
    });
    const bonus = await Bonus.find({
      createdAt: {
        $gte: moment(new Date(startDate)).utc().toDate(),
        $lte: moment(new Date(endDate)).utc().toDate(),
      },
      status: "approved",
      reverted: false,
    });
    const userStats = {};
    deposits.forEach((deposit) => {
      if (!userStats[deposit.username]) {
        userStats[deposit.username] = {
          totaldeposit: 0,
          totalwithdraw: 0,
          totalbonus: 0,
          totalwinlose: 0,
          totalRebate: 0,
        };
      }
      userStats[deposit.username].totaldeposit += deposit.amount;
    });
    withdraws.forEach((withdraw) => {
      if (!userStats[withdraw.username]) {
        userStats[withdraw.username] = {
          totaldeposit: 0,
          totalwithdraw: 0,
          totalbonus: 0,
          totalwinlose: 0,
          totalRebate: 0,
        };
      }
      userStats[withdraw.username].totalwithdraw += withdraw.amount;
    });
    bonus.forEach((bonus) => {
      if (!userStats[bonus.username]) {
        userStats[bonus.username] = {
          totaldeposit: 0,
          totalwithdraw: 0,
          totalbonus: 0,
          totalwinlose: 0,
          totalRebate: 0,
        };
      }
      userStats[bonus.username].totalbonus += bonus.amount;
    });

    for (const [username, stats] of Object.entries(userStats)) {
      stats.totalwinlose = stats.totaldeposit - stats.totalwithdraw;
      if (stats.totalwinlose > 0) {
        stats.totalRebate = Math.abs(stats.totalwinlose) * (percentage / 100);
        if (stats.totalRebate >= 1) {
          const user = await User.findOne({ username: username });
          if (!user) {
            console.log(`User not found: ${username}`);
            continue;
          }
          const shouldClaim = user.wallet > 5;
          const rebateLog = await RebateLog.create({
            username,
            totaldeposit: stats.totaldeposit,
            totalwithdraw: stats.totalwithdraw,
            totalwinlose: stats.totalwinlose,
            totalbonus: stats.totalbonus,
            totalRebate: parseFloat(stats.totalRebate.toFixed(2)),
            rebateissuesdate: moment().utc().toDate(),
            formula: `${Math.abs(stats.totalwinlose).toFixed(
              2
            )} * ${percentage}% = ${stats.totalRebate.toFixed(2)}`,
            type: "winlose",
            claimed: !shouldClaim,
            claimedBy: shouldClaim ? null : "auto",
            claimedAt: shouldClaim ? null : new Date(),
          });
          if (!shouldClaim) {
            const kioskSettings = await kioskbalance.findOne({});
            if (kioskSettings && kioskSettings.status) {
              const kioskResult = await updateKioskBalance(
                "subtract",
                stats.totalRebate,
                {
                  username: username,
                  transactionType: "rebate",
                  remark: `Win/Lose Rebate`,
                  processBy: "system",
                }
              );
              if (!kioskResult.success) {
                console.error(
                  `Failed to update kiosk balance for user ${username}: ${kioskResult.message}`
                );
                continue;
              }
            }
            stats.totalRebate = parseFloat(stats.totalRebate.toFixed(2));
            user.wallet += stats.totalRebate;
            await user.save();

            const NewBonusTransaction = new Bonus({
              transactionId: transactionId,
              userId: user._id,
              username: user.username,
              fullname: user.fullname,
              transactionType: "bonus",
              processBy: "system",
              amount: stats.totalRebate,
              walletamount: user.wallet,
              status: "approved",
              method: "auto",
              remark: `Rebate ${moment(startDate).format("DD-MM-YYYY")}`,
              promotionname: promotion.maintitle,
              promotionnameEN: promotion.maintitleEN,
              promotionId: promotion._id,
              processtime: "00:00:00",
            });
            await NewBonusTransaction.save();

            const walletLog = new UserWalletLog({
              userId: user._id,
              transactionid: NewBonusTransaction.transactionId,
              transactiontime: new Date(),
              transactiontype: "rebate",
              amount: stats.totalRebate,
              status: "approved",
              promotionnameEN: `${moment(startDate).format("DD-MM-YYYY")}`,
            });
            await walletLog.save();

            console.log(
              `Rebate processed immediately for ${username}: ${stats.totalRebate}`
            );
          } else {
            console.log(
              `Rebate pending for ${username}: ${stats.totalRebate} (wallet: ${user.wallet})`
            );
          }
        }
      }
    }
    console.log("Rebate calculation completed");
  } catch (error) {
    console.error("Win/Lose rebate calculation error:", error);
    throw error;
  }
}

// Rebate Based on Turnover
async function calculateTurnoverRebate() {
  try {
    const mockData = await getYesterdayGameLogs();
    console.log(mockData);
    const vipConfig = await vip.findOne();
    if (!vipConfig) {
      throw new Error("VIP configuration not found");
    }
    const uniqueUsernames = [
      ...new Set(
        Object.values(mockData).flatMap((category) => Object.keys(category))
      ),
    ];
    console.log(`Processing users:`, uniqueUsernames);
    const users = await User.find({ username: { $in: uniqueUsernames } });
    const userVipMap = new Map(users.map((user) => [user.username, user]));
    const userTurnovers = {};
    for (const [category, userData] of Object.entries(mockData)) {
      for (const [username, data] of Object.entries(userData)) {
        const user = userVipMap.get(username);
        if (!user) {
          console.log(`User not found: ${username}`);
          continue;
        }
        if (!userTurnovers[username]) {
          userTurnovers[username] = {
            categoryTurnover: {},
            categoryWinloss: {},
            total: 0,
          };
        }
        const categoryKey = category.toLowerCase().replace(/\s+/g, "");
        userTurnovers[username].categoryTurnover[categoryKey] = data.turnover;
        userTurnovers[username].categoryWinloss[categoryKey] =
          data.winloss || 0;
        userTurnovers[username].total += data.turnover;
      }
    }

    for (const [username, turnoverData] of Object.entries(userTurnovers)) {
      const user = userVipMap.get(username);

      if (user) {
        const oldVipLevel = user.viplevel;
        const updatedUser = await User.findOneAndUpdate(
          { _id: user._id },
          { $inc: { totalturnover: turnoverData.total } },
          { new: true }
        );
        const latestUser = await User.findById(user._id);
        userVipMap.set(username, latestUser);

        const gameAmounts = {
          "Slot Games": {
            turnover: turnoverData.categoryTurnover.slotgames || 0,
            winloss: turnoverData.categoryWinloss.slotgames || 0,
          },
          "Live Casino": {
            turnover: turnoverData.categoryTurnover.livecasino || 0,
            winloss: turnoverData.categoryWinloss.livecasino || 0,
          },
          Sports: {
            turnover: turnoverData.categoryTurnover.sports || 0,
            winloss: turnoverData.categoryWinloss.sports || 0,
          },
          Fishing: {
            turnover: turnoverData.categoryTurnover.fishing || 0,
            winloss: turnoverData.categoryWinloss.fishing || 0,
          },
          Poker: {
            turnover: turnoverData.categoryTurnover.poker || 0,
            winloss: turnoverData.categoryWinloss.poker || 0,
          },
          "Mah Jong": {
            turnover: turnoverData.categoryTurnover.mahjong || 0,
            winloss: turnoverData.categoryWinloss.mahjong || 0,
          },
          "E-Sports": {
            turnover: turnoverData.categoryTurnover.esports || 0,
            winloss: turnoverData.categoryWinloss.esports || 0,
          },
          Horse: {
            turnover: turnoverData.categoryTurnover.horse || 0,
            winloss: turnoverData.categoryWinloss.horse || 0,
          },
          Lottery: {
            turnover: turnoverData.categoryTurnover.lottery || 0,
            winloss: turnoverData.categoryWinloss.lottery || 0,
          },
        };

        let userGameData = await UserGameData.findOne({ userId: user._id });
        if (!userGameData) {
          userGameData = new UserGameData({
            userId: user._id,
            username: username,
            gameHistory: new Map(),
          });
        }

        const yesterday = moment()
          .tz("Australia/Sydney")
          .subtract(1, "day")
          .format("DD-MM-YYYY");
        const twoMonthsAgo = moment()
          .tz("Australia/Sydney")
          .subtract(2, "months");

        const historyEntries = Array.from(userGameData.gameHistory.entries());
        const filteredEntries = historyEntries.filter(([date]) => {
          const entryDate = moment(date, "DD-MM-YYYY");
          return entryDate.isAfter(twoMonthsAgo);
        });

        filteredEntries.push([yesterday, gameAmounts]);
        userGameData.gameHistory = new Map(filteredEntries);

        await userGameData.save();

        console.log(
          `Updated game history for user ${username} for date ${yesterday}`
        );
      }
    }

    const userRebates = {};
    for (const [category, userData] of Object.entries(mockData)) {
      for (const [username, data] of Object.entries(userData)) {
        const user = userVipMap.get(username);
        if (!user) continue;
        if (!userRebates[username]) {
          userRebates[username] = {
            totalRebate: 0,
            categoryTurnover: userTurnovers[username].categoryTurnover,
            categoryRebates: {},
            formula: [],
          };
        }
        let rebatePercentage = 0;
        const vipLevel = vipConfig.vipLevels.find(
          (level) => level.name === user.viplevel
        );
        if (vipLevel) {
          const rebateValue = vipLevel.benefits.get("Rebate %");
          rebatePercentage =
            rebateValue === "no" ? 0 : parseFloat(rebateValue) || 0;
        }
        const categoryKey = category.toLowerCase().replace(/\s+/g, "");
        const categoryRebate = data.turnover * rebatePercentage;
        userRebates[username].categoryRebates[categoryKey] = categoryRebate;
        userRebates[username].totalRebate += categoryRebate;
        userRebates[username].formula.push(
          `${category} (VIP ${user.viplevel}): ${
            data.turnover
          } * ${rebatePercentage}% = ${(categoryRebate / 100).toFixed(2)}`
        );
      }
    }

    for (const [username, rebateData] of Object.entries(userRebates)) {
      const user = userVipMap.get(username);
      if (!user) continue;
      rebateData.totalRebate = parseFloat(
        (rebateData.totalRebate / 100).toFixed(2)
      );
      if (rebateData.totalRebate > 0) {
        const kioskSettings = await kioskbalance.findOne({});
        if (kioskSettings && kioskSettings.status) {
          const kioskResult = await updateKioskBalance(
            "subtract",
            rebateData.totalRebate,
            {
              username: username,
              transactionType: "rebate",
              remark: `Turnover Rebate`,
              processBy: "system",
            }
          );
          if (!kioskResult.success) {
            console.error(
              `Failed to update kiosk balance for user ${username}: ${kioskResult.message}`
            );
            continue;
          }
        }
        await User.findOneAndUpdate(
          { _id: user._id },
          { $inc: { wallet: rebateData.totalRebate } }
        );
        await RebateLog.create({
          username,
          categoryTurnover: rebateData.categoryTurnover,
          totalRebate: rebateData.totalRebate,
          formula: rebateData.formula.join("\n"),
          type: "turnover",
          rebateissuesdate: new Date(),
          totalturnover: userTurnovers[username].total,
          slot: rebateData.categoryTurnover.slotgames || 0,
          livecasino: rebateData.categoryTurnover.livecasino || 0,
          sports: rebateData.categoryTurnover.sports || 0,
          fishing: rebateData.categoryTurnover.fishing || 0,
          poker: rebateData.categoryTurnover.poker || 0,
          mahjong: rebateData.categoryTurnover.mahjong || 0,
          esports: rebateData.categoryTurnover["e-sports"] || 0,
          horse: rebateData.categoryTurnover.horse || 0,
          lottery: rebateData.categoryTurnover.lottery || 0,
        });
        await UserWalletLog.create({
          userId: user._id,
          transactiontime: new Date(),
          transactiontype: "rebate",
          amount: rebateData.totalRebate,
          status: "approved",
          promotionnameEN: `Rebate ${moment()
            .tz("Australia/Sydney")
            .subtract(1, "day")
            .format("YYYY-MM-DD")}`,
        });
      }
    }
  } catch (error) {
    console.error("Turnover rebate calculation error:", error);
    throw error;
  }
}

module.exports = router;
