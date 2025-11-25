const express = require("express");
const moment = require("moment");
const Deposit = require("../models/deposit.model");
const { adminUser } = require("../models/adminuser.model");
const router = express.Router();
const { User, userLog, adminUserWalletLog } = require("../models/users.model");
const { generateToken, setCookie, authenticateToken } = require("../auth/auth");
const Bonus = require("../models/bonus.model");
const { v4: uuidv4 } = require("uuid");
const UserWalletLog = require("../models/userwalletlog.model");
const vip = require("../models/vip.model");

router.get(
  "/api/getusercurrentmonthdeposit",
  authenticateToken,
  async (req, res) => {
    try {
      const currentUser = await User.findById(req.user.userId);
      const currentUsername = currentUser.username;

      // Get the start and end of the current day in GMT+8
      //   const now = moment().tz("Asia/Shanghai");

      const startOfMonth = moment.utc().add(8, "hours").startOf("month");
      const endOfMonth = moment.utc().add(8, "hours").endOf("month");

      // Fetch deposits for the current user for the current day
      const deposits = await Deposit.find({
        username: currentUsername,
        createdAt: {
          $gte: startOfMonth,
          $lte: endOfMonth,
        },
        status: "APPROVED", // Considering only approved deposits
        reverted: false,
      });

      // Sum up the deposit amounts
      const totalDeposit = deposits.reduce((acc, deposit) => {
        const amount = deposit.depositAmount || 0;

        return acc + amount;
      }, 0);

      let bonusAmount = 0;

      let targetDeposit = 1000; // Default target deposit
      if (totalDeposit < 1000) {
        targetDeposit = 1000;
        bonusAmount = 0;
      } else if (totalDeposit < 10000) {
        targetDeposit = 10000;
        bonusAmount = 88;
      } else if (totalDeposit < 50000) {
        targetDeposit = 50000;
        bonusAmount = 188;
      } else if (totalDeposit < 100000) {
        targetDeposit = 100000;
        bonusAmount = 888;
      } else if (totalDeposit < 1000000) {
        targetDeposit = 1000000;
        bonusAmount = 1888;
      } else {
        targetDeposit = 1000000; // Highest target deposit
        bonusAmount = 8888;
      }

      return res.status(200).json({
        authorized: true,
        totalDeposit: totalDeposit,
        targetDeposit: targetDeposit,
        bonusAmount: bonusAmount,
      });
    } catch (error) {
      console.error("Error in getusercurrentdaydeposit:", error);
      return res
        .status(500)
        .json({ message: "Internal server error", error: error.message });
    }
  }
);

router.get(
  "/api/getuserlastmonthdeposit",
  authenticateToken,
  async (req, res) => {
    try {
      const currentUser = await User.findById(req.user.userId);
      const currentUsername = currentUser.username;

      // Get the start and end of the current day in GMT+8
      //   const now = moment().tz("Asia/Shanghai");

      const startOfLastMonth = moment
        .utc()
        .add(8, "hours")
        .subtract(1, "month")
        .startOf("month");
      const endOfLastMonth = moment
        .utc()
        .add(8, "hours")
        .subtract(1, "month")
        .endOf("month");

      // Fetch deposits for the current user for the current day
      const deposits = await Deposit.find({
        username: currentUsername,
        createdAt: {
          $gte: startOfLastMonth,
          $lte: endOfLastMonth,
        },
        status: "APPROVED", // Considering only approved deposits
        reverted: false,
      });

      // Sum up the deposit amounts
      const totalDeposit = deposits.reduce((acc, deposit) => {
        const amount = deposit.depositAmount || 0;

        return acc + amount;
      }, 0);

      let bonusAmount = 0;

      let targetDeposit = 1000; // Default target deposit
      if (totalDeposit < 1000) {
        targetDeposit = 1000;
        bonusAmount = 0;
      } else if (totalDeposit < 10000) {
        targetDeposit = 10000;
        bonusAmount = 88;
      } else if (totalDeposit < 50000) {
        targetDeposit = 50000;
        bonusAmount = 188;
      } else if (totalDeposit < 100000) {
        targetDeposit = 100000;
        bonusAmount = 888;
      } else if (totalDeposit < 1000000) {
        targetDeposit = 1000000;
        bonusAmount = 1888;
      } else {
        targetDeposit = 1000000; // Highest target deposit
        bonusAmount = 8888;
      }

      return res.status(200).json({
        authorized: true,
        totalDeposit: totalDeposit,
        targetDeposit: targetDeposit,
        bonusAmount: bonusAmount,
      });
    } catch (error) {
      console.error("Error in getusercurrentdaydeposit:", error);
      return res
        .status(500)
        .json({ message: "Internal server error", error: error.message });
    }
  }
);

