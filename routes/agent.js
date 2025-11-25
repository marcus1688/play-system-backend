const express = require("express");
const router = express.Router();
const nodeSchedule = require("node-schedule");
const moment = require("moment-timezone");
const {
  AgentCommission,
  AgentCommissionReport,
} = require("../models/agent.model");
const { User } = require("../models/users.model");
const Deposit = require("../models/deposit.model");
const Withdraw = require("../models/withdraw.model");
const Bonus = require("../models/bonus.model");
const { authenticateAdminToken } = require("../auth/adminAuth");
const { authenticateToken } = require("../auth/auth");
const { setConnForRequest } = require("../lib/dbContext");
// const BetRecord = require("../models/betrecord.model");
const UserWalletLog = require("../models/userwalletlog.model");
const { LEVEL_REQUIREMENTS } = require("../config/agentConfig");
const { updateKioskBalance } = require("../services/kioskBalanceService");
const kioskbalance = require("../models/kioskbalance.model");
const cron = require("node-cron");
const Promotion = require("../models/promotion.model");
const { v4: uuidv4 } = require("uuid");
const { adminUser, adminLog } = require("../models/adminuser.model");

function getNextRunTime(hour, minute, dayOfWeek) {
  const now = moment().tz("Asia/Kuala_Lumpur");
  const nextRun = moment()
    .tz("Asia/Kuala_Lumpur")
    .hour(hour)
    .minute(minute)
    .second(0);
  const currentDay = now.day();
  const daysUntilMonday = (dayOfWeek - currentDay + 7) % 7;
  nextRun.add(daysUntilMonday, "days");
  if (nextRun.isBefore(now)) {
    nextRun.add(7, "days");
  }
  return nextRun.format("YYYY-MM-DD HH:mm:ss");
}

// 每周1早上6点Commission
// if (process.env.NODE_ENV !== "development") {
//   cron.schedule(
//     "0 6 * * 1",
//     async () => {
//       try {
//         console.log(
//           `Running commission calculation at ${new Date().toISOString()}`
//         );
//         await runCommissionCalculation();
//         await AgentCommission.findOneAndUpdate({}, { lastRunTime: new Date() });
//         console.log(
//           `Commission calculation completed successfully at ${new Date().toISOString()}`
//         );
//       } catch (error) {
//         console.error(
//           `Commission calculation error at ${new Date().toISOString()}:`,
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
//     `Commission job scheduled for every Monday 6:00 AM (Asia/Kuala_Lumpur). Next run: ${getNextRunTime(
//       6,
//       0,
//       1
//     )}`
//   );
// }

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
}

router.use(async (req, res, next) => {
  try {
    setConnForRequest(req.db);
    next();
  } catch (error) {
    console.error("Middleware error:", error);
    res.status(500).json({
      success: false,
      message: {
        en: "Internal server error",
        zh: "服务器内部错误",
      },
      error: error.message,
    });
  }
});

// User Get Agent Commission Report
router.get(
  "/api/agent-commission-report",
  authenticateToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const userId = req.user.userId;

      const queryFilter = {
        agentId: userId,
      };

      if (startDate && endDate) {
        queryFilter.createdAt = {
          $gte: moment
            .tz(startDate, "Asia/Kuala_Lumpur")
            .startOf("day")
            .utc()
            .toDate(),
          $lte: moment
            .tz(endDate, "Asia/Kuala_Lumpur")
            .endOf("day")
            .utc()
            .toDate(),
        };
      }

      const reports = await AgentCommissionReport.find(queryFilter).sort({
        createdAt: -1,
      });

      res.json({
        success: true,
        data: reports,
      });
    } catch (error) {
      console.error("Error fetching user commission report:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch commission report",
        error: error.message,
      });
    }
  }
);

// User Get Agent Commission Details
router.get("/api/agent-commission", authenticateToken, async (req, res) => {
  try {
    const commission = await AgentCommission.findOne();

    if (!commission) {
      return res.json({
        success: true,
        data: null,
        message: "No commission settings found",
      });
    }

    res.json({
      success: true,
      data: commission,
    });
  } catch (error) {
    console.error("Error fetching agent commission:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch commission settings",
      error: error.message,
    });
  }
});

// User Get Agent Progress
router.get("/api/agent-progress", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const agent = await User.findById(userId).populate("referrals.user_id");
    if (!agent) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    const downlines = agent.referrals.map((ref) => ref.user_id).filter(Boolean);
    const currentLevel = agent.agentLevel || 0;
    let nextLevelProgress = {
      currentLevel,
      nextLevel: null,
      currentQualifiedCount: 0,
      requiredCount: 0,
      requiredVipLevel: 0,
      remaining: 0,
    };
    const nextLevelReq = LEVEL_REQUIREMENTS.find(
      (req) => req.level === currentLevel + 1
    );

    if (nextLevelReq) {
      const qualifiedDownlines = downlines.filter(
        (user) => user.viplevel >= nextLevelReq.requiredVipLevel
      );
      nextLevelProgress = {
        currentLevel,
        nextLevel: currentLevel + 1,
        currentQualifiedCount: qualifiedDownlines.length,
        requiredCount: nextLevelReq.requiredCount,
        requiredVipLevel: nextLevelReq.requiredVipLevel,
        remaining: Math.max(
          0,
          nextLevelReq.requiredCount - qualifiedDownlines.length
        ),
      };
    }
    const response = {
      success: true,
      data: {
        currentAgentLevel: currentLevel,
        totalDownlines: downlines.length,
        nextLevelProgress,
        // Include the breakdown of downlines by VIP level
        downlinesByVipLevel: downlines.reduce((acc, downline) => {
          const vipLevel = downline.viplevel || 0;
          acc[vipLevel] = (acc[vipLevel] || 0) + 1;
          return acc;
        }, {}),
      },
    };

    res.json(response);
  } catch (error) {
    console.error("Error fetching agent progress:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch agent progress",
      error: error.message,
    });
  }
});

