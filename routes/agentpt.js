const express = require("express");
const moment = require("moment");
const router = express.Router();
const { authenticateToken } = require("../auth/auth");
const { User } = require("../models/users.model");
const { authenticateAdminToken } = require("../auth/adminAuth");
const { adminUser } = require("../models/adminuser.model");
const { v4: uuidv4 } = require("uuid");
const nodeSchedule = require("node-schedule");
const Deposit = require("../models/deposit.model");
const Withdraw = require("../models/withdraw.model");
const Bonus = require("../models/bonus.model");
const AgentPTReport = require("../models/agentpt.model");
const UserWalletLog = require("../models/userwalletlog.model");
const cron = require("node-cron");

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

// 每天12点Agent PT
// if (process.env.NODE_ENV !== "development") {
//   cron.schedule(
//     "0 0 * * *", // 修改为凌晨0点(午夜12点)，并修正了cron表达式格式
//     async () => {
//       try {
//         console.log(
//           `Starting Agent PT calculation: ${new Date().toISOString()}`
//         );
//         await calculateAgentPT();
//         console.log(
//           `Agent PT calculation completed successfully: ${new Date().toISOString()}`
//         );
//       } catch (error) {
//         console.error(
//           `Agent PT calculation error: ${new Date().toISOString()}`,
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
//     `Agent PT calculation scheduled for 12:00 AM daily (Asia/Kuala_Lumpur). Next run: ${getNextRunTime(
//       0,
//       0
//     )}`
//   );
// }

const calculateAgentPT = async () => {
  try {
    console.log("======= 开始计算AGENT PT =======");
    const yesterday = moment().tz("Asia/Kuala_Lumpur").subtract(1, "day");
    const startOfDay = yesterday.clone().startOf("day").utc().toDate();
    console.log(startOfDay);
    const endOfDay = yesterday.clone().endOf("day").utc().toDate();
    console.log(`计算日期范围: ${startOfDay} 到 ${endOfDay}`);
    const agentsWithPT = await User.find({
      positionTaking: { $gt: "0" },
    }).select("_id username fullname positionTaking referrals");
    console.log(`找到 ${agentsWithPT.length} 个持仓代理`);
    for (const agent of agentsWithPT) {
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
      const [deposits, withdrawals, bonuses] = await Promise.all([
        Deposit.aggregate([
          {
            $match: {
              userId: { $in: downlineIds },
              createdAt: { $gte: startOfDay, $lte: endOfDay },
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
        ]),
        Withdraw.aggregate([
          {
            $match: {
              userId: { $in: downlineIds },
              createdAt: { $gte: startOfDay, $lte: endOfDay },
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
        ]),
        Bonus.aggregate([
          {
            $match: {
              userId: { $in: downlineIds },
              createdAt: { $gte: startOfDay, $lte: endOfDay },
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
        ]),
      ]);
      console.log("  Withdrawal data:", JSON.stringify(withdrawals, null, 2));
      console.log("  Bonus data:", JSON.stringify(bonuses, null, 2));
      const downlineData = {};
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
      });

      let totalAgentDeposit = 0;
      let totalAgentWithdraw = 0;
      let totalAgentBonus = 0;
      let formula = `Calculation Date: ${yesterday.format("YYYY-MM-DD")}\n\n`;
      Object.values(downlineData).forEach((data) => {
        totalAgentDeposit += data.totalDeposit;
        totalAgentWithdraw += data.totalWithdraw;
        totalAgentBonus += data.totalBonus;

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
      });
      const netWinlose =
        totalAgentDeposit - totalAgentWithdraw - totalAgentBonus;
      const positionTakingValue = parseFloat(agent.positionTaking) / 100; // 转换为百分比
      const commissionAmount = netWinlose * positionTakingValue;
      formula += `Summary:\n`;
      formula += `  Total Deposit: ${totalAgentDeposit.toFixed(2)}\n`;
      formula += `  Total Withdraw: ${totalAgentWithdraw.toFixed(2)}\n`;
      formula += `  Total Bonus: ${totalAgentBonus.toFixed(2)}\n`;
      formula += `  Net Win/Loss: ${netWinlose.toFixed(2)}\n`;
      formula += `  Position Taking: ${agent.positionTaking}%\n`;
      formula += `  Commission Calculation: ${netWinlose.toFixed(2)} × ${
        agent.positionTaking
      }% = ${commissionAmount.toFixed(2)}\n`;
      console.log(`  总存款: ${totalAgentDeposit.toFixed(2)}`);
      console.log(`  总提款: ${totalAgentWithdraw.toFixed(2)}`);
      console.log(`  总奖金: ${totalAgentBonus.toFixed(2)}`);
      console.log(`  净盈亏: ${netWinlose.toFixed(2)}`);
      console.log(`  持仓比例: ${agent.positionTaking}%`);
      console.log(`  佣金计算: ${commissionAmount.toFixed(2)}`);
      const reportData = {
        agentId: agent._id,
        agentUsername: agent.username,
        agentFullname: agent.fullname,
        totalDeposit: totalAgentDeposit.toFixed(2),
        totalWithdraw: totalAgentWithdraw.toFixed(2),
        totalBonus: totalAgentBonus.toFixed(2),
        netWinlose: netWinlose.toFixed(2),
        positionTaking: agent.positionTaking,
        commission: commissionAmount.toFixed(2),
        status: "unpaid",
        formula: formula,
        remark: `Position Taking calculation for ${yesterday.format(
          "YYYY-MM-DD"
        )}`,
      };
      if (Object.keys(downlineData).length > 0) {
        await AgentPTReport.create(reportData);
        console.log(`  已为代理 ${agent.username} 创建PT报告`);
      } else {
        console.log(`  代理 ${agent.username} 没有下线交易数据，跳过报告创建`);
      }
    }
    console.log("\n======= AGENT PT计算完成 =======");
  } catch (error) {
    console.error("计算Agent PT时出错:", error);
    throw error;
  }
};

// User Get Agent PT Report
router.get("/api/agent-pt-report", authenticateToken, async (req, res) => {
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
    const reports = await AgentPTReport.find(queryFilter).sort({
      createdAt: -1,
    });
    res.json({
      success: true,
      data: reports.map((report) => ({
        agentUsername: report.agentUsername,
        totalDeposit: report.totalDeposit,
        totalWithdraw: report.totalWithdraw,
        totalBonus: report.totalBonus,
        netWinlose: report.netWinlose,
        positionTaking: report.positionTaking,
        commission: report.commission,
        formula: report.formula,
        status: report.status,
        createdAt: report.createdAt,
        remark: report.remark,
      })),
    });
  } catch (error) {
    console.error("Error fetching user PT report:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch PT report",
      error: error.message,
    });
  }
});

// Admin Get Agent Position Taking > 0
router.get(
  "/admin/api/position-taking-users",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const users = await User.find({ positionTaking: { $gt: 0 } })
        .select("username fullname positionTaking wallet viplevel lastLogin")
        .sort({ positionTaking: -1 });
      if (!users || users.length === 0) {
        return res.status(200).json({
          success: true,
          message: {
            en: "No users with position taking found",
            zh: "未找到持仓用户",
          },
          data: [],
        });
      }
      return res.status(200).json({
        success: true,
        message: {
          en: "Position taking users retrieved successfully",
          zh: "成功获取持仓用户数据",
        },
        count: users.length,
        data: users,
      });
    } catch (error) {
      console.error("Error retrieving position taking users:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "Error retrieving position taking users",
          zh: "获取持仓用户数据时发生错误",
        },
        error: error.message,
      });
    }
  }
);

