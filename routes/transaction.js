const express = require("express");
const router = express.Router();
const Transaction = require("../models/transaction.model");
const { authenticateAdminToken } = require("../auth/adminAuth");
const { setConnForRequest } = require("../lib/dbContext");
const moment = require("moment");

router.use(async (req, res, next) => {
  try {
    setConnForRequest(req.db);
    const companyId = req.headers["x-company-id"];
    req.companyId = companyId;
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

router.get(
  "/admin/api/transactions/list",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const deposits = await Transaction.find({ type: "deposit" })
        .sort({ createdAt: -1 })
        .limit(5);

      const withdraws = await Transaction.find({ type: "withdraw" })
        .sort({ createdAt: -1 })
        .limit(5);

      res.json({
        success: true,
        data: {
          deposits,
          withdraws,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: {
          en: "Error fetching transaction list",
          zh: "获取交易列表时出错",
        },
        error: error.message,
      });
    }
  }
);

router.put(
  "/admin/api/transactions/list",
  authenticateAdminToken,
  async (req, res) => {
    try {
      setConnForRequest(req.db);
      const { deposits, withdraws } = req.body;
      await Transaction.deleteMany({ type: "deposit" });
      await Transaction.deleteMany({ type: "withdraw" });
      const createdTransactions = [];
      if (deposits && deposits.length > 0) {
        const depositDocs = deposits.slice(0, 5).map((item) => ({
          type: "deposit",
          username: item.username,
          amount: item.amount,
          time: item.time
            ? moment(item.time).utc().toDate()
            : moment().utc().toDate(),
          status: "completed",
        }));
        const savedDeposits = await Transaction.insertMany(depositDocs);
        createdTransactions.push(...savedDeposits);
      }
      if (withdraws && withdraws.length > 0) {
        const withdrawDocs = withdraws.slice(0, 5).map((item) => ({
          type: "withdraw",
          username: item.username,
          amount: item.amount,
          time: item.time
            ? moment(item.time).utc().toDate()
            : moment().utc().toDate(),
          status: "completed",
        }));
        const savedWithdraws = await Transaction.insertMany(withdrawDocs);
        createdTransactions.push(...savedWithdraws);
      }

      res.status(200).json({
        success: true,
        message: {
          en: "Transaction list updated successfully",
          zh: "交易列表更新成功",
        },
        data: createdTransactions,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: {
          en: "Error updating transaction list",
          zh: "更新交易列表时出错",
        },
        error: error.message,
      });
    }
  }
);

module.exports = router;