// User Agent Member Management
router.get("/api/get-downlines", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const agentCommission = await AgentCommission.findOne();
    const maxDownline = parseInt(agentCommission.maxDownline);

    async function getDownlineUsers(parentId, currentLevel = 1, maxLevel) {
      if (currentLevel > maxLevel) return { downlines: [], indirectCount: 0 };

      const directDownlines = await User.find({
        "referralBy.user_id": parentId,
      }).select(
        "createdAt status lastLogin lastdepositdate viplevel totalturnover username"
      );

      let allDownlines = [];
      let indirectCount = 0;

      for (const user of directDownlines) {
        const userWithLevel = {
          ...user.toObject(),
          level: currentLevel,
        };
        allDownlines.push(userWithLevel);

        if (currentLevel === 1) {
          // 只递归查找 **间接下线的数量**（不返回数据）
          const { indirectCount: nextLevelIndirectCount } =
            await getDownlineUsers(user._id, currentLevel + 1, maxLevel);
          indirectCount += nextLevelIndirectCount;
        } else {
          indirectCount += 1;
        }
      }

      return { downlines: allDownlines, indirectCount };
    }

    // 获取 **直接下线用户数据** & **间接下线数量**
    const { downlines, indirectCount } = await getDownlineUsers(
      userId,
      1,
      maxDownline
    );

    const response = {
      direct: downlines,
      indirectCount, // 只返回间接下线的总数量
    };

    const summary = {
      totalDirect: response.direct.length,
      totalIndirect: indirectCount, // ✅ 只返回数量
      totalDownlines: response.direct.length + indirectCount,
    };

    res.json({
      success: true,
      data: {
        downlines: response,
        summary: summary,
      },
    });
  } catch (error) {
    console.error("Error getting downlines:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// User Team Stats
router.get("/api/team-stats", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const agentCommission = await AgentCommission.findOne();
    // const maxDownline = parseInt(agentCommission.maxDownline);
    const maxDownline = parseInt(1);

    async function getDownlineUsers(parentId, currentLevel = 1, maxLevel) {
      if (currentLevel > maxLevel) return [];

      const directDownlines = await User.find({
        "referralBy.user_id": parentId,
      }).select("_id referralBy totaldeposit");

      let allDownlines = [];
      for (const user of directDownlines) {
        const userWithLevel = {
          ...user.toObject(),
          level: currentLevel,
        };
        allDownlines.push(userWithLevel);

        const nextLevelDownlines = await getDownlineUsers(
          user._id,
          currentLevel + 1,
          maxLevel
        );
        allDownlines = allDownlines.concat(nextLevelDownlines);
      }
      return allDownlines;
    }

    const allDownlines = await getDownlineUsers(userId, 1, maxDownline);
    const directDownlines = allDownlines.filter((user) => user.level === 1);
    const indirectDownlines = allDownlines.filter((user) => user.level > 1);
    const stats = {
      all: {
        registeredUsers: allDownlines.length,
        validUsers: allDownlines.filter((user) => user.totaldeposit > 0).length,
        teamUsers: allDownlines.length,
      },
      direct: {
        registeredUsers: directDownlines.length,
        validUsers: directDownlines.filter((user) => user.totaldeposit > 0)
          .length,
        teamUsers: directDownlines.length,
      },
      indirect: {
        registeredUsers: indirectDownlines.length,
        validUsers: indirectDownlines.filter((user) => user.totaldeposit > 0)
          .length,
        teamUsers: indirectDownlines.length,
      },
    };
    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("Error getting team stats:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Admin Get Agent Commission Settings
router.get(
  "/admin/api/agent-commission",
  authenticateAdminToken,
  async (req, res) => {
    try {
      let commission = await AgentCommission.findOne();
      if (!commission) {
        commission = await AgentCommission.create({
          type: "weekly",
          weekDay: "1",
          monthDay: 1,
          hour: "03",
          minute: "00",
          isActive: true,
          calculationType: "turnover",
          maxDownline: "1",
        });
      }
      res.json({ success: true, data: commission });
    } catch (error) {
      console.error("Error fetching agent commission settings:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch commission settings",
        error: error.message,
      });
    }
  }
);

// Admin Update Agent Commission Settings
router.post(
  "/admin/api/agent-commission",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const {
        type,
        weekDay,
        monthDay,
        hour,
        minute,
        isActive,
        calculationType,
        maxDownline,
        winLoseCommission,
        commissionPercentages,
      } = req.body;

      let commission = await AgentCommission.findOne();
      if (!commission) {
        commission = new AgentCommission();
      }

      commission.type = type;
      commission.weekDay = weekDay;
      commission.monthDay = monthDay;
      commission.hour = hour;
      commission.minute = minute;
      commission.isActive = isActive;
      commission.calculationType = calculationType;
      commission.maxDownline = maxDownline;

      if (calculationType === "winlose") {
        commission.winLoseCommission = winLoseCommission;
      } else {
        commission.commissionPercentages = commissionPercentages;
      }

      await commission.save();

      res.status(200).json({
        success: true,
        message: {
          en: "Commission settings updated successfully",
          zh: "佣金设置更新成功",
        },
        data: commission,
      });
    } catch (error) {
      console.error("Error updating commission settings:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Failed to update commission settings",
          zh: "更新佣金设置失败",
        },
      });
    }
  }
);

// Admin Manual Commission Calculation (If Needed)
router.post(
  "/admin/api/commission-calculate/manual",
  authenticateAdminToken,
  async (req, res) => {
    try {
      await runCommissionCalculation();
      res.json({
        success: true,
        message: "Commission calculation completed",
      });
    } catch (error) {
      console.error("Error running manual commission calculation:", error);
      res.status(500).json({
        success: false,
        message: "Failed to run commission calculation",
        error: error.message,
      });
    }
  }
);

// Admin Get Commission Reports
router.get(
  "/admin/api/commission-report",
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

      const reports = await AgentCommissionReport.find(dateFilter)
        .populate("agentId", "username")
        .populate("downlineId", "username")
        .sort({ createdAt: -1 });

      res.json({
        success: true,
        data: reports,
      });
    } catch (error) {
      console.error("Error fetching commission report:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch commission report",
        error: error.message,
      });
    }
  }
);