// Admin Update Agent Position Taking
router.put(
  "/admin/api/update-position-taking/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { positionTaking } = req.body;
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $set: { positionTaking } },
        { new: true }
      );
      if (!updatedUser) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "用户不存在",
          },
        });
      }
      const adminId = req.user.userId;
      const admin = await adminUser.findById(adminId);
      console.log(
        `Position taking updated for user ${updatedUser.username} by admin ${admin.username}. New value: ${positionTaking}`
      );
      return res.status(200).json({
        success: true,
        message: {
          en: "Position taking updated successfully",
          zh: "持仓数据更新成功",
        },
        data: {
          username: updatedUser.username,
          positionTaking: updatedUser.positionTaking,
        },
      });
    } catch (error) {
      console.error("Error updating position taking:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "Error updating position taking",
          zh: "更新持仓数据时发生错误",
        },
        error: error.message,
      });
    }
  }
);

// Admin Get Agent Position Downline
router.get(
  "/admin/api/position-taking-downlines/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }
      const directDownlines = await User.find({
        "referralBy.user_id": userId,
      }).select(
        "username createdAt status lastLogin lastdepositdate viplevel totalturnover totaldeposit totalwithdraw email"
      );

      const summary = {
        totalDirect: directDownlines.length,
        totalIndirect: 0,
        totalDownlines: directDownlines.length,
        validUsers: directDownlines.filter((user) => user.totaldeposit > 0)
          .length,
      };

      res.json({
        success: true,
        data: {
          userInfo: {
            username: user.username,
            id: user._id,
          },
          downlines: {
            direct: directDownlines,
            indirect: [],
          },
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

// Admin Get Agent PT Reports
router.get(
  "/admin/api/agent-pt-reports",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate, status } = req.query;
      const query = {};
      if (startDate && endDate) {
        query.createdAt = {
          $gte: moment(new Date(startDate)).startOf("day").utc().toDate(),
          $lte: moment(new Date(endDate)).endOf("day").utc().toDate(),
        };
      }
      if (status && ["paid", "unpaid"].includes(status)) {
        query.status = status;
      }
      const reports = await AgentPTReport.find(query)
        .sort({ createdAt: -1 })
        .populate("agentId", "username fullname");
      res.status(200).json({
        success: true,
        data: reports,
      });
    } catch (error) {
      console.error("获取Agent PT报告时出错:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Failed to fetch Agent PT reports",
          zh: "获取Agent PT报告失败",
        },
      });
    }
  }
);

