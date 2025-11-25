const express = require("express");
const router = express.Router();
const BankTransactionLog = require("../models/banktransactionlog.model");
const Withdraw = require("../models/withdraw.model");
const Deposit = require("../models/deposit.model");
const Bonus = require("../models/bonus.model");
const UserWalletCashOut = require("../models/userwalletcashout.model");
const { authenticateAdminToken } = require("../auth/adminAuth");
const moment = require("moment");

// Admin Get Bank Transaction Log
router.get(
  "/admin/api/banktransactionlog",
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
      const banktransactionlog = await BankTransactionLog.find({
        ...dateFilter,
      }).sort({
        createdAt: -1,
      });
      res.status(200).json({
        success: true,
        message: "Bank transaction log retrieved successfully",
        data: banktransactionlog,
      });
    } catch (error) {
      console.error(
        "Error occurred while retrieving bank transaction log:",
        error
      );
      res
        .status(200)
        .json({ message: "Internal server error", error: error.message });
    }
  }
);

//Admin get Transaction Log
router.get(
  "/admin/api/transactionlog",
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
      const queryCondition = {
        status: { $in: ["approved", "rejected", "reverted"] },
        ...dateFilter,
      };
      const [deposits, withdraws, bonuses, usercashout] = await Promise.all([
        Deposit.find(queryCondition)
          .select(
            "username fullname bankname ownername transfernumber method transactionType amount status remark imageUrl createdAt processBy processtime _id reverted duplicateIP"
          )
          .lean(),
        Withdraw.find(queryCondition)
          .select(
            "username fullname bankname ownername transfernumber method transactionType amount status remark imageUrl createdAt processBy processtime _id reverted duplicateIP"
          )
          .lean(),
        Bonus.find(queryCondition)
          .select(
            "username fullname promotionnameEN method transactionType amount status remark createdAt processBy processtime _id reverted imageUrl imageUrls duplicateIP"
          )
          .lean(),
        UserWalletCashOut.find(queryCondition)
          .select(
            "username fullname transactionId walletType transactionType amount status remark method processBy reverted revertedProcessBy createdAt _id duplicateIP"
          )
          .lean(),
      ]);
      const formatTransaction = (transaction, type) => {
        const commonFields = {
          _id: transaction._id,
          username: transaction.username,
          fullname: transaction.fullname,
          method: transaction.method,
          transactionType: transaction.transactionType,
          amount: transaction.amount,
          status: transaction.status,
          remark: transaction.remark,
          createdAt: transaction.createdAt,
          processBy: transaction.processBy,
          processtime: transaction.processtime,
          reverted: transaction.reverted,
          duplicateIP: transaction.duplicateIP,
        };
        if (type === "bonus") {
          return {
            ...commonFields,
            promotionnameEN: transaction.promotionnameEN,
            imageUrl: transaction.imageUrl,
            imageUrls: transaction.imageUrls,
          };
        } else if (type === "walletCashout") {
          return {
            ...commonFields,
            walletType: transaction.walletType,
            revertedProcessBy: transaction.revertedProcessBy,
          };
        } else {
          return {
            ...commonFields,
            bankname: transaction.bankname,
            ownername: transaction.ownername,
            transfernumber: transaction.transfernumber,
            imageUrl: transaction.imageUrl,
          };
        }
      };
      const formattedTransactions = [
        ...deposits.map((d) => formatTransaction(d, "deposit")),
        ...withdraws.map((w) => formatTransaction(w, "withdraw")),
        ...bonuses.map((b) => formatTransaction(b, "bonus")),
        ...usercashout.map((b) => formatTransaction(b, "bonus")),
      ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      res.status(200).json({
        success: true,
        message: "Filtered transactions fetched successfully",
        data: formattedTransactions,
      });
    } catch (error) {
      console.error("Error fetching filtered transactions:", error);
      res.status(200).json({
        success: false,
        message: "Error fetching filtered transactions",
        error: error.toString(),
      });
    }
  }
);

module.exports = router;