// Admin Get Specific User Downline
router.get(
  "/admin/api/user-downlines/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const agentCommission = await AgentCommission.findOne();
      const maxDownline = parseInt(agentCommission?.maxDownline || 1);
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }
      async function getDownlineUsers(parentId, currentLevel = 1, maxLevel) {
        if (currentLevel > maxLevel) return [];
        const directDownlines = await User.find({
          "referralBy.user_id": parentId,
        }).select(
          "username createdAt status lastLogin lastdepositdate viplevel totalturnover totaldeposit email"
        );
        let allDownlines = [];
        for (const user of directDownlines) {
          const userWithLevel = {
            ...user.toObject(),
            level: currentLevel,
          };
          allDownlines.push(userWithLevel);
          const nextLevelDownlines = await getDownlineUsers(
            user._id,
            currentLevel + 1,
            maxLevel
          );
          allDownlines = allDownlines.concat(nextLevelDownlines);
        }
        return allDownlines;
      }
      const allDownlines = await getDownlineUsers(userId, 1, maxDownline);
      const groupedDownlines = {
        direct: allDownlines.filter((user) => user.level === 1),
        indirect: allDownlines.filter((user) => user.level > 1),
      };
      const summary = {
        totalDirect: groupedDownlines.direct.length,
        totalIndirect: groupedDownlines.indirect.length,
        totalDownlines: allDownlines.length,
        validUsers: allDownlines.filter((user) => user.totaldeposit > 0).length,
      };
      res.json({
        success: true,
        data: {
          userInfo: {
            username: user.username,
            id: user._id,
            agentLevel: user.agentLevel || 0,
          },
          downlines: groupedDownlines,
          summary: summary,
        },
      });
    } catch (error) {
      console.error("Error getting user downlines:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  }
);

// Admin Claim Commission for Agent
router.post(
  "/admin/api/claim-commission",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { agentUsername, commissionReportId } = req.body;
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

      const commissionReport = await AgentCommissionReport.findById(
        commissionReportId
      );
      if (!commissionReport) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Commission record not found",
            zh: "佣金记录未找到",
          },
        });
      }

      if (commissionReport.claimed) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Commission already claimed",
            zh: "佣金已被领取",
          },
        });
      }

      const agent = await User.findOne({ username: agentUsername });
      if (!agent) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Agent not found",
            zh: "代理未找到",
          },
        });
      }

      const kioskSettings = await kioskbalance.findOne({});
      if (kioskSettings && kioskSettings.status) {
        const kioskResult = await updateKioskBalance(
          "subtract",
          commissionReport.commissionAmount,
          {
            username: agentUsername,
            transactionType: "agent commission claim",
            remark: `Manual commission claim by ${adminuser.username}`,
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

      agent.wallet += parseFloat(commissionReport.commissionAmount);
      await agent.save();

      const transactionId = uuidv4();
      const promotion = await Promotion.findById(
        global.AGENT_COMMISSION_PROMOTION_ID
      );

      const NewBonusTransaction = new Bonus({
        transactionId: transactionId,
        userId: agent._id,
        username: agent.username,
        fullname: agent.fullname,
        transactionType: "bonus",
        processBy: adminuser.username,
        amount: parseFloat(commissionReport.commissionAmount),
        walletamount: agent.wallet,
        status: "approved",
        method: "auto",
        remark: commissionReport.remark,
        promotionname: promotion.maintitle,
        promotionnameEN: promotion.maintitleEN,
        promotionId: promotion._id,
        processtime: "00:00:00",
      });
      await NewBonusTransaction.save();

      const walletLog = new UserWalletLog({
        userId: agent._id,
        transactionid: NewBonusTransaction.transactionId,
        transactiontime: new Date(),
        transactiontype: "commission",
        amount: parseFloat(commissionReport.commissionAmount),
        status: "approved",
        promotionnameEN: commissionReport.remark,
      });
      await walletLog.save();

      commissionReport.claimed = true;
      commissionReport.claimedBy = adminuser.username;
      commissionReport.claimedAt = new Date();
      commissionReport.bonusTransactionId = NewBonusTransaction._id;
      await commissionReport.save();

      res.status(200).json({
        success: true,
        message: {
          en: `Commission claimed successfully for ${agentUsername}`,
          zh: `${agentUsername} 的佣金已成功领取`,
        },
      });
    } catch (error) {
      console.error("Error claiming commission:", error);
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

// Admin Manual Commission Calculation (If Needed)
router.post(
  "/api/commission-calculate/manual",

  async (req, res) => {
    try {
      await runCommissionCalculation();
      await AgentCommission.findOneAndUpdate(
        {},
        {
          lastRunTime: new Date(),
        },
        {
          upsert: true,
        }
      );
      res.json({
        success: true,
        message: {
          en: "Commission calculation completed successfully",
          zh: "佣金计算完成",
        },
      });
    } catch (error) {
      console.error("Error running manual commission calculation:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Failed to run commission calculation",
          zh: "佣金计算失败",
        },
        error: error.message,
      });
    }
  }
);

async function runCommissionCalculation() {
  try {
    const commission = await AgentCommission.findOne();
    if (!commission) return;
    if (commission.calculationType === "turnover") {
      await calculateTurnoverCommission();
    } else {
      await calculateWinLoseCommission();
    }
  } catch (error) {
    console.error("Commission calculation error:", error);
    throw error;
  }
}

const calculateWinLoseCommission = async () => {
  try {
    console.log("======= 开始计算代理佣金 =======");
    const commission = await AgentCommission.findOne();
    const maxLevel = parseInt(commission.maxDownline);
    const weekStart = moment().subtract(1, "week").startOf("isoWeek").toDate();
    const weekEnd = moment().subtract(1, "week").endOf("isoWeek").toDate();
    console.log(`计算日期范围: ${weekStart} 到 ${weekEnd}`);
    const agents = await User.find({
      "referrals.0": { $exists: true },
      $or: [{ positionTaking: { $exists: false } }, { positionTaking: 0 }],
    }).select("_id username fullname referrals");
    console.log(
      `找到 ${agents.length} 个符合条件的代理（不包括positionTaking > 0的代理）`
    );
    for (const agent of agents) {
      console.log(`\n处理代理: ${agent.username}`);
      if (!agent.referrals || agent.referrals.length === 0) {
        console.log(`  代理 ${agent.username} 没有下线，跳过`);
        continue;
      }
      const downlineIds = agent.referrals
        .map((ref) => ref.user_id)
        .filter((id) => id);
      console.log(`  找到 ${downlineIds.length} 个下线`);
      const downlineUsers = await User.find({
        _id: { $in: downlineIds },
      }).select("_id username wallet");
      const downlineWalletMap = new Map();
      downlineUsers.forEach((user) => {
        downlineWalletMap.set(user._id.toString(), user.wallet || 0);
      });
      const deposits = await Deposit.aggregate([
        {
          $match: {
            userId: { $in: downlineIds },
            createdAt: { $gte: weekStart, $lte: weekEnd },
            status: "approved",
            reverted: false,
          },
        },
        {
          $group: {
            _id: "$userId",
            totalDeposit: { $sum: "$amount" },
            username: { $first: "$username" },
          },
        },
      ]);
      const withdrawals = await Withdraw.aggregate([
        {
          $match: {
            userId: { $in: downlineIds },
            createdAt: { $gte: weekStart, $lte: weekEnd },
            status: "approved",
            reverted: false,
          },
        },
        {
          $group: {
            _id: "$userId",
            totalWithdraw: { $sum: "$amount" },
            username: { $first: "$username" },
          },
        },
      ]);
      const bonuses = await Bonus.aggregate([
        {
          $match: {
            userId: { $in: downlineIds },
            createdAt: { $gte: weekStart, $lte: weekEnd },
            status: "approved",
            reverted: false,
          },
        },
        {
          $group: {
            _id: "$userId",
            totalBonus: { $sum: "$amount" },
            username: { $first: "$username" },
          },
        },
      ]);
      const downlineData = {};
      let totalAgentDeposit = 0;
      let totalAgentWithdraw = 0;
      let totalAgentBonus = 0;
      let netWinlose = 0;
      deposits.forEach((deposit) => {
        const userId = deposit._id.toString();
        if (!downlineData[userId]) {
          downlineData[userId] = {
            userId,
            username: deposit.username,
            totalDeposit: 0,
            totalWithdraw: 0,
            totalBonus: 0,
          };
        }
        downlineData[userId].totalDeposit = deposit.totalDeposit;
        totalAgentDeposit += deposit.totalDeposit;
      });
      withdrawals.forEach((withdraw) => {
        const userId = withdraw._id.toString();
        if (!downlineData[userId]) {
          downlineData[userId] = {
            userId,
            username: withdraw.username,
            totalDeposit: 0,
            totalWithdraw: 0,
            totalBonus: 0,
          };
        }
        downlineData[userId].totalWithdraw = withdraw.totalWithdraw;
        totalAgentWithdraw += withdraw.totalWithdraw;
      });
      bonuses.forEach((bonus) => {
        const userId = bonus._id.toString();
        if (!downlineData[userId]) {
          downlineData[userId] = {
            userId,
            username: bonus.username,
            totalDeposit: 0,
            totalWithdraw: 0,
            totalBonus: 0,
          };
        }
        downlineData[userId].totalBonus = bonus.totalBonus;
        totalAgentBonus += bonus.totalBonus;
      });
      netWinlose = totalAgentDeposit - totalAgentWithdraw;
      const commissionPercentage = parseFloat(
        commission.winLoseCommission[1] || 0
      );
      let commissionAmount = netWinlose * (commissionPercentage / 100);
      const finalCommissionAmount = commissionAmount > 0 ? commissionAmount : 0;
      let formula = `Calculation Date: ${moment(weekStart).format(
        "YYYY-MM-DD"
      )} to ${moment(weekEnd).format("YYYY-MM-DD")}\n\n`;

      let formulazh = `計算日期：${moment(weekStart).format(
        "YYYY-MM-DD"
      )} 至 ${moment(weekEnd).format("YYYY-MM-DD")}\n\n`;

      Object.values(downlineData).forEach((data) => {
        formula += `Downline: ${data.username}\n`;
        formula += `  Deposit: ${data.totalDeposit.toFixed(2)}\n`;
        formula += `  Withdraw: ${data.totalWithdraw.toFixed(2)}\n`;
        formula += `  Bonus: ${data.totalBonus.toFixed(2)}\n`;
        formula += `  Wallet: ${(
          downlineWalletMap.get(data.userId) || 0
        ).toFixed(2)}\n`;
        formula += `  Net Amount: ${(
          data.totalDeposit -
          data.totalWithdraw -
          data.totalBonus
        ).toFixed(2)}\n\n`;

        formulazh += `下線：${data.username}\n`;
        formulazh += `  存款：${data.totalDeposit.toFixed(2)}\n`;
        formulazh += `  提款：${data.totalWithdraw.toFixed(2)}\n`;
        formulazh += `  獎金：${data.totalBonus.toFixed(2)}\n`;
        formulazh += `  錢包：${(
          downlineWalletMap.get(data.userId) || 0
        ).toFixed(2)}\n`;
        formulazh += `  淨金額：${(
          data.totalDeposit -
          data.totalWithdraw -
          data.totalBonus
        ).toFixed(2)}\n\n`;
      });

      formula += `Summary:\n`;
      formula += `  Total Deposit: ${totalAgentDeposit.toFixed(2)}\n`;
      formula += `  Total Withdraw: ${totalAgentWithdraw.toFixed(2)}\n`;
      formula += `  Total Bonus: ${totalAgentBonus.toFixed(2)}\n`;
      formula += `  Net Win/Loss: ${netWinlose.toFixed(2)}\n`;
      formula += `  Commission Rate: ${commissionPercentage}%\n`;
      formula += `  Commission Calculation: ${netWinlose.toFixed(
        2
      )} × ${commissionPercentage}% = ${commissionAmount.toFixed(2)}\n`;
      if (netWinlose < 0) {
        formula += `  Note: Net Win/Loss is negative, no commission will be paid.\n`;
      }

      formulazh += `摘要：\n`;
      formulazh += `  總存款：${totalAgentDeposit.toFixed(2)}\n`;
      formulazh += `  總提款：${totalAgentWithdraw.toFixed(2)}\n`;
      formulazh += `  總獎金：${totalAgentBonus.toFixed(2)}\n`;
      formulazh += `  淨盈虧：${netWinlose.toFixed(2)}\n`;
      formulazh += `  佣金比例：${commissionPercentage}%\n`;
      formulazh += `  佣金計算：${netWinlose.toFixed(
        2
      )} × ${commissionPercentage}% = ${commissionAmount.toFixed(2)}\n`;
      if (netWinlose < 0) {
        formulazh += `  注意：淨盈虧為負數，不支付佣金。\n`;
      }

      console.log(`  总存款: ${totalAgentDeposit.toFixed(2)}`);
      console.log(`  总提款: ${totalAgentWithdraw.toFixed(2)}`);
      console.log(`  总奖金: ${totalAgentBonus.toFixed(2)}`);
      console.log(`  净盈亏: ${netWinlose.toFixed(2)}`);
      console.log(`  佣金比例: ${commissionPercentage}%`);
      console.log(`  佣金计算: ${commissionAmount.toFixed(2)}`);
      if (netWinlose < 0) {
        console.log(`  注意: 净盈亏为负数，不支付佣金`);
      }
      if (Object.keys(downlineData).length > 0) {
        const agentUser = await User.findById(agent._id);
        if (!agentUser) {
          console.log(`Agent not found: ${agent.username}`);
          continue;
        }

        const shouldClaim = agentUser.wallet > 5;
        const transactionId = uuidv4();
        let bonusTransactionId = null;
        console.log(`  已为代理 ${agent.username} 创建佣金报告`);
        if (finalCommissionAmount > 0) {
          const commissionAmount = parseFloat(finalCommissionAmount.toFixed(2));
          if (!shouldClaim) {
            const promotion = await Promotion.findById(
              global.AGENT_COMMISSION_PROMOTION_ID
            );
            await updateAgentWallet(
              agent._id.toString(),
              commissionAmount,
              `${moment(weekStart).format("DD/MM/YYYY")} - ${moment(
                weekEnd
              ).format("DD/MM/YYYY")}`,
              transactionId
            );

            const NewBonusTransaction = new Bonus({
              transactionId: transactionId,
              userId: agent._id,
              username: agent.username,
              fullname: agent.fullname,
              transactionType: "bonus",
              processBy: "system",
              amount: commissionAmount,
              walletamount: agent.wallet + commissionAmount,
              status: "approved",
              method: "auto",
              remark: `${moment(weekStart).format("DD/MM/YYYY")} - ${moment(
                weekEnd
              ).format("DD/MM/YYYY")}`,
              promotionname: promotion.maintitle,
              promotionnameEN: promotion.maintitleEN,
              promotionId: promotion._id,
              processtime: "00:00:00",
            });
            await NewBonusTransaction.save();
            bonusTransactionId = NewBonusTransaction._id;
            console.log(`  已更新代理 ${agent.username} 的钱包余额`);
          } else {
            console.log(
              `  Commission pending for ${agent.username}: ${commissionAmount} (wallet: ${agent.wallet})`
            );
          }
        } else {
          console.log(`  佣金金额为零或负数，不更新钱包余额`);
        }
        await AgentCommissionReport.create({
          agentId: agent._id,
          bonusTransactionId: bonusTransactionId,
          agentUsername: agent.username,
          agentFullname: agent.fullname,
          calculationType: "winlose",
          totalDeposit: totalAgentDeposit.toFixed(2),
          totalWithdraw: totalAgentWithdraw.toFixed(2),
          totalBonus: totalAgentBonus.toFixed(2),
          totalWinLoss: netWinlose.toFixed(2),
          commissionAmount: finalCommissionAmount.toFixed(2),
          formula: formula,
          formulazh: formulazh,
          status: "approved",
          remark: `${moment(weekStart).format("DD/MM/YYYY")} - ${moment(
            weekEnd
          ).format("DD/MM/YYYY")}`,
          claimed: !shouldClaim,
          claimedBy: shouldClaim ? null : "auto",
          claimedAt: shouldClaim ? null : new Date(),
        });
      }
    }
    console.log("\n======= 代理佣金计算完成 =======");
  } catch (error) {
    console.error("计算代理佣金时出错:", error);
    throw error;
  }
};

const calculateTurnoverCommission = async () => {
  console.log("====== STARTING TURNOVER COMMISSION CALCULATION ======");

  const mockTurnoverData = {
    60175194357: {
      "11-03-2025": {
        "Slot Games": 5000,
        Others: 6000,
        "Live Casino": 4850,
        Sports: 2220,
      },
      "13-03-2025": {
        "Slot Games": 5000,
        Others: 6000,
        "Live Casino": 4850,
        Sports: 2220,
      },
    },
    60169928784: {
      "10-03-2025": {
        "Slot Games": 5000,
        Others: 6000,
        "Live Casino": 4850,
        Sports: 2220,
      },
      "16-03-2025": {
        "Slot Games": 5000,
        Others: 6000,
        "Live Casino": 4850,
        Sports: 2220,
      },
    },
    60147852369: {
      "10-03-2025": {
        "Slot Games": 5000,
        Others: 6000,
        "Live Casino": 4850,
        Sports: 2220,
      },
      "16-03-2025": {
        "Slot Games": 5000,
        Others: 6000,
        "Live Casino": 4850,
        Sports: 2220,
      },
    },
  };

  console.log("Mock turnover data loaded:", Object.keys(mockTurnoverData));
  try {
    console.log("Fetching commission settings...");
    const commission = await AgentCommission.findOne();
    console.log("Commission settings found:", commission ? "Yes" : "No");
    if (!commission) {
      console.log(
        "No commission settings or commission not active, exiting function"
      );
      return;
    }
    const maxUpline = parseInt(commission.maxDownline) || 1;
    console.log(`Maximum upline level: ${maxUpline}`);
    console.log(
      "Commission percentages:",
      JSON.stringify(commission.commissionPercentages, null, 2)
    );
    console.log("Calculating date range for previous week...");
    const weekStart = moment().subtract(1, "week").startOf("isoWeek").toDate();
    const weekEnd = moment().subtract(1, "week").endOf("isoWeek").toDate();
    console.log(
      `Date range: ${weekStart.toISOString()} to ${weekEnd.toISOString()}`
    );
    console.log("Filtering turnovers based on date range...");
    const filteredUserTurnovers = {};
    Object.entries(mockTurnoverData).forEach(([username, dates]) => {
      console.log(`\nProcessing user: ${username}`);
      Object.entries(dates).forEach(([date, turnover]) => {
        console.log(`  Checking date: ${date}`);
        const turnoverDate = moment(date, "DD-MM-YYYY").toDate();
        const isInRange = turnoverDate >= weekStart && turnoverDate <= weekEnd;
        console.log(`  Is in date range: ${isInRange}`);
        if (isInRange) {
          if (!filteredUserTurnovers[username]) {
            filteredUserTurnovers[username] = {};
            console.log(
              `  Created entry for user ${username} in filtered turnovers`
            );
          }
          filteredUserTurnovers[username][date] = turnover;
          console.log(`  Added turnover data for ${date} to filtered data`);
        }
      });
    });
    console.log("\nFiltered user turnovers summary:");
    for (const [username, dates] of Object.entries(filteredUserTurnovers)) {
      console.log(
        `User ${username}: ${Object.keys(dates).length} dates within range`
      );
    }
    const agentCommissions = {};
    const usersWithTurnover = await User.find({
      username: { $in: Object.keys(filteredUserTurnovers) },
    }).select("_id username fullname referralBy");
    console.log(`Found ${usersWithTurnover.length} users with turnover data`);
    for (const user of usersWithTurnover) {
      console.log(
        `\n>> Processing user with turnover: ${user.username} (${user._id})`
      );
      const userTurnover = filteredUserTurnovers[user.username];
      if (!userTurnover) {
        console.log(`   No turnover data found for user, skipping`);
        continue;
      }
      await processUplineChain(
        user,
        userTurnover,
        1,
        maxUpline,
        commission,
        agentCommissions
      );
    }
    console.log("\n>> Creating commission reports and updating wallets");
    for (const [agentId, commissionData] of Object.entries(agentCommissions)) {
      if (commissionData.formulaData) {
        let formattedFormula = "";
        const sortedDates = Object.keys(commissionData.formulaData).sort();
        for (const date of sortedDates) {
          const usersData = commissionData.formulaData[date];
          formattedFormula += `${date}\n`;
          const sortedUsers = Object.keys(usersData).sort((a, b) => {
            const levelA = parseInt(a.match(/L(\d+)/)[1]);
            const levelB = parseInt(b.match(/L(\d+)/)[1]);
            return levelA - levelB;
          });
          for (const userLevel of sortedUsers) {
            const categories = usersData[userLevel];
            if (categories.length > 0) {
              formattedFormula += `  ${userLevel}\n${categories.join("\n")}\n`;
            }
          }
          formattedFormula += "\n";
        }
        commissionData.formula = formattedFormula;
      }
    }
    for (const [agentId, commissionData] of Object.entries(agentCommissions)) {
      const {
        totalCommission,
        formula,
        agent,
        downlines,
        categoryTurnover,
        levelData,
      } = commissionData;
      console.log(`\n   Processing agent: ${agent.username} (${agentId})`);
      console.log(
        `   Total commission: ${roundToTwoDecimals(totalCommission)}`
      );
      if (totalCommission > 0) {
        try {
          const allDownlines = {};
          for (const [downlineUsername, downlineData] of Object.entries(
            downlines
          )) {
            await AgentCommissionReport.create({
              agentId: agentId,
              agentUsername: agent.username,
              agentFullname: agent.fullname,
              downlineUsername: downlineUsername,
              downlineFullname: downlineData.fullname,
              calculationType: "turnover",
              categoryTurnover: downlineData.categoryTurnover,
              totalTurnover: downlineData.totalTurnover,
              downlineLevel: downlineData.level,
              commissionAmount: roundToTwoDecimals(totalCommission),
              formula: formula,
              status: "approved",
              remark: `${moment(weekStart).format("YYYY-MM-DD")} to ${moment(
                weekEnd
              ).format("YYYY-MM-DD")}`,
            });
          }
          console.log(`   Commission reports created successfully`);
          const weekStartFormatted = moment(weekStart).format("DD/MM/YYYY");
          const weekEndFormatted = moment(weekEnd).format("DD/MM/YYYY");
          const commissionPeriod = `${weekStartFormatted} - ${weekEndFormatted}`;
          await updateAgentWallet(agentId, totalCommission, commissionPeriod);
          console.log(`   Agent wallet updated with ${totalCommission}`);
        } catch (err) {
          console.error(
            `   Error creating report or updating wallet: ${err.message}`
          );
        }
      } else {
        console.log(`   No commission to pay, skipping report creation`);
      }
    }
    console.log(
      "\n====== TURNOVER COMMISSION CALCULATION COMPLETED SUCCESSFULLY ======"
    );
  } catch (error) {
    console.error("\n====== ERROR IN TURNOVER COMMISSION CALCULATION ======");
    console.error(`Error message: ${error.message}`);
    console.error(`Error stack: ${error.stack}`);
    throw error;
  }
};

async function processUplineChain(
  user,
  userTurnover,
  currentLevel,
  maxLevel,
  commission,
  agentCommissions
) {
  if (currentLevel > maxLevel || !user.referralBy || !user.referralBy.user_id) {
    return;
  }
  const referrerId = user.referralBy.user_id.toString();
  console.log(`   Processing upline level ${currentLevel}: ${referrerId}`);
  const levelCommissionRates =
    commission.commissionPercentages[currentLevel.toString()];
  if (!levelCommissionRates) {
    console.log(
      `   No commission rates defined for level ${currentLevel}, skipping`
    );
    return;
  }
  const referrer = await User.findById(referrerId).select(
    "_id username fullname referralBy"
  );
  if (!referrer) {
    console.log(`   Referrer not found, skipping`);
    return;
  }
  console.log(`   Referrer found: ${referrer.username}`);
  if (!agentCommissions[referrerId]) {
    agentCommissions[referrerId] = {
      agent: referrer,
      totalCommission: 0,
      formula: "",
      formulaData: {},
      downlines: {},
      categoryTurnover: {},
      levelData: {},
    };
  }
  if (!agentCommissions[referrerId].formulaData) {
    agentCommissions[referrerId].formulaData = {};
  }
  if (!agentCommissions[referrerId].levelData[currentLevel]) {
    agentCommissions[referrerId].levelData[currentLevel] = {
      downlines: {},
      categoryTurnover: {},
      totalTurnover: 0,
    };
  }
  if (
    !agentCommissions[referrerId].levelData[currentLevel].downlines[
      user.username
    ]
  ) {
    agentCommissions[referrerId].levelData[currentLevel].downlines[
      user.username
    ] = {
      categoryTurnover: {},
      totalTurnover: 0,
    };
  }
  if (!agentCommissions[referrerId].downlines) {
    agentCommissions[referrerId].downlines = {};
  }
  if (!agentCommissions[referrerId].downlines[user.username]) {
    agentCommissions[referrerId].downlines[user.username] = {
      categoryTurnover: {},
      totalTurnover: 0,
      level: currentLevel,
      fullname: user.fullname,
    };
  }
  let levelCommission = 0;
  Object.entries(userTurnover).forEach(([date, categories]) => {
    const formattedDate = moment(date, "DD-MM-YYYY").format("DD/MM/YYYY");
    const displayName = user.fullname.toUpperCase();
    const userLevelKey = `${displayName}(L${currentLevel})`;
    if (!agentCommissions[referrerId].formulaData[formattedDate]) {
      agentCommissions[referrerId].formulaData[formattedDate] = {};
    }
    if (
      !agentCommissions[referrerId].formulaData[formattedDate][userLevelKey]
    ) {
      agentCommissions[referrerId].formulaData[formattedDate][userLevelKey] =
        [];
    }
    Object.entries(categories).forEach(([category, turnover]) => {
      if (!agentCommissions[referrerId].categoryTurnover[category]) {
        agentCommissions[referrerId].categoryTurnover[category] = 0;
      }
      agentCommissions[referrerId].categoryTurnover[category] += turnover;
      if (
        !agentCommissions[referrerId].levelData[currentLevel].categoryTurnover[
          category
        ]
      ) {
        agentCommissions[referrerId].levelData[currentLevel].categoryTurnover[
          category
        ] = 0;
      }
      agentCommissions[referrerId].levelData[currentLevel].categoryTurnover[
        category
      ] += turnover;
      agentCommissions[referrerId].levelData[currentLevel].totalTurnover +=
        turnover;
      if (
        !agentCommissions[referrerId].levelData[currentLevel].downlines[
          user.username
        ].categoryTurnover[category]
      ) {
        agentCommissions[referrerId].levelData[currentLevel].downlines[
          user.username
        ].categoryTurnover[category] = 0;
      }
      agentCommissions[referrerId].levelData[currentLevel].downlines[
        user.username
      ].categoryTurnover[category] += turnover;
      agentCommissions[referrerId].levelData[currentLevel].downlines[
        user.username
      ].totalTurnover += turnover;
      if (
        !agentCommissions[referrerId].downlines[user.username].categoryTurnover[
          category
        ]
      ) {
        agentCommissions[referrerId].downlines[user.username].categoryTurnover[
          category
        ] = 0;
      }
      agentCommissions[referrerId].downlines[user.username].categoryTurnover[
        category
      ] += turnover;
      agentCommissions[referrerId].downlines[user.username].totalTurnover +=
        turnover;
      const rate = levelCommissionRates[category] || 0;
      if (rate > 0) {
        const categoryCommission = (turnover * rate) / 100;
        levelCommission += categoryCommission;
        agentCommissions[referrerId].totalCommission += categoryCommission;
        agentCommissions[referrerId].formulaData[formattedDate][
          userLevelKey
        ].push(
          `    ${category}: ${turnover} * ${rate}% = ${categoryCommission.toFixed(
            2
          )}`
        );
        console.log(
          `     ${category}: ${turnover} * ${rate}% = ${categoryCommission.toFixed(
            2
          )}`
        );
      }
    });
  });
  console.log(
    `   Level ${currentLevel} commission for agent ${
      referrer.username
    }: ${levelCommission.toFixed(2)}`
  );
  await processUplineChain(
    referrer,
    userTurnover,
    currentLevel + 1,
    maxLevel,
    commission,
    agentCommissions
  );
}

const updateAgentWallet = async (
  agentId,
  commissionAmount,
  commissionPeriod,
  transactionId
) => {
  try {
    const kioskSettings = await kioskbalance.findOne({});
    if (kioskSettings && kioskSettings.status) {
      const agent = await User.findById(agentId);
      if (!agent) {
        console.error(`Agent not found: ${agentId}`);
        return;
      }
      const kioskResult = await updateKioskBalance(
        "subtract",
        commissionAmount,
        {
          username: agent.username,
          transactionType: "agent commission",
          remark: `Agent Commission Payment`,
          processBy: "system",
        }
      );

      if (!kioskResult.success) {
        console.error(
          `Failed to update kiosk balance for agent ${agent.username}: ${kioskResult.message}`
        );
      }
    }
    await User.findOneAndUpdate(
      { _id: agentId },
      { $inc: { wallet: commissionAmount } }
    );
    await UserWalletLog.create({
      userId: agentId,
      transactionid: transactionId,
      transactiontype: "commission",
      amount: commissionAmount,
      status: "approved",
      promotionnameEN: commissionPeriod,
      promotionnameCN: commissionPeriod,
      transactiontime: new Date(),
    });
  } catch (error) {
    console.error("Error updating agent wallet:", error);
    throw error;
  }
};

async function getAgentDownlines(agentId, maxLevel) {
  const downlines = {};
  for (let i = 1; i <= maxLevel; i++) {
    downlines[i] = await User.find({
      parentAgentId:
        i === 1 ? agentId : { $in: downlines[i - 1].map((u) => u._id) },
    });
  }
  return downlines;
}

// Transfer Referral
router.post(
  "/admin/api/transfer-referral",
  authenticateAdminToken,
  async (req, res) => {
    const { username, newAgentUsername } = req.body;
    if (!username || !newAgentUsername) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Username and new agent username are required",
          zh: "用户名和新代理用户名是必需的",
          zh_hk: "用戶名和新代理用戶名是必需的",
          ms: "Nama pengguna dan nama pengguna ejen baru diperlukan",
          id: "Username dan username agen baru diperlukan",
        },
      });
    }
    try {
      const userToTransfer = await User.findOne({
        username: username.toLowerCase(),
      });
      if (!userToTransfer) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "用户未找到",
            zh_hk: "用戶未找到",
            ms: "Pengguna tidak ditemui",
            id: "Pengguna tidak ditemukan",
          },
        });
      }
      const newReferrer = await User.findOne({
        username: newAgentUsername.toLowerCase(),
      });
      if (!newReferrer) {
        return res.status(200).json({
          success: false,
          message: {
            en: "New agent username not found",
            zh: "新代理用户名未找到",
            zh_hk: "新代理用戶名未找到",
            ms: "Nama pengguna ejen baru tidak ditemui",
            id: "Username agen baru tidak ditemukan",
          },
        });
      }
      if (userToTransfer._id.toString() === newReferrer._id.toString()) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Cannot refer yourself",
            zh: "不能推荐自己",
            zh_hk: "不能推薦自己",
            ms: "Tidak boleh merujuk diri sendiri",
            id: "Tidak bisa mereferensikan diri sendiri",
          },
        });
      }
      const oldReferrer = userToTransfer.referralBy
        ? userToTransfer.referralBy.username
        : null;

      if (userToTransfer.referralBy && userToTransfer.referralBy.user_id) {
        await User.findByIdAndUpdate(userToTransfer.referralBy.user_id, {
          $pull: {
            referrals: {
              user_id: userToTransfer._id,
            },
          },
        });
      }

      await User.findByIdAndUpdate(newReferrer._id, {
        $push: {
          referrals: {
            user_id: userToTransfer._id,
            username: userToTransfer.username,
          },
        },
      });

      await User.findByIdAndUpdate(userToTransfer._id, {
        $set: {
          referralBy: {
            user_id: newReferrer._id,
            username: newReferrer.username,
          },
        },
      });

      res.status(200).json({
        success: true,
        message: {
          en: "Referral relationship updated successfully",
          zh: "推荐关系更新成功",
          zh_hk: "推薦關係更新成功",
          ms: "Hubungan rujukan berjaya dikemas kini",
          id: "Hubungan referral berhasil diperbarui",
        },
        data: {
          transferredUser: userToTransfer.username,
          oldReferrer: oldReferrer,
          newReferrer: newReferrer.username,
        },
      });
    } catch (error) {
      console.error("Error transferring referral:", error);
      res.status(200).json({
        success: false,
        message: {
          en: "Failed to transfer referral due to system error",
          zh: "由于系统错误，推荐关系转移失败",
          zh_hk: "由於系統錯誤，推薦關係轉移失敗",
          ms: "Gagal memindahkan rujukan kerana ralat sistem",
          id: "Gagal mentransfer referral karena kesalahan sistem",
        },
      });
    }
  }
);