// Admin Mark Report as Paid
router.post(
  "/admin/api/agent-pt-reports/:reportId/mark-paid",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { reportId } = req.params;

      const report = await AgentPTReport.findById(reportId);
      if (!report) {
        return res.status(404).json({
          success: false,
          message: {
            en: "Report not found",
            zh: "找不到报告",
          },
        });
      }

      if (report.status === "paid") {
        return res.status(200).json({
          success: false,
          message: {
            en: "Report is already paid",
            zh: "报告已经标记为已付款",
          },
        });
      }

      // 更新报告状态
      report.status = "paid";
      await report.save();

      res.status(200).json({
        success: true,
        message: {
          en: "Report marked as paid successfully",
          zh: "报告已成功标记为已付款",
        },
      });
    } catch (error) {
      console.error("标记报告为已付款时出错:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Failed to mark report as paid",
          zh: "标记报告为已付款失败",
        },
      });
    }
  }
);

// Admin Mark Report as Unpaid
router.post(
  "/admin/api/agent-pt-reports/:reportId/mark-unpaid",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { reportId } = req.params;

      const report = await AgentPTReport.findById(reportId);
      if (!report) {
        return res.status(404).json({
          success: false,
          message: {
            en: "Report not found",
            zh: "找不到报告",
          },
        });
      }

      if (report.status === "unpaid") {
        return res.status(200).json({
          success: false,
          message: {
            en: "Report is already unpaid",
            zh: "报告已经标记为未付款",
          },
        });
      }

      // 更新报告状态
      report.status = "unpaid";
      await report.save();

      res.status(200).json({
        success: true,
        message: {
          en: "Report marked as unpaid successfully",
          zh: "报告已成功标记为未付款",
        },
      });
    } catch (error) {
      console.error("标记报告为未付款时出错:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Failed to mark report as unpaid",
          zh: "标记报告为未付款失败",
        },
      });
    }
  }
);

// Admin Mark All Report as Paid
router.post(
  "/admin/api/agent-pt-reports/mark-all-paid",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const result = await AgentPTReport.updateMany(
        { status: "unpaid" },
        { $set: { status: "paid" } }
      );

      res.status(200).json({
        success: true,
        message: {
          en: `${result.modifiedCount} reports have been marked as paid`,
          zh: `已将 ${result.modifiedCount} 份报告标记为已付款`,
        },
      });
    } catch (error) {
      console.error("标记所有报告为已付款时出错:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Failed to mark all reports as paid",
          zh: "标记所有报告为已付款失败",
        },
      });
    }
  }
);

// Manual Calculate Agent PT
router.post(
  "/admin/api/agent-pt/calculate",
  authenticateAdminToken,
  async (req, res) => {
    try {
      await calculateAgentPT();
      res.status(200).json({
        success: true,
        message: {
          en: "Agent PT calculation completed successfully",
          zh: "Agent PT计算已成功完成",
        },
      });
    } catch (error) {
      console.error("手动触发Agent PT计算时出错:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Failed to calculate Agent PT",
          zh: "计算Agent PT失败",
        },
      });
    }
  }
);

router.post("/api/agent-pt/calculate", async (req, res) => {
  try {
    await calculateAgentPT();
    res.status(200).json({
      success: true,
      message: {
        en: "Agent PT calculation completed successfully",
        zh: "Agent PT计算已成功完成",
      },
    });
  } catch (error) {
    console.error("手动触发Agent PT计算时出错:", error);
    res.status(500).json({
      success: false,
      message: {
        en: "Failed to calculate Agent PT",
        zh: "计算Agent PT失败",
      },
    });
  }
});

module.exports = router;
