const express = require("express");
const router = express.Router();
const kioskbalance = require("../models/kioskbalance.model");
const { authenticateAdminToken } = require("../auth/adminAuth");
const { adminUser } = require("../models/adminuser.model");
const KioskTransactionLog = require("../models/kioskTransactionLog.model");
const moment = require("moment");
const { setConnForRequest } = require("../lib/dbContext");

router.use(async (req, res, next) => {
  try {
    setConnForRequest(req.db);
    await Promise.all([
      kioskbalance.findOne().limit(1),
      KioskTransactionLog.findOne().limit(1),
    ]).catch(() => {});

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

// Get Kiosk Balance Status
router.get("/api/kiosk-status", async (req, res) => {
  try {
    const kioskSettings = await kioskbalance.findOne();
    if (!kioskSettings) {
      return res.status(200).json({
        success: true,
        status: false,
      });
    }
    res.status(200).json({
      success: true,
      status: kioskSettings.status,
    });
  } catch (error) {
    console.error("Error fetching kiosk status:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching kiosk status",
      error: error.message,
    });
  }
});

// Admin Get Kiosk Balance
router.get(
  "/admin/api/kiosk-balance",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const kioskSettings = await kioskbalance.findOne();
      if (!kioskSettings) {
        return res.status(200).json({
          success: true,
          message: {
            en: "Kiosk balance retrieved",
            zh: "游戏终端余额查询成功",
          },
          data: {
            balance: 0,
            status: false,
            minBalance: 0,
          },
        });
      }
      res.status(200).json({
        success: true,
        message: {
          en: "Kiosk balance retrieved",
          zh: "游戏终端余额查询成功",
        },
        data: {
          balance: kioskSettings.balance,
          status: kioskSettings.status,
          minBalance: kioskSettings.minBalance,
        },
      });
    } catch (error) {
      console.error("Error fetching kiosk balance:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error fetching kiosk balance",
          zh: "获取游戏终端余额时出错",
        },
      });
    }
  }
);

// Admin Update Kiosk Balance
router.put(
  "/admin/api/kiosk-balance",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const adminId = req.user.userId;
      const adminuser = await adminUser.findById(adminId);
      if (!adminuser) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Admin User not found, please contact customer service",
            zh: "未找到管理员用户，请联系客户服务",
          },
        });
      }
      if (adminuser.role !== "superadmin") {
        return res.status(200).json({
          success: false,
          message: {
            en: "You do not have permission to perform this action",
            zh: "您没有执行此操作的权限",
          },
        });
      }
      const { operation, amount, remark } = req.body;

      if (typeof amount !== "number") {
        return res.status(200).json({
          success: false,
          message: {
            en: "Amount must be a number",
            zh: "金额必须是数字",
          },
        });
      }
      if (!["add", "subtract"].includes(operation)) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Invalid operation type",
            zh: "无效的操作类型",
          },
        });
      }
      const currentKioskBalance = await kioskbalance.findOne({});
      const currentBalance = currentKioskBalance
        ? currentKioskBalance.balance
        : 0;
      if (operation === "subtract" && amount > currentBalance) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Amount exceeds current balance",
            zh: "金额超过当前余额",
          },
        });
      }
      const newBalance =
        operation === "add" ? currentBalance + amount : currentBalance - amount;
      if (newBalance < 0) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Balance cannot be negative",
            zh: "余额不能为负数",
          },
        });
      }
      const kioskSettings = await kioskbalance.findOneAndUpdate(
        {},
        { balance: newBalance },
        { upsert: true, new: true }
      );

      await KioskTransactionLog.create({
        operation: operation,
        amount: amount,
        username: "-",
        previousBalance: currentBalance,
        newBalance: newBalance,
        transactionType:
          operation === "add" ? "Add Balance" : "Subtract Balance",
        remark: remark || "-",
        processBy: "-",
      });
      res.status(200).json({
        success: true,
        message: {
          en: `${operation === "add" ? "Added" : "Reduced"} $${amount.toFixed(
            4
          )} ${operation === "add" ? "to" : "from"} kiosk balance`,
          zh: `${
            operation === "add" ? "增加" : "减少"
          }了游戏终端余额 $${amount}`,
        },
        data: {
          balance: kioskSettings.balance,
          status: kioskSettings.status,
        },
      });
    } catch (error) {
      console.error("Error updating kiosk balance:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error updating kiosk balance",
          zh: "更新自助服务终端余额时出错",
        },
      });
    }
  }
);

// Admin Update Kiosk Status
router.put(
  "/admin/api/kiosk-status",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const kioskSettings = await kioskbalance.findOne();
      if (!kioskSettings) {
        const newSettings = await kioskbalance.create({
          balance: 0,
          status: true,
        });
        return res.status(200).json({
          success: true,
          message: {
            en: "Kiosk service activated",
            zh: "游戏终端已激活",
          },
          data: {
            balance: newSettings.balance,
            status: newSettings.status,
          },
        });
      }
      kioskSettings.status = !kioskSettings.status;
      await kioskSettings.save();
      res.status(200).json({
        success: true,
        message: {
          en: `Kiosk service is now ${
            kioskSettings.status ? "active" : "inactive"
          }`,
          zh: `游戏终端${kioskSettings.status ? "已激活" : "已停用"}`,
        },
        data: {
          balance: kioskSettings.balance,
          status: kioskSettings.status,
        },
      });
    } catch (error) {
      console.error("Error toggling kiosk status:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error toggling kiosk status",
          zh: "切换自助服务终端状态时出错",
        },
      });
    }
  }
);

// Admin Update Min Balance
router.put(
  "/admin/api/kiosk-min-balance",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { minBalance } = req.body;
      const kioskSettings = await kioskbalance.findOne();
      if (!kioskSettings) {
        const newSettings = new kioskbalance({
          balance: 0,
          status: false,
          minBalance: minBalance,
        });
        await newSettings.save();
      } else {
        kioskSettings.minBalance = minBalance;
        await kioskSettings.save();
      }
      res.status(200).json({
        success: true,
        message: {
          en: "Minimum balance updated successfully",
          zh: "最小余额更新成功",
        },
      });
    } catch (error) {
      console.error("Error updating kiosk minimum balance:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error updating minimum balance",
          zh: "更新最小余额时出错",
        },
      });
    }
  }
);

// Admin Get Kiosk Transaction Logs
router.get(
  "/admin/api/kiosk-transaction-logs",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const dateFilter = {};

      if (startDate && endDate) {
        dateFilter.date = {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        };
      }

      const logs = await KioskTransactionLog.find(dateFilter).sort({
        date: -1,
      });

      res.status(200).json({
        success: true,
        data: logs,
      });
    } catch (error) {
      console.error("Error fetching kiosk transaction logs:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching kiosk transaction logs",
        error: error.message,
      });
    }
  }
);

module.exports = router;