// Remove Referral
router.post(
  "/admin/api/remove-referral",
  authenticateAdminToken,
  async (req, res) => {
    const { username } = req.body;
    if (!username) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Username is required",
          zh: "用户名是必需的",
          zh_hk: "用戶名是必需的",
          ms: "Nama pengguna diperlukan",
          id: "Username diperlukan",
        },
      });
    }

    try {
      const user = await User.findOne({ username: username.toLowerCase() });
      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "用户未找到",
            zh_hk: "用戶未找到",
            ms: "Pengguna tidak ditemui",
            id: "Pengguna tidak ditemukan",
          },
        });
      }
      const oldReferrer = user.referralBy ? user.referralBy.username : null;
      if (user.referralBy && user.referralBy.user_id) {
        await User.findByIdAndUpdate(user.referralBy.user_id, {
          $pull: {
            referrals: {
              user_id: user._id,
            },
          },
        });
      }
      await User.findByIdAndUpdate(user._id, {
        $unset: {
          referralBy: "",
        },
      });
      res.status(200).json({
        success: true,
        message: {
          en: "Referral relationship removed successfully",
          zh: "推荐关系删除成功",
          zh_hk: "推薦關係刪除成功",
          ms: "Hubungan rujukan berjaya dipadamkan",
          id: "Hubungan referral berhasil dihapus",
        },
        data: {
          username: user.username,
          removedFrom: oldReferrer,
        },
      });
    } catch (error) {
      console.error("Error removing referral:", error);
      res.status(200).json({
        success: false,
        message: {
          en: "Failed to remove referral due to system error",
          zh: "由于系统错误，推荐关系删除失败",
          zh_hk: "由於系統錯誤，推薦關係刪除失敗",
          ms: "Gagal memadamkan rujukan kerana ralat sistem",
          id: "Gagal menghapus referral karena kesalahan sistem",
        },
      });
    }
  }
);

module.exports = router;