router.get(
  "/api/checkVipLevelBonusAmount",
  authenticateToken,
  async (req, res) => {
    try {
      const userId = req.user.userId;
      const user = await User.findById(userId);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const vipDetails = await vip.findOne({ company: user.companyName });

      const vipLevels = vipDetails.vipDetails;
      const currentVipLevelIndex = vipLevels.findIndex(
        (level) => level.name === user.viplevel
      );
      const lastClaimedVipLevelIndex = vipLevels.findIndex(
        (level) => level.name === user.lastClaimedVipLevel
      );

      if (lastClaimedVipLevelIndex < currentVipLevelIndex) {
        const nextUpgradeBonus =
          vipLevels[lastClaimedVipLevelIndex + 1].upgradebonus;
        return res.status(200).json({
          authorized: true,
          complete: false,
          message: "Upgrade bonus available",
          nextUpgradeBonus: nextUpgradeBonus,
          nextVipLevel: vipLevels[lastClaimedVipLevelIndex + 1].name,
        });
      } else {
        return res.status(200).json({
          authorized: true,
          message: "No upgrade available",
          complete: true,
        });
      }
    } catch (error) {
      console.error("Error checking VIP level:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

const calculateDailyDeposits = async (username) => {
  const endOfCurrentMonth = moment.utc().add(8, "hours").endOf("month");
  const startOfLastMonth = moment
    .utc()
    .add(8, "hours")
    .subtract(1, "months")
    .startOf("month");

  const deposits = await Deposit.find({
    username: username,
    createdAt: {
      $gte: startOfLastMonth.toDate(),
      $lte: endOfCurrentMonth.toDate(),
    },
    status: "APPROVED",
    reverted: false,
  });

  // Create an object to hold deposit status for each day
  let depositStatus = {};

  // Initialize depositStatus for each day in the range
  for (
    let m = startOfLastMonth.clone();
    m.isBefore(endOfCurrentMonth);
    m.add(1, "days")
  ) {
    depositStatus[m.format("YYYY-MM-DD")] = false;
  }

  // Mark days with deposits
  deposits.forEach((deposit) => {
    const depositDate = moment(deposit.createdAt).utc().format("YYYY-MM-DD");

    depositStatus[depositDate] = true;
  });

  return depositStatus;
};

// Route to return deposit status for each day
router.get(
  "/api/checkPreviousOneMonthDeposit",
  authenticateToken,
  async (req, res) => {
    try {
      const user = await User.findById(req.user.userId);

      const depositStatus = await calculateDailyDeposits(user.username);

      return res.status(200).json({ authorized: true, depositStatus });
    } catch (error) {
      console.error("Error checking previous months deposits:", error);
      res.status(500).json({ message: "Internal server error." });
    }
  }
);

// Route to return deposit status for each day
router.get(
  "/api/checkTodayAndYesterdayDeposits",
  authenticateToken,
  async (req, res) => {
    const userId = req.user.userId;

    try {
      const user = await User.findById(userId);

      const depositStatus = await calculateDailyDeposits(user.username);

      // const todayDate = moment
      //   .utc()
      //   .add(8, "hours")
      //   .endOf("day")
      //   .format("YYYY-MM-DD");
      // const yesterdayDate = moment
      //   .utc()
      //   .add(8, "hours")
      //   .subtract(1, "days")
      //   .startOf("day")
      //   .format("YYYY-MM-DD");

      const startOfLastWeek = moment
        .utc()
        .add(8, "hours")
        .subtract(1, "week")
        .startOf("isoWeek");
      // .format("YYYY-MM-DD");

      const endOfLastWeek = moment
        .utc()
        .add(8, "hours")
        .subtract(1, "week")
        .endOf("isoWeek");
      // .format("YYYY-MM-DD");

      let allDepositsFound = true;
      let currentDay = startOfLastWeek.clone();

      while (currentDay.isSameOrBefore(endOfLastWeek)) {
        const dateKey = currentDay.format("YYYY-MM-DD");

        if (!depositStatus[dateKey]) {
          allDepositsFound = false;
          break;
        }
        // console.log(allDepositsFound);
        currentDay.add(1, "day");
      }
      // const todayDeposit = depositStatus[startOfLastWeek];
      // const yesterdayDeposit = depositStatus[endOfLastWeek];

      const returnStartOfLastWeek = moment
        .utc()
        .add(8, "hours")
        .subtract(1, "week")
        .startOf("isoWeek")
        .format("DD/MM/YYYY");

      const returnEndOfLastWeek = moment
        .utc()
        .add(8, "hours")
        .subtract(1, "week")
        .endOf("isoWeek")
        .format("DD/MM/YYYY");

      if (allDepositsFound) {
        const bonusAmount = 68;

        return res.json({
          success: true,
          authorized: true,
          message: "Deposits found for today and yesterday.",
          bonusAmount: bonusAmount,
          todayDate: returnStartOfLastWeek,
          yesterdayDate: returnEndOfLastWeek,
        });
      } else {
        return res.json({
          success: false,
          authorized: true,
          message: "No deposits found for both today and yesterday.",
          bonusAmount: 0,
          todayDate: returnStartOfLastWeek,
          yesterdayDate: returnEndOfLastWeek,
        });
      }
    } catch (error) {
      console.error(error);
      res.status(500).json({
        success: false,
        authorized: false,
        message: "An error occurred while checking deposits.",
      });
    }
  }
);

module.exports = router;
