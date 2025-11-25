const express = require("express");
const bcrypt = require("bcrypt");
const { adminUser, adminLog } = require("../models/adminuser.model");
const { User, userLog } = require("../models/users.model");
const adminList = require("../models/adminlist.model");
const vip = require("../models/vip.model");
const Withdraw = require("../models/withdraw.model");
const Deposit = require("../models/deposit.model");
const BankList = require("../models/banklist.model");
const BankTransactionLog = require("../models/banktransactionlog.model");
const Bonus = require("../models/bonus.model");
const FaqData = require("../models/faq.model");
const Promotion = require("../models/promotion.model");
const WhitelistIP = require("../models/whitelistip.model");
const { setConnForRequest } = require("../lib/dbContext");
const router = express.Router();
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const { roles, modulePermissions } = require("../constants/permissions");
const {
  RecaptchaEnterpriseServiceClient,
} = require("@google-cloud/recaptcha-enterprise");
const moment = require("moment-timezone");
const rateLimit = require("express-rate-limit");
const loginLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1小时
  max: 30, // 限制每个IP在1小时内最多30次尝试
  message: "Too many requests, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: false,
  skipSuccessfulRequests: false,
  handler: (req, res, next, options) => {
    const clientIp = req.headers["x-forwarded-for"] || req.ip;
    const clientIpTrimmed = clientIp.split(",")[0].trim();
    const origin = req.headers.origin || "Unknown";

    console.log(
      `Login Rate Limit Exceeded - IP: ${clientIpTrimmed}, Origin: ${origin}, Path: ${
        req.path
      }, Time: ${new Date().toISOString()}`
    );

    res.status(options.statusCode).send(options.message);
  },
});
// const jwt = require("jsonwebtoken");

const {
  generateToken,
  generateRefreshToken,
  authenticateAdminToken,
  handleLoginSuccess,
} = require("../auth/adminAuth");

// Helper function to log login attempts
// async function logAttempt(username, fullname, clientIp, remark) {
//   await adminLog.create({
//     username,
//     fullname,
//     ip: clientIp,
//     remark,
//   });
// }
async function logAttempt(username, fullname, clientIp, remark) {
  try {
    if (fullname === "-") {
      await adminLog.create({
        username,
        fullname,
        ip: clientIp,
        remark,
      });
      return;
    }
    const user = await adminUser.findOne({ username });
    if (!user || user.role !== "superadmin") {
      await adminLog.create({
        username,
        fullname,
        ip: clientIp,
        remark,
      });
    }
  } catch (error) {
    console.error("Error in logAttempt:", error);
  }
}

// Helper function to convert time strings "HH MM SS" to seconds
function convertTimeToSeconds(processtime) {
  const parts = processtime.split(" ");
  const hours = parseInt(parts[0].replace("H", ""), 10);
  const minutes = parseInt(parts[1].replace("M", ""), 10);
  const seconds = parseInt(parts[2].replace("S", ""), 10);
  return hours * 3600 + minutes * 60 + seconds;
}

// Helper function to format seconds into "HH MM SS"
function formatTimeFromSeconds(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours.toString().padStart(2, "0")}H ${minutes
    .toString()
    .padStart(2, "0")}M ${secs.toString().padStart(2, "0")}S`;
}

async function verifyRecaptcha(token) {
  const client = new RecaptchaEnterpriseServiceClient({
    keyFilename: "./config/google-credentials.json",
  });
  const projectID = "emtech168-1735545760936";
  const recaptchaKey = "6LdfhakqAAAAAOosjyCGQ8EyriEVzn6EoK55wrLO";
  const projectPath = client.projectPath(projectID);
  try {
    const request = {
      assessment: {
        event: {
          token: token,
          siteKey: recaptchaKey,
        },
      },
      parent: projectPath,
    };
    const [response] = await client.createAssessment(request);
    if (!response.tokenProperties.valid) {
      console.log(`Token invalid: ${response.tokenProperties.invalidReason}`);
      return false;
    }
    const score = response.riskAnalysis.score;
    return score > 0.5;
  } catch (error) {
    console.error("reCAPTCHA verification failed:", error);
    return false;
  }
}

function parseTimeToSeconds(timeString) {
  if (!timeString || timeString === "PENDING") return 0;
  if (timeString.includes(":")) {
    const parts = timeString.split(":").map(Number);
    if (parts.length === 3) {
      const [hours, minutes, seconds] = parts;
      return hours * 3600 + minutes * 60 + seconds;
    } else if (parts.length === 2) {
      const [minutes, seconds] = parts;
      return minutes * 60 + seconds;
    }
  }
  let totalSeconds = 0;
  const hourMatch = timeString.match(/(\d+)h/);
  if (hourMatch) totalSeconds += parseInt(hourMatch[1]) * 3600;
  const minuteMatch = timeString.match(/(\d+)m/);
  if (minuteMatch) totalSeconds += parseInt(minuteMatch[1]) * 60;
  const secondMatch = timeString.match(/(\d+)s/);
  if (secondMatch) totalSeconds += parseInt(secondMatch[1]);
  return totalSeconds;
}

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return "00:00:00";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0"
  )}:${String(secs).padStart(2, "0")}`;
}

router.use(express.json());
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

// Get All Admin Users
router.get(
  "/admin/api/adminusers",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const users = await adminUser.find(
        { role: { $ne: "superadmin" } },
        { password: 0 }
      );
      res.status(200).json({
        success: true,
        message: "Admin users retrieved successfully",
        data: users,
      });
    } catch (error) {
      console.error("Error occurred while retrieving admin users:", error);
      res.status(200).json({
        success: false,
        message: "Internal server error",
        error: error.toString(),
      });
    }
  }
);

// Create Admin User
router.post(
  "/admin/api/createadminuser",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { username, password, fullname, role, permissions } = req.body;
      const existingUser = await adminUser.findOne({ username });
      if (existingUser) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Username already exists",
            zh: "用户名已存在",
          },
        });
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = await adminUser.create({
        username,
        password: hashedPassword,
        fullname,
        role,
        permissions,
        status: true,
      });
      const userData = newUser.toObject();
      delete userData.password;
      res.status(200).json({
        success: true,
        message: {
          en: "Admin user created successfully",
          zh: "管理员用户创建成功",
        },
        data: userData,
      });
    } catch (error) {
      console.error("Error occurred while creating admin user:", error);
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

// Update Admin User
router.patch(
  "/admin/api/updateadminuser/:id",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { username, fullname, role, permissions, status } = req.body;
      const updateData = {
        username,
        fullname,
        role,
        permissions,
        status,
      };
      if (req.body.password) {
        updateData.password = await bcrypt.hash(req.body.password, 10);
      }
      const updatedUser = await adminUser
        .findByIdAndUpdate(id, updateData, { new: true })
        .select("-password");
      if (!updatedUser) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Admin user not found",
            zh: "找不到管理员用户",
          },
        });
      }
      res.status(200).json({
        success: true,
        message: {
          en: "Admin user updated successfully",
          zh: "管理员用户更新成功",
        },
        data: updatedUser,
      });
    } catch (error) {
      console.error("Error occurred while updating admin user:", error);
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

// Delete Admin User
router.delete(
  "/admin/api/deleteadminuser/:id",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const deletedUser = await adminUser
        .findByIdAndDelete(req.params.id)
        .select("-password");

      if (!deletedUser) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Admin user not found",
            zh: "未找到管理员用户",
          },
        });
      }
      res.status(200).json({
        success: true,
        message: {
          en: "Admin user deleted successfully",
          zh: "管理员用户删除成功",
        },
        data: deletedUser,
      });
    } catch (error) {
      console.error("Error occurred while deleting admin user:", error);
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

// Update Admin User Status
router.patch(
  "/admin/api/updateadminuserstatus",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { id, status } = req.body;
      const updatedUser = await adminUser
        .findByIdAndUpdate(id, { status }, { new: true })
        .select("-password");

      if (!updatedUser) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Admin user not found",
            zh: "未找到管理员用户",
          },
        });
      }
      res.status(200).json({
        success: true,
        message: {
          en: "Admin user status updated successfully",
          zh: "管理员用户状态更新成功",
        },
        data: updatedUser,
      });
    } catch (error) {
      console.error("Error occurred while updating admin user status:", error);
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

// Get Admin Roles & Permissions
router.get(
  "/admin/api/permissions-config",
  authenticateAdminToken,
  async (req, res) => {
    try {
      res.status(200).json({
        success: true,
        data: {
          roles,
          modulePermissions,
        },
      });
    } catch (error) {
      res.status(200).json({
        success: false,
        message: "Failed to get permissions config",
      });
    }
  }
);

// Refresh Token
router.post("/admin/api/refresh-token", async (req, res) => {
  const authHeader = req.headers["authorization"];
  const refreshToken = authHeader && authHeader.split(" ")[1];
  if (!refreshToken) {
    return res.status(401).json({ message: "Refresh token not provided" });
  }
  try {
    const decoded = jwt.verify(
      refreshToken,
      process.env.ADMIN_REFRESH_TOKEN_SECRET
    );
    const newToken = await generateToken(decoded.userId);
    res.json({
      success: true,
      token: newToken,
    });
  } catch (error) {
    res.status(401).json({ message: "Invalid refresh token" });
  }
});

// Admin Login
router.post("/admin/api/login", loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  let clientIp = req.headers["x-forwarded-for"] || req.ip;
  clientIp = clientIp.split(",")[0].trim();
  try {
    const user = await adminUser.findOne({ username });
    if (!user) {
      await logAttempt(
        username,
        "-",
        clientIp,
        `Invalid Login: Wrong Username Attempted: ${username}`
      );
      return res.status(200).json({
        message:
          "Login unsuccessful. Please ensure your details are correct and try again or contact customer service for assistance!",
      });
    }
    if (user.role !== "superadmin" && user.role !== "admin") {
      const whitelistDocs = await WhitelistIP.find({});
      const whitelistedIPs = whitelistDocs.reduce((acc, doc) => {
        return [...acc, ...doc.ips];
      }, []);

      if (!whitelistedIPs.includes(clientIp)) {
        await logAttempt(
          user.username,
          user.fullname,
          clientIp,
          "Invalid Login: IP not whitelisted"
        );
        return res.status(200).json({
          success: false,
          message:
            "Access denied: Your IP is not whitelisted. Please contact administrator.",
          swal: {
            title: "Access Denied",
            text: "Your IP is not whitelisted. Please contact administrator.",
            icon: "error",
          },
        });
      }
    }
    const isPasswordCorrect = await bcrypt.compare(password, user.password);
    if (!isPasswordCorrect) {
      await logAttempt(
        user.username,
        user.fullname,
        clientIp,
        "Invalid Login: Wrong Password Attempted"
      );
      return res.status(200).json({
        message:
          "Login unsuccessful. Please ensure your details are correct and try again or contact customer service for assistance!",
      });
    }
    if (user.status === false) {
      await logAttempt(
        user.username,
        user.fullname,
        clientIp,
        "Invalid Login: Account Is Inactive"
      );
      return res.status(200).json({
        message:
          "Login unsuccessful. Your account is currently inactive. For reactivation or further assistance, please contact customer service!",
      });
    }
    user.lastLoginIp = clientIp;
    user.lastLogin = Date.now();
    await user.save();
    const { token, refreshToken } = await handleLoginSuccess(user._id);
    await logAttempt(user.username, user.fullname, clientIp, "Login Success");
    res.status(200).json({
      authorized: true,
      token,
      refreshToken,
      message: "Login Success!",
    });
  } catch (error) {
    console.log("Error occurred:", error.message);
    res.status(200).json({
      message: "Internal server error",
      swal: {
        title: "Error",
        text: "An error occurred during login",
        icon: "error",
      },
    });
  }
});

//Logout Admin
router.post("/admin/api/logout", authenticateAdminToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const adminuser = await adminUser.findById(userId);
    if (!adminuser) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Admin User not found, please contact customer service",
          zh: "找不到管理员用户，请联系客服",
        },
      });
    }
    let clientIp =
      req.headers["x-forwarded-for"] || req.connection.remoteAddress;
    clientIp = clientIp.split(",")[0].trim();
    await logAttempt(
      adminuser.username,
      adminuser.fullname,
      clientIp,
      "Logout Success"
    );
    res.status(200).json({
      success: true,
      message: {
        en: "Logout Success",
        zh: "退出登录成功",
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: {
        en: "Internal server error",
        zh: "服务器内部错误",
      },
    });
  }
});

// Admin Auth Check
router.get(
  "/admin/api/auth/check",
  authenticateAdminToken,
  async (req, res) => {
    const userId = req.user.userId;
    const adminuser = await adminUser.findById(userId);
    if (!adminuser) {
      return res.status(404).json({
        message: "Admin User not found, please contact customer service",
      });
    }
    return res.json({
      authorized: true,
      message: "Token is valid",
      adminuser,
    });
  }
);

// Get Total User
router.get("/admin/api/totaluser", authenticateAdminToken, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    return res.status(200).json({
      success: true,
      totalUsers,
      message: "Successfully retrieved total user count",
    });
  } catch (error) {
    console.error("Error while getting total user count:", error);
    return res.status(500).json({
      success: false,
      message: "Error while getting total user count",
      error: error.message,
    });
  }
});

//Get Count of Pending Transaction
router.get(
  "/admin/api/count/pendingtransaction",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const depositPromise = Deposit.aggregate([
        { $match: { status: "pending" } },
        { $group: { _id: null, count: { $sum: 1 } } },
      ]);

      const withdrawalPromise = Withdraw.aggregate([
        { $match: { status: "pending" } },
        { $group: { _id: null, count: { $sum: 1 } } },
      ]);

      const bonusPromise = Bonus.aggregate([
        { $match: { status: "pending" } },
        { $group: { _id: null, count: { $sum: 1 } } },
      ]);

      const [deposits, withdrawals, bonus] = await Promise.all([
        depositPromise,
        withdrawalPromise,
        bonusPromise,
      ]);

      const summary = {
        deposits: deposits.length > 0 ? deposits[0].count : 0,
        withdrawals: withdrawals.length > 0 ? withdrawals[0].count : 0,
        bonus: bonus.length > 0 ? bonus[0].count : 0,
      };

      res.status(200).json({ success: true, summary });
    } catch (error) {
      console.error("Error fetching pending transactions:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

//Get Last 7 Days Summary
router.get(
  "/admin/api/lastsevendaysummary",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const today = moment().tz("Asia/Kuala_Lumpur").endOf("day").toDate();
      const sevenDaysAgo = moment()
        .tz("Asia/Kuala_Lumpur")
        .subtract(6, "days")
        .startOf("day")
        .toDate();

      function convertTimeToSeconds(time) {
        if (!time || typeof time !== "string") return 0;
        const [hours, minutes, seconds] = time.split(":").map(Number);
        return (hours || 0) * 3600 + (minutes || 0) * 60 + (seconds || 0);
      }

      function formatTimeFromSeconds(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
          2,
          "0"
        )}:${String(remainingSeconds).padStart(2, "0")}`;
      }

      const depositsPromise = Deposit.aggregate([
        {
          $match: {
            createdAt: { $gte: sevenDaysAgo, $lte: today },
            status: "approved",
            reverted: false,
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$createdAt",
                timezone: "+08:00",
              },
            },
            totalCount: { $sum: 1 },
            totalAmount: { $sum: "$amount" },
            processTimes: { $push: "$processtime" },
          },
        },
      ]);

      const withdrawalsPromise = Withdraw.aggregate([
        {
          $match: {
            createdAt: { $gte: sevenDaysAgo, $lte: today },
            status: "approved",
            reverted: false,
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$createdAt",
                timezone: "+08:00",
              },
            },
            totalCount: { $sum: 1 },
            totalAmount: { $sum: "$amount" },
            processTimes: { $push: "$processtime" },
          },
        },
      ]);

      const [deposits, withdrawals] = await Promise.all([
        depositsPromise,
        withdrawalsPromise,
      ]);

      const dateMap = {};
      for (let day = 0; day <= 6; day++) {
        const dateStr = moment(sevenDaysAgo)
          .tz("Asia/Kuala_Lumpur")
          .add(day, "days")
          .format("YYYY-MM-DD");

        dateMap[dateStr] = {
          deposits: {
            totalCount: 0,
            totalAmount: 0,
            averageProcessingTime: "00:00:00",
          },
          withdrawals: {
            totalCount: 0,
            totalAmount: 0,
            averageProcessingTime: "00:00:00",
          },
        };
      }

      function processSummaryData(data, type) {
        let totalCount = 0;
        let totalAmount = 0;
        let totalSeconds = 0;
        let validTimes = 0;

        data.forEach((day) => {
          if (dateMap[day._id]) {
            dateMap[day._id][type].totalCount = day.totalCount;
            dateMap[day._id][type].totalAmount = day.totalAmount;

            day.processTimes.forEach((time) => {
              if (time !== "PENDING" && time !== "N/A") {
                totalSeconds += convertTimeToSeconds(time);
                validTimes++;
              }
            });

            dateMap[day._id][type].averageProcessingTime =
              validTimes > 0
                ? formatTimeFromSeconds(totalSeconds / validTimes)
                : "00H 00M 00S";
          }

          totalCount += day.totalCount;
          totalAmount += day.totalAmount;
        });

        return {
          totalCount,
          totalAmount,
          averageProcessingTime:
            validTimes > 0
              ? formatTimeFromSeconds(totalSeconds / validTimes)
              : "00H 00M 00S",
        };
      }

      const depositSummary = processSummaryData(deposits, "deposits");
      const withdrawalSummary = processSummaryData(withdrawals, "withdrawals");

      res.status(200).json({
        success: true,
        summary: dateMap,
        totalDeposits: depositSummary.totalAmount,
        totalWithdrawals: withdrawalSummary.totalAmount,
        totalDepositCount: depositSummary.totalCount,
        totalWithdrawalCount: withdrawalSummary.totalCount,
        averageDepositProcessingTime: depositSummary.averageProcessingTime,
        averageWithdrawProcessingTime: withdrawalSummary.averageProcessingTime,
      });
    } catch (error) {
      console.error("Error fetching 7-day summary:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

// Get All Staff
router.get("/admin/api/allstaff", authenticateAdminToken, async (req, res) => {
  try {
    const allstaff = await adminUser
      .find({ role: "staff" })
      .select("-password")
      .sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      allstaff: allstaff,
    });
  } catch (error) {
    console.error("Error fetching all staff:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Admin Get User Logs
router.get(
  "/admin/api/adminuserlogs",
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
      const adminId = req.user.userId;
      const admin = await adminUser.findById(adminId);
      if (!admin) {
        console.log("Admin user not found:", adminId);
        return res.status(404).json({
          success: false,
          message: "Admin user not found",
        });
      }

      const logs = await adminLog
        .find({
          ...dateFilter,
        })
        .sort({ createdAt: -1 });

      res.status(200).json({
        success: true,
        message: "User logs retrieved successfully",
        data: logs,
      });
    } catch (error) {
      console.error("Error retrieving user logs:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve user logs",
        error: error.message,
      });
    }
  }
);

const calculateAvgHandlingTime = async (username, dateFilter) => {
  const transactions = await Promise.all([
    Deposit.find(
      { processBy: username, status: { $ne: "pending" }, ...dateFilter },
      "createdAt processtime"
    ),
    Withdraw.find(
      { processBy: username, status: { $ne: "pending" }, ...dateFilter },
      "createdAt processtime"
    ),
    Bonus.find(
      { processBy: username, status: { $ne: "pending" }, ...dateFilter },
      "createdAt processtime"
    ),
  ]);
  const allTransactions = transactions.flat();
  if (allTransactions.length === 0) return "00:00:00";
  const totalSeconds = allTransactions.reduce((acc, transaction) => {
    if (!transaction.processtime) return acc;
    const [hours, minutes, seconds] = transaction.processtime
      .split(":")
      .map(Number);
    const totalSeconds = hours * 3600 + minutes * 60 + seconds;
    return acc + totalSeconds;
  }, 0);
  const avgSeconds = totalSeconds / allTransactions.length;
  const hours = Math.floor(avgSeconds / 3600);
  const minutes = Math.floor((avgSeconds % 3600) / 60);
  const seconds = Math.floor(avgSeconds % 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0"
  )}:${String(seconds).padStart(2, "0")}`;
};

// Get Admin Report
router.get(
  "/admin/api/allAdminStats",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const admins = await adminUser.find({ role: "staff" });
      const dateFilter = {};
      if (startDate && endDate) {
        dateFilter.createdAt = {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        };
      }

      const [depositStats, withdrawStats, bonusStats, cashStats] =
        await Promise.all([
          Deposit.aggregate([
            {
              $match: {
                processBy: { $in: admins.map((a) => a.username) },
                ...dateFilter,
              },
            },
            {
              $group: {
                _id: "$processBy",
                approvedQty: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $eq: ["$status", "approved"] },
                          { $eq: ["$reverted", false] },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                rejectedQty: {
                  $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] },
                },
                revertedQty: {
                  $sum: { $cond: [{ $eq: ["$reverted", true] }, 1, 0] },
                },
                approvedAmount: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $eq: ["$status", "approved"] },
                          { $eq: ["$reverted", false] },
                        ],
                      },
                      "$amount",
                      0,
                    ],
                  },
                },
                processTimes: {
                  $push: {
                    $cond: [
                      {
                        $and: [
                          { $in: ["$status", ["approved", "rejected"]] },
                          { $ne: ["$processtime", "PENDING"] },
                          { $ne: ["$processtime", null] },
                        ],
                      },
                      "$processtime",
                      null,
                    ],
                  },
                },
              },
            },
          ]),
          Withdraw.aggregate([
            {
              $match: {
                processBy: { $in: admins.map((a) => a.username) },
                ...dateFilter,
              },
            },
            {
              $group: {
                _id: "$processBy",
                approvedQty: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $eq: ["$status", "approved"] },
                          { $eq: ["$reverted", false] },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                rejectedQty: {
                  $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] },
                },
                revertedQty: {
                  $sum: { $cond: [{ $eq: ["$reverted", true] }, 1, 0] },
                },
                approvedAmount: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $eq: ["$status", "approved"] },
                          { $eq: ["$reverted", false] },
                        ],
                      },
                      "$amount",
                      0,
                    ],
                  },
                },
                processTimes: {
                  $push: {
                    $cond: [
                      {
                        $and: [
                          { $in: ["$status", ["approved", "rejected"]] },
                          { $ne: ["$processtime", "PENDING"] },
                          { $ne: ["$processtime", null] },
                        ],
                      },
                      "$processtime",
                      null,
                    ],
                  },
                },
              },
            },
          ]),
          Bonus.aggregate([
            {
              $match: {
                processBy: { $in: admins.map((a) => a.username) },
                ...dateFilter,
              },
            },
            {
              $group: {
                _id: "$processBy",
                approvedQty: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $eq: ["$status", "approved"] },
                          { $eq: ["$reverted", false] },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                rejectedQty: {
                  $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] },
                },
                revertedQty: {
                  $sum: { $cond: [{ $eq: ["$reverted", true] }, 1, 0] },
                },
                approvedAmount: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $eq: ["$status", "approved"] },
                          { $eq: ["$reverted", false] },
                        ],
                      },
                      "$amount",
                      0,
                    ],
                  },
                },
                processTimes: {
                  $push: {
                    $cond: [
                      {
                        $and: [
                          { $in: ["$status", ["approved", "rejected"]] },
                          { $ne: ["$processtime", "PENDING"] },
                          { $ne: ["$processtime", null] },
                        ],
                      },
                      "$processtime",
                      null,
                    ],
                  },
                },
              },
            },
          ]),
          BankTransactionLog.aggregate([
            {
              $match: {
                processby: { $in: admins.map((a) => a.username) },
                ...dateFilter,
              },
            },
            {
              $group: {
                _id: "$processby",
                totalCashIn: {
                  $sum: {
                    $cond: [
                      { $eq: [{ $toLower: "$transactiontype" }, "cashin"] },
                      "$amount",
                      0,
                    ],
                  },
                },
                totalCashOut: {
                  $sum: {
                    $cond: [
                      { $eq: [{ $toLower: "$transactiontype" }, "cashout"] },
                      "$amount",
                      0,
                    ],
                  },
                },
              },
            },
          ]),
        ]);
      const calculateAvgTime = (processTimes) => {
        if (!processTimes || processTimes.length === 0) return "00:00:00";
        const validTimes = processTimes.filter((t) => t !== null);
        if (validTimes.length === 0) return "00:00:00";
        const totalSeconds = validTimes.reduce((sum, time) => {
          const seconds = parseTimeToSeconds(time);
          return sum + (isNaN(seconds) ? 0 : seconds);
        }, 0);
        const avgSeconds = totalSeconds / validTimes.length;
        return formatTime(avgSeconds);
      };
      const depositMap = new Map(depositStats.map((s) => [s._id, s]));
      const withdrawMap = new Map(withdrawStats.map((s) => [s._id, s]));
      const bonusMap = new Map(bonusStats.map((s) => [s._id, s]));
      const cashMap = new Map(cashStats.map((s) => [s._id, s]));
      const adminStats = admins.map((admin) => {
        const depositData = depositMap.get(admin.username);
        const withdrawData = withdrawMap.get(admin.username);
        const bonusData = bonusMap.get(admin.username);
        return {
          username: admin.username,
          lastLoginIP: admin.lastLoginIp || "N/A",
          avgDepositTime: calculateAvgTime(depositData?.processTimes),
          avgWithdrawTime: calculateAvgTime(withdrawData?.processTimes),
          avgBonusTime: calculateAvgTime(bonusData?.processTimes),
          stats: {
            deposit: {
              approvedQty: depositData?.approvedQty || 0,
              rejectedQty: depositData?.rejectedQty || 0,
              revertedQty: depositData?.revertedQty || 0,
              approvedAmount: depositData?.approvedAmount || 0,
            },
            withdraw: {
              approvedQty: withdrawData?.approvedQty || 0,
              rejectedQty: withdrawData?.rejectedQty || 0,
              revertedQty: withdrawData?.revertedQty || 0,
              approvedAmount: withdrawData?.approvedAmount || 0,
            },
            bonus: {
              approvedQty: bonusData?.approvedQty || 0,
              rejectedQty: bonusData?.rejectedQty || 0,
              revertedQty: bonusData?.revertedQty || 0,
              approvedAmount: bonusData?.approvedAmount || 0,
            },
            cash: {
              totalCashIn: cashMap.get(admin.username)?.totalCashIn || 0,
              totalCashOut: cashMap.get(admin.username)?.totalCashOut || 0,
            },
          },
        };
      });
      const totals = adminStats.reduce(
        (acc, admin) => ({
          deposit: {
            approvedQty:
              acc.deposit.approvedQty + admin.stats.deposit.approvedQty,
            rejectedQty:
              acc.deposit.rejectedQty + admin.stats.deposit.rejectedQty,
            revertedQty:
              acc.deposit.revertedQty + admin.stats.deposit.revertedQty,
            approvedAmount:
              acc.deposit.approvedAmount + admin.stats.deposit.approvedAmount,
          },
          withdraw: {
            approvedQty:
              acc.withdraw.approvedQty + admin.stats.withdraw.approvedQty,
            rejectedQty:
              acc.withdraw.rejectedQty + admin.stats.withdraw.rejectedQty,
            revertedQty:
              acc.withdraw.revertedQty + admin.stats.withdraw.revertedQty,
            approvedAmount:
              acc.withdraw.approvedAmount + admin.stats.withdraw.approvedAmount,
          },
          bonus: {
            approvedQty: acc.bonus.approvedQty + admin.stats.bonus.approvedQty,
            rejectedQty: acc.bonus.rejectedQty + admin.stats.bonus.rejectedQty,
            revertedQty: acc.bonus.revertedQty + admin.stats.bonus.revertedQty,
            approvedAmount:
              acc.bonus.approvedAmount + admin.stats.bonus.approvedAmount,
          },
          cash: {
            totalCashIn: acc.cash.totalCashIn + admin.stats.cash.totalCashIn,
            totalCashOut: acc.cash.totalCashOut + admin.stats.cash.totalCashOut,
          },
        }),
        {
          deposit: {
            approvedQty: 0,
            rejectedQty: 0,
            revertedQty: 0,
            approvedAmount: 0,
          },
          withdraw: {
            approvedQty: 0,
            rejectedQty: 0,
            revertedQty: 0,
            approvedAmount: 0,
          },
          bonus: {
            approvedQty: 0,
            rejectedQty: 0,
            revertedQty: 0,
            approvedAmount: 0,
          },
          cash: { totalCashIn: 0, totalCashOut: 0 },
        }
      );

      res.status(200).json({
        success: true,
        message: "Stats retrieved successfully",
        data: {
          adminStats,
          totals,
        },
      });
    } catch (error) {
      console.error("Error generating admin stats:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.toString(),
      });
    }
  }
);

//来更新当前登录Admin的账号
router.patch("/api/updatemyadmin", authenticateAdminToken, async (req, res) => {
  const updates = req.body;
  try {
    // Fetch the admin to update
    const adminToUpdate = await adminUser.findById(req.user.userId);

    // Check for password update and hash it if present
    if (updates.password) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(updates.password, salt);
      updates.password = hashedPassword;
    }

    // Update the admin with the new data
    Object.keys(updates).forEach((key) => {
      // Allow 'role' field update only if the current user's role is 'Owner'
      if (key === "role" && adminToUpdate.role !== "Owner") {
        return res.status(200).send({
          message:
            "Role update failed. Only owner have the authorization to modify roles!",
        });
      }
      // Exclude any fields that should not be updated directly
      if (key !== "company") {
        // Assuming 'company' field should not be directly updated as well
        adminToUpdate[key] = updates[key];
      }
    });
    await adminToUpdate.save();

    res.status(200).send({
      authorized: true,
      message: "Account details have been successfully updated!",
      data: adminToUpdate,
    });
  } catch (error) {
    res.status(200).send({ message: "Internal server error" });
  }
});

//来获取全部Admin的资料
router.get("/api/alladmin", authenticateAdminToken, async (req, res) => {
  try {
    // Find the current logged-in user
    const currentUser = await adminUser.findById(req.user.userId);
    if (!currentUser) {
      return res.status(200).json({ message: "User not found!" });
    }
    // Use the company name of the current user to find other users in the same company
    const usersInSameCompany = await adminUser
      .find({
        company: currentUser.company,
      })
      .select(
        "company phone status username role fullname lastLogin lastLoginIp depositTransactionCount withdrawalTransactionCount averageDepositProcessingTime averageWithdrawalProcessingTime totalRevertedDeposits totalRevertedWithdrawals onlineStatus"
      );

    res.status(200).json({ authorized: true, usersInSameCompany });
  } catch (error) {
    res.status(200).json({ message: "Internal server error" });
  }
});

//来获取特定Admin的资料
router.get("/api/admin/:id", authenticateAdminToken, async (req, res) => {
  try {
    const adminId = req.params.id; // Extract the ID from the request parameters
    const requestingUser = await adminUser.findById(req.user.userId);
    const adminData = await adminUser
      .findById(adminId)
      .select(
        "company username role status nric email phone dob bank permissions fullname bankAccount bankHolder"
      );

    if (!adminData) {
      return res.status(200).send({ message: "User not found!" });
    }
    if (
      requestingUser.company !== adminData.company ||
      requestingUser.role !== "Owner"
    ) {
      return res.status(200).send({
        message:
          "Access denied. You can only access data within your company and if you are an owner!",
      });
    }

    res.status(200).send({ authorized: true, adminData }); // Send the found admin data
  } catch (error) {
    res.status(200).send({ message: "Internal server error" });
  }
});

//来更新特定Admin的资料
router.patch("/api/admin/:id", authenticateAdminToken, async (req, res) => {
  const adminId = req.params.id;
  const updates = req.body;

  try {
    const requestingUser = await adminUser.findById(req.user.userId);

    // Fetch the admin to update, ensuring it exists and belongs to the same company
    const adminToUpdate = await adminUser
      .findById(adminId)
      .select(
        "company username role status nric email phone dob bank fullname bankAccount bankHolder"
      );
    if (!adminToUpdate) {
      return res.status(200).send({ message: "User not found!" });
    }

    if (
      requestingUser.company !== adminToUpdate.company ||
      requestingUser.role !== "Owner"
    ) {
      return res.status(200).send({
        message:
          "Access denied. You can only update data within your company and if you are an owner!",
      });
    }

    // If the update includes a password, hash it before saving
    if (updates.password) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(updates.password, salt);
      updates.password = hashedPassword;
    }

    // Update the admin with the new data
    Object.keys(updates).forEach((key) => (adminToUpdate[key] = updates[key]));
    await adminToUpdate.save();

    res.status(200).send({ authorized: true, adminToUpdate });
  } catch (error) {
    res.status(200).send({ message: "Internal server error" });
  }
});

//删除特定Admin
router.delete("/api/admin/:id", authenticateAdminToken, async (req, res) => {
  try {
    const adminId = req.params.id;
    const requestingUser = await adminUser.findById(req.user.userId);

    const adminToDelete = await adminUser.findById(adminId);
    if (!adminToDelete) {
      return res.status(200).send({ message: "User not found!" });
    }

    if (
      requestingUser.company !== adminToDelete.company ||
      requestingUser.role !== "Owner"
    ) {
      return res.status(200).send({
        message:
          "Access denied. You can only delete data within your company and if you are an owner!",
      });
    }

    await adminUser.findByIdAndDelete(adminId);
    res.status(200).send({
      authorized: true,
      message: "Account have been successfully deleted!",
    });
  } catch (error) {
    res.status(200).send({ message: "Internal server error" });
  }
});

//获取当前Admin拥有的View Permission
router.get("/api/userpermission", authenticateAdminToken, async (req, res) => {
  // Assuming 'req.user' contains the decoded JWT including permissions
  if (!req.user) {
    return res.status(200).json({ message: "Not authenticated" });
  }

  const permission = await adminUser
    .findById(req.user.userId)
    .select("permissions");
  res.status(200).json({
    authorized: true,
    permissions: permission, // Send only permissions or other needed details
  });
});

//获取Admin的Log
router.get("/api/employeelog", authenticateAdminToken, async (req, res) => {
  const currentUser = await adminUser.findById(req.user.userId);
  if (!currentUser) {
    return res.status(200).json({ message: "User not found!" });
  }

  // Fetch all logs that match the company of the current user
  const logs = await adminLog
    .find({ company: currentUser.company })
    .sort({ loginTime: -1 });

  res.status(200).json({ authorized: true, logs });
});

router.patch("/api/updateemployeestatus/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const adminUsers = await adminUser.findById(id);
    if (!adminUsers) {
      return res.status(200).json({ message: "User not found" });
    }

    // Determine the new status based on the current one
    const newStatus = adminUsers.status === "Active" ? "Inactive" : "Active";

    // Update the user with the new status
    const updatedUser = await adminUser.findByIdAndUpdate(
      id,
      { status: newStatus },
      { new: true }
    );

    // Successfully toggled and updated the user status
    res.json({ authorized: true, message: "User status updated" });
  } catch (error) {
    res.status(200).json({ message: "Internal server error" });
  }
});

//获取Admin的Report
router.get("/api/employeereport", authenticateAdminToken, async (req, res) => {
  const { startDate, endDate, lifetime } = req.query;

  let start, end;
  if (lifetime === "true") {
    start = new Date(0);
    end = moment.utc().endOf("day").toDate();
  } else {
    start = moment.utc(startDate, "YYYY-MM-DD").startOf("day").toDate();
    end = moment.utc(endDate, "YYYY-MM-DD").endOf("day").toDate();
  }
  try {
    const currentUser = await adminUser.findById(req.user.userId);
    if (!currentUser) {
      return res.status(200).json({ message: "User not found!" });
    }

    const employees = await adminUser
      .find({ company: currentUser.company })
      .select("-password");

    const usernames = employees.map((emp) => emp.username);

    const [
      deposits,
      revertedDeposits,
      withdrawals,
      revertedWithdrawals,
      bonus,
      revertedBonus,
      transactions,
    ] = await Promise.all([
      Deposit.aggregate([
        {
          $match: {
            processBy: { $in: usernames },
            createdAt: { $gte: start, $lte: end },
          },
        },
        {
          $group: {
            _id: "$processBy",
            totalApprovedDepositsAmount: {
              $sum: {
                $cond: [{ $eq: ["$status", "APPROVED"] }, "$depositAmount", 0],
              },
            },
            totalApprovedDepositsCount: {
              $sum: {
                $cond: [{ $eq: ["$status", "APPROVED"] }, 1, 0],
              },
            },
            totalRejectedDepositsAmount: {
              $sum: {
                $cond: [{ $eq: ["$status", "REJECTED"] }, "$depositAmount", 0],
              },
            },
            totalRejectedDepositsCount: {
              $sum: {
                $cond: [{ $eq: ["$status", "REJECTED"] }, 1, 0],
              },
            },
            processingTimes: { $push: "$processtime" },
          },
        },
      ]),
      Deposit.aggregate([
        {
          $match: {
            revertedProcessBy: { $in: usernames },
            createdAt: { $gte: start, $lte: end },
            reverted: true,
          },
        },
        {
          $group: {
            _id: "$revertedProcessBy",
            totalRevertedDepositsAmount: {
              $sum: "$depositAmount",
            },
            totalRevertedDepositsCount: {
              $sum: 1,
            },
          },
        },
      ]),
      Withdraw.aggregate([
        {
          $match: {
            processBy: { $in: usernames },
            createdAt: { $gte: start, $lte: end },
          },
        },
        {
          $group: {
            _id: "$processBy",
            totalApprovedWithdrawalsAmount: {
              $sum: {
                $cond: [{ $eq: ["$status", "APPROVED"] }, "$withdrawAmount", 0],
              },
            },
            totalApprovedWithdrawalsCount: {
              $sum: {
                $cond: [{ $eq: ["$status", "APPROVED"] }, 1, 0],
              },
            },
            totalRejectedWithdrawalsAmount: {
              $sum: {
                $cond: [{ $eq: ["$status", "REJECTED"] }, "$withdrawAmount", 0],
              },
            },
            totalRejectedWithdrawalsCount: {
              $sum: {
                $cond: [{ $eq: ["$status", "REJECTED"] }, 1, 0],
              },
            },
            processingTimes: { $push: "$processtime" },
          },
        },
      ]),
      Withdraw.aggregate([
        {
          $match: {
            revertedProcessBy: { $in: usernames },
            createdAt: { $gte: start, $lte: end },
            reverted: true,
          },
        },
        {
          $group: {
            _id: "$revertedProcessBy",
            totalRevertedWithdrawalsAmount: {
              $sum: "$withdrawAmount",
            },
            totalRevertedWithdrawalsCount: {
              $sum: 1,
            },
          },
        },
      ]),
      Bonus.aggregate([
        {
          $match: {
            processBy: { $in: usernames },
            createdAt: { $gte: start, $lte: end },
          },
        },
        {
          $group: {
            _id: "$processBy",
            totalApprovedBonusAmount: {
              $sum: {
                $cond: [{ $eq: ["$status", "APPROVED"] }, "$bonusAmount", 0],
              },
            },
            totalApprovedBonusCount: {
              $sum: {
                $cond: [{ $eq: ["$status", "APPROVED"] }, 1, 0],
              },
            },
            totalRejectedBonusAmount: {
              $sum: {
                $cond: [{ $eq: ["$status", "REJECTED"] }, "$bonusAmount", 0],
              },
            },
            totalRejectedBonusCount: {
              $sum: {
                $cond: [{ $eq: ["$status", "REJECTED"] }, 1, 0],
              },
            },
            processingTimes: { $push: "$processtime" },
          },
        },
      ]),
      Bonus.aggregate([
        {
          $match: {
            revertedProcessBy: { $in: usernames },
            createdAt: { $gte: start, $lte: end },
            reverted: true,
          },
        },
        {
          $group: {
            _id: "$revertedProcessBy",
            totalRevertedBonusAmount: {
              $sum: "$bonusAmount",
            },
            totalRevertedBonusCount: {
              $sum: 1,
            },
          },
        },
      ]),
      BankTransactionLog.aggregate([
        {
          $match: {
            processby: { $in: usernames },
            createdAt: { $gte: start, $lte: end },
          },
        },
        {
          $group: {
            _id: "$processby",
            totalCashIn: {
              $sum: {
                $cond: [{ $eq: ["$transactiontype", "CASH IN"] }, "$amount", 0],
              },
            },
            totalCashOut: {
              $sum: {
                $cond: [
                  { $eq: ["$transactiontype", "CASH OUT"] },
                  "$amount",
                  0,
                ],
              },
            },
          },
        },
      ]),
    ]);

    const depositResults = deposits.reduce(
      (acc, cur) => ({ ...acc, [cur._id]: cur }),
      {}
    );
    const revertedDepositResults = revertedDeposits.reduce(
      (acc, cur) => ({ ...acc, [cur._id]: cur }),
      {}
    );
    const withdrawalResults = withdrawals.reduce(
      (acc, cur) => ({ ...acc, [cur._id]: cur }),
      {}
    );
    const revertedWithdrawalResults = revertedWithdrawals.reduce(
      (acc, cur) => ({ ...acc, [cur._id]: cur }),
      {}
    );
    const bonusResults = bonus.reduce(
      (acc, cur) => ({ ...acc, [cur._id]: cur }),
      {}
    );
    const revertedBonusResults = revertedBonus.reduce(
      (acc, cur) => ({ ...acc, [cur._id]: cur }),
      {}
    );
    const transactionResults = transactions.reduce(
      (acc, cur) => ({ ...acc, [cur._id]: cur }),
      {}
    );

    const results = employees.map((emp) => {
      const deposit = depositResults[emp.username] || {
        totalApprovedDepositsCount: 0,
        totalApprovedDepositsAmount: 0,
        totalRejectedDepositsCount: 0,
        totalRejectedDepositsAmount: 0,
        totalRevertedDepositsCount: 0,
        totalRevertedDepositsAmount: 0,
        processingTimes: [],
      };
      const revertedDepositData = revertedDepositResults[emp.username] || {
        totalRevertedDepositsAmount: 0,
        totalRevertedDepositsCount: 0,
      };
      const withdrawal = withdrawalResults[emp.username] || {
        totalApprovedWithdrawalsCount: 0,
        totalApprovedWithdrawalsAmount: 0,
        totalRejectedWithdrawalsCount: 0,
        totalRejectedWithdrawalsAmount: 0,
        totalRevertedWithdrawalsCount: 0,
        totalRevertedWithdrawalsAmount: 0,
        processingTimes: [],
      };
      const revertedWithdrawalData = revertedWithdrawalResults[
        emp.username
      ] || {
        totalRevertedWithdrawalsAmount: 0,
        totalRevertedWithdrawalsCount: 0,
      };
      const bonus = bonusResults[emp.username] || {
        totalApprovedBonusCount: 0,
        totalApprovedBonusAmount: 0,
        totalRejectedBonusCount: 0,
        totalRejectedBonusAmount: 0,
        totalRevertedBonusCount: 0,
        totalRevertedBonusAmount: 0,
        processingTimes: [],
      };
      const revertedBonusData = revertedBonusResults[emp.username] || {
        totalRevertedBonusAmount: 0,
        totalRevertedBonusCount: 0,
      };
      const transaction = transactionResults[emp.username] || {
        totalCashIn: 0,
        totalCashOut: 0,
      };

      //this is to get all processingtimes in average
      const allProcessingTimes = [
        ...deposit.processingTimes,
        ...withdrawal.processingTimes,
        ...bonus.processingTimes,
      ];
      const totalAverageProcessingTime =
        calculateProcessingTimeForReport(allProcessingTimes);

      return {
        username: emp.username,
        lastloginip: emp.lastLoginIp,
        deposits: {
          totalApprovedAmount: deposit.totalApprovedDepositsAmount,
          totalApprovedCount: deposit.totalApprovedDepositsCount,
          totalRejectedAmount: deposit.totalRejectedDepositsAmount,
          totalRejectedCount: deposit.totalRejectedDepositsCount,
          totalRevertedAmount: revertedDepositData.totalRevertedDepositsAmount,
          totalRevertedCount: revertedDepositData.totalRevertedDepositsCount,
          averageProcessingTime: calculateProcessingTimeForReport(
            deposit.processingTimes
          ), // Only return the average processing time
        },
        withdrawals: {
          totalApprovedAmount: withdrawal.totalApprovedWithdrawalsAmount,
          totalApprovedCount: withdrawal.totalApprovedWithdrawalsCount,
          totalRejectedAmount: withdrawal.totalRejectedWithdrawalsAmount,
          totalRejectedCount: withdrawal.totalRejectedWithdrawalsCount,
          totalRevertedAmount:
            revertedWithdrawalData.totalRevertedWithdrawalsAmount,
          totalRevertedCount:
            revertedWithdrawalData.totalRevertedWithdrawalsCount,
          averageProcessingTime: calculateProcessingTimeForReport(
            withdrawal.processingTimes
          ), // Only return the average processing time
        },
        bonuses: {
          totalApprovedAmount: bonus.totalApprovedBonusAmount,
          totalApprovedCount: bonus.totalApprovedBonusCount,
          totalRejectedAmount: bonus.totalRejectedBonusAmount,
          totalRejectedCount: bonus.totalRejectedBonusCount,
          totalRevertedAmount: revertedBonusData.totalRevertedBonusAmount,
          totalRevertedCount: revertedBonusData.totalRevertedBonusCount,
          averageProcessingTime: calculateProcessingTimeForReport(
            bonus.processingTimes
          ),
        },
        transactionsLog: transaction,
        totalAverageProcessingTime,
      };
    });

    res.status(200).json({ authorized: true, results });
  } catch (error) {
    console.error("Error fetching employee report data:", error);
    res.status(200).json({ message: "Internal server error" });
  }
});

function calculateProcessingTimeForReport(processTimes) {
  const totalSeconds = processTimes.reduce(
    (acc, time) => acc + convertTimeToSeconds(time),
    0
  );
  return formatTimeFromSeconds(totalSeconds / (processTimes.length || 1));
}

//获取Bonus Report资料
router.get("/api/bonusreport", authenticateAdminToken, async (req, res) => {
  const { startDate, endDate, lifetime } = req.query;

  let start, end;
  if (lifetime === "true") {
    start = new Date(0);
    end = moment.utc().endOf("day").toDate();
  } else {
    start = moment.utc(startDate, "YYYY-MM-DD").startOf("day").toDate();
    end = moment.utc(endDate, "YYYY-MM-DD").endOf("day").toDate();
  }
  try {
    const currentUser = await adminUser.findById(req.user.userId);
    if (!currentUser) {
      return res.status(200).json({ message: "User not found!" });
    }
    // Step 1: Fetch all current promotions
    const promotions = await Promotion.find({}).select(
      "maintitle categories description claimtype status"
    );

    // Step 2: Fetch approved bonuses
    const bonuses = await Bonus.aggregate([
      {
        $match: {
          transactionType: { $in: ["BONUS", "CS BONUS"] },
          status: { $in: ["APPROVED", "REJECTED"] },
          createdAt: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: "$promotionname",
          approvedCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$status", "APPROVED"] },
                    { $eq: ["$reverted", false] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          approvedAmount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$status", "APPROVED"] },
                    { $eq: ["$reverted", false] },
                  ],
                },
                "$bonusAmount",
                0,
              ],
            },
          },
          rejectedCount: {
            $sum: { $cond: [{ $eq: ["$status", "REJECTED"] }, 1, 0] },
          },
          rejectedAmount: {
            $sum: {
              $cond: [{ $eq: ["$status", "REJECTED"] }, "$bonusAmount", 0],
            },
          },
          revertedCount: {
            $sum: { $cond: [{ $eq: ["$reverted", true] }, 1, 0] },
          },
          revertedAmount: {
            $sum: {
              $cond: [{ $eq: ["$reverted", true] }, "$bonusAmount", 0],
            },
          },
        },
      },
    ]);

    // Step 3: Combine promotion data with bonus data
    const report = promotions.map((promotion) => {
      const bonusData = bonuses.find(
        (bonus) => bonus._id === promotion.maintitle
      );

      return {
        promotionName: promotion.maintitle,
        category: promotion.categories.join(", "),
        description: promotion.description,
        claimType: promotion.claimtype,
        claimApprovedCount: bonusData ? bonusData.approvedCount : 0,
        totalApprovedBonusAmount: bonusData ? bonusData.approvedAmount : 0,
        claimRejectedCount: bonusData ? bonusData.rejectedCount : 0,
        totalRejectedBonusAmount: bonusData ? bonusData.rejectedAmount : 0,
        claimRevertedCount: bonusData ? bonusData.revertedCount : 0,
        totalRevertedBonusAmount: bonusData ? bonusData.revertedAmount : 0,
        status: promotion.status,
      };
    });

    // Step 4: Send response
    res.status(200).json({ authorized: true, report });
  } catch (error) {
    console.error(error);
    res.status(200).json({ message: "Internal server error" });
  }
});

//获取Bank Report资料
router.get("/api/bankreport", authenticateAdminToken, async (req, res) => {
  const { startDate, endDate, lifetime } = req.query;

  let start, end;
  if (lifetime === "true") {
    start = new Date(0);
    end = moment.utc().endOf("day").toDate();
  } else {
    start = moment.utc(startDate, "YYYY-MM-DD").startOf("day").toDate();
    end = moment.utc(endDate, "YYYY-MM-DD").endOf("day").toDate();
  }

  try {
    const currentUser = await adminUser.findById(req.user.userId);
    if (!currentUser) {
      return res.status(200).json({ message: "User not found!" });
    }

    const transactionSummary = await BankTransactionLog.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
        },
      },
      {
        $addFields: {
          normalizedTransactionType: {
            $switch: {
              branches: [
                {
                  case: { $eq: ["$transactiontype", "CS DEPOSIT"] },
                  then: "DEPOSIT",
                },
                {
                  case: { $eq: ["$transactiontype", "CS WITHDRAW"] },
                  then: "WITHDRAW",
                },
                {
                  case: { $eq: ["$transactiontype", "REVERTED DEPOSIT"] },
                  then: "REVERTED DEPOSIT",
                },
                {
                  case: { $eq: ["$transactiontype", "REVERTED WITHDRAW"] },
                  then: "REVERTED WITHDRAW",
                },
              ],
              default: "$transactiontype",
            },
          },
        },
      },
      {
        $group: {
          _id: {
            bankName: "$bankName",
            transactionType: "$normalizedTransactionType",
          },
          totalAmount: { $sum: "$amount" },
        },
      },
      {
        $group: {
          _id: "$_id.bankName",
          transactions: {
            $push: {
              type: "$_id.transactionType",
              totalAmount: "$totalAmount",
            },
          },
        },
      },
      {
        $addFields: {
          transactions: {
            $map: {
              input: "$transactions",
              as: "transaction",
              in: {
                type: "$$transaction.type",
                totalAmount: {
                  $cond: [
                    {
                      $or: [
                        { $eq: ["$$transaction.type", "DEPOSIT"] },
                        { $eq: ["$$transaction.type", "WITHDRAW"] },
                      ],
                    },
                    {
                      $subtract: [
                        "$$transaction.totalAmount",
                        {
                          $reduce: {
                            input: "$transactions",
                            initialValue: 0,
                            in: {
                              $cond: [
                                {
                                  $and: [
                                    { $eq: ["$$transaction.type", "DEPOSIT"] },
                                    {
                                      $eq: ["$$this.type", "REVERTED DEPOSIT"],
                                    },
                                  ],
                                },
                                { $add: ["$$value", "$$this.totalAmount"] },
                                {
                                  $cond: [
                                    {
                                      $and: [
                                        {
                                          $eq: [
                                            "$$transaction.type",
                                            "WITHDRAW",
                                          ],
                                        },
                                        {
                                          $eq: [
                                            "$$this.type",
                                            "REVERTED WITHDRAW",
                                          ],
                                        },
                                      ],
                                    },
                                    { $add: ["$$value", "$$this.totalAmount"] },
                                    "$$value",
                                  ],
                                },
                              ],
                            },
                          },
                        },
                      ],
                    },
                    "$$transaction.totalAmount",
                  ],
                },
              },
            },
          },
        },
      },
      {
        $addFields: {
          transactions: {
            $filter: {
              input: "$transactions",
              as: "transaction",
              cond: {
                $not: {
                  $in: [
                    "$$transaction.type",
                    ["REVERTED DEPOSIT", "REVERTED WITHDRAW"],
                  ],
                },
              },
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          bankName: "$_id",
          transactions: 1,
        },
      },
    ]);

    const banks = await BankList.find({ isActive: true }).lean();

    const bankReport = banks.map((bank) => {
      const bankTransactions = transactionSummary.find(
        (t) => t.bankName === bank.bankname
      );

      return {
        bankName: bank.bankname,
        bankHolderName: bank.bankholdername,
        startingBalance: bank.startingbalance,
        currentBalance: bank.currentbalance,
        transactions: bankTransactions ? bankTransactions.transactions : [],
      };
    });

    res.status(200).json({ authorized: true, report: bankReport });
  } catch (error) {
    console.error("Error generating bank report:", error);
    res.status(200).json({ message: "Internal server error" });
  }
});

// Route to get all bonuses of the current user
router.get("/api/bonusesforcurrentuser/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;

    // Find all bonuses for the specified userId
    const bonuses = await Bonus.find({ userId }).sort({ createdAt: -1 });

    // Return the bonuses
    return res.status(200).json({ authorized: true, data: bonuses });
  } catch (error) {
    console.error("Error fetching bonuses:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Routes
router.post("/api/newfaqs", authenticateAdminToken, async (req, res) => {
  try {
    const user = await adminUser.findById(req.user.userId);

    const { faqText } = req.body;

    if (!faqText) {
      return res.status(200).send("FAQ text and last updated by are required.");
    }

    const newFaq = new FaqData({
      faqText,
      lastUpdatedBy: user.username,
      lastUpdatedAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
    });

    await newFaq.save();

    res.status(200).send({ authorized: true, message: "FAQ Created!", newFaq });
  } catch (error) {
    res.status(200).send(error.message);
  }
});

router.get("/api/getallfaqs", authenticateAdminToken, async (req, res) => {
  try {
    const faqs = await FaqData.find();
    res.status(200).send({ authorized: true, faqs });
  } catch (error) {
    res.status(200).send({ authorized: false, message: error.message });
  }
});

router.patch("/api/updatefaq/:id", authenticateAdminToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { faqText } = req.body;

    const user = await adminUser.findById(req.user.userId);

    if (!faqText) {
      return res
        .status(400)
        .json({ authorized: false, message: "FAQ text is required." });
    }

    const faq = await FaqData.findById(id);
    if (!faq) {
      return res
        .status(404)
        .json({ authorized: false, message: "FAQ not found." });
    }

    faq.faqText = faqText;
    faq.lastUpdatedAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
    faq.lastUpdatedBy = user.username;
    await faq.save();

    res
      .status(200)
      .json({ authorized: true, faq, message: "FAQ updated successfully." });
  } catch (error) {
    res.status(500).json({ authorized: false, message: error.message });
  }
});

router.delete(
  "/api/deletefaq/:id",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { id } = req.params;

      const faq = await FaqData.findById(id);
      if (!faq) {
        return res
          .status(404)
          .json({ authorized: false, message: "FAQ not found." });
      }

      await FaqData.findByIdAndDelete(id);

      res
        .status(200)
        .json({ authorized: true, message: "FAQ deleted successfully." });
    } catch (error) {
      res.status(500).json({ authorized: false, message: error.message });
    }
  }
);

router.get(
  "/api/getuserrebatereport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      let start, end;

      start = moment
        .utc(startDate, "YYYY-MM-DD")
        .add(8, "hours")
        .startOf("day")
        .toDate();
      end = moment
        .utc(endDate, "YYYY-MM-DD")
        .add(8, "hours")
        .endOf("day")
        .toDate();

      const users = await User.find({
        "yesterdayTurnover.DATE": { $gte: start, $lte: end },
      }).select("username rebate yesterdayTurnover");

      return res.status(200).json({ authorized: true, users });
    } catch (error) {
      console.log("error fetching user rebate report", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

// router.get(
//   "/api/getloginusercount",
//   authenticateAdminToken,
//   async (req, res) => {
//     try {
//       const today = moment.utc().startOf("day").subtract(8, "hours");

//       const endOfToday = moment.utc().endOf("day").subtract(8, "hours");
//       const yesterday = moment
//         .utc()
//         .subtract(1, "days")
//         .startOf("day")
//         .subtract(8, "hours");

//       const logs = await userLog.find({
//         remark: "Login Success",
//         loginTime: {
//           $gte: yesterday.toDate(),
//           $lt: endOfToday.toDate(),
//         },
//       });

//       const usersForToday = new Set();
//       const usersForYesterday = new Set();

//       logs.forEach((log) => {
//         if (moment(log.loginTime).isSameOrAfter(today)) {
//           usersForToday.add(log.username);
//         } else {
//           usersForYesterday.add(log.username);
//         }
//       });

//       return res.status(200).json({
//         authorized: true,
//         today: Array.from(usersForToday),
//         yesterday: Array.from(usersForYesterday),
//       });
//     } catch (error) {
//       console.error("error fetchig login user's count", error);
//       return res.status(500).json({ message: "Internal server error" });
//     }
//   }
// );

router.get(
  "/api/getloginusercount",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const todayStart = moment.utc().startOf("day").subtract(8, "hours");
      const todayEnd = moment.utc().endOf("day").subtract(8, "hours");
      const yesterdayStart = moment
        .utc()
        .subtract(1, "days")
        .startOf("day")
        .subtract(8, "hours");
      const yesterdayEnd = moment
        .utc()
        .subtract(1, "days")
        .endOf("day")
        .subtract(8, "hours");

      // Query for yesterday's logins
      const yesterdayLogs = await userLog.find({
        remark: "Login Success",
        loginTime: {
          $gte: yesterdayStart.toDate(),
          $lt: yesterdayEnd.toDate(),
        },
      });

      // Query for today's logins
      const todayLogs = await userLog.find({
        remark: "Login Success",
        loginTime: {
          $gte: todayStart.toDate(),
          $lt: todayEnd.toDate(),
        },
      });

      const usersForYesterday = new Set(
        yesterdayLogs.map((log) => log.username)
      );
      const usersForToday = new Set(todayLogs.map((log) => log.username));

      return res.status(200).json({
        authorized: true,
        today: Array.from(usersForToday),
        yesterday: Array.from(usersForYesterday),
      });
    } catch (error) {
      console.error("Error fetching login user count", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.post(
  "/api/getplayerdepositdata/:playerId",
  authenticateAdminToken,
  async (req, res) => {
    const playerId = req.params.playerId;

    const currentUser = await User.findById(playerId);

    try {
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

      const lastMonthDeposits = await Deposit.find({
        username: currentUser.username,
        createdAt: {
          $gte: startOfLastMonth,
          $lte: endOfLastMonth,
        },
        status: "APPROVED",
        reverted: false,
      });

      const totalLastMonthDeposit = lastMonthDeposits.reduce((acc, deposit) => {
        const amount = deposit.depositAmount || 0;
        return acc + amount;
      }, 0);

      const startOfMonth = moment.utc().add(8, "hours").startOf("month");
      const endOfMonth = moment.utc().add(8, "hours").endOf("month");

      const thisMonthdeposits = await Deposit.find({
        username: currentUser.username,
        createdAt: {
          $gte: startOfMonth,
          $lte: endOfMonth,
        },
        status: "APPROVED", // Considering only approved deposits
        reverted: false,
      });

      const totalThisMonthDeposit = thisMonthdeposits.reduce((acc, deposit) => {
        const amount = deposit.depositAmount || 0;
        return acc + amount;
      }, 0);
      console.log(totalLastMonthDeposit);
      return res.status(200).json({
        authorized: true,
        totalLastMonthDeposit: totalLastMonthDeposit,
        totalThisMonthDeposit: totalThisMonthDeposit,
      });
    } catch (error) {
      console.log(error);
      return res.status(500).send({ message: "Internal server error" });
    }
  }
);

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.GOOGLE_EMAIL,
    pass: process.env.GOOGLE_PASS,
  },
});

const sendEmailNotification = async (subject, text) => {
  try {
    const mailOptions = {
      from: process.env.GOOGLE_EMAIL, // Sender address
      // to: "mrcmrc3399@gmail.com", // Recipient address
      to: "mrcmrc3399@gmail.com, kenji052802@gmail.com, mrja8179@gmail.com", // Recipient address
      subject: subject, // Subject of the email
      text: text, // Body of the email
    };

    // Send the email
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error("Error sending email:", error);
  }
};

router.post(
  "/api/staffAlertEmail",
  authenticateAdminToken,
  async (req, res) => {
    const { exportTitle } = req.body;

    const user = await adminUser.findById(req.user.userId);

    // Define the subject and body for the email
    const subject = `🚨 ATTENTION: FHCHK Staff Alert! 🚨 - ${user.username} attempted to export ${exportTitle}`;
    const message = `🔍 *User Alert* 🔍\n\nStaff Member: **${user.username}** has just **accessed** the *${exportTitle}* export modal on the admin panel.\n\nPlease review this action for security purposes.`;
    // Send the email
    sendEmailNotification(subject, message)
      .then(() => {
        res.status(200).json({ success: true, message: "Notification sent." });
      })
      .catch((error) => {
        console.error("Error sending email:", error);
        res
          .status(500)
          .json({ success: false, error: "Failed to send notification." });
      });
  }
);

const correctPassword = "admin1688@"; // Replace with a secure method

router.post(
  "/api/verifyExportPassword",
  authenticateAdminToken,
  async (req, res) => {
    const { password, exportTitle } = req.body;

    // Check if the provided password matches the correct password
    if (password === correctPassword) {
      return res.json({ success: true });
    } else {
      const user = await adminUser.findById(req.user.userId);

      const subject = `🚨 ALERT: Failed Export ${exportTitle} Attempt by ${user.username} using password ${password} 🚨`;
      const message = `🔍 *User Alert* 🔍\n\nStaff Member: **${user.username}** entered an **incorrect password - ${password}** while attempting to export ${exportTitle}.\n\nPlease review this action for security purposes.`;

      sendEmailNotification(subject, message)
        .then(() => {
          return res
            .status(401)
            .json({ success: false, message: "Incorrect password" });
        })
        .catch((error) => {
          console.error("Error sending email:", error);
          return res.status(500).json({
            success: false,
            error: "Failed to send notification, and incorrect password.",
          });
        });
    }
  }
);

router.get(
  "/api/rebateErrorAdmin",
  authenticateAdminToken,
  async (req, res) => {
    try {
      // Fetch all rebate logs, sorted by the most recent entries first
      const rebateError = await adminList
        .find()
        .select("rebateError rebateErrorDate");

      // Return the rebate logs
      res.status(200).json({ authorized: true, rebateError });
    } catch (error) {
      console.error("Error fetching rebate error:", error.message);
      res
        .status(500)
        .json({ authorized: false, message: "Internal server error" });
    }
  }
);

//获取Bank Report资料
router.post(
  "/api/attendanceBonusReport",
  authenticateAdminToken,
  async (req, res) => {
    const { startDate, endDate } = req.query;

    // Selected week range (e.g., 2024-10-14 to 2024-10-20)
    let start, end;

    start = moment.utc(startDate, "YYYY-MM-DD").startOf("day").toDate();
    end = moment.utc(endDate, "YYYY-MM-DD").endOf("day").toDate();

    // Calculate the next week's range for bonus data
    let bonusStart = moment
      .utc(endDate, "YYYY-MM-DD")
      .add(1, "day")
      .startOf("day")
      .toDate();
    let bonusEnd = moment
      .utc(endDate, "YYYY-MM-DD")
      .add(7, "days")
      .endOf("day")
      .toDate();

    try {
      const currentUser = await adminUser.findById(req.user.userId);
      if (!currentUser) {
        return res.status(200).json({ message: "User not found!" });
      }

      // Step 1: Fetch all deposits for the selected week and group by user and day
      const depositData = await Deposit.aggregate([
        {
          $match: {
            createdAt: { $gte: start, $lte: end },
            reverted: false,
            status: "APPROVED", // Exclude reverted deposits
          },
        },
        {
          $group: {
            _id: {
              userId: "$userId",
              day: { $dayOfMonth: "$createdAt" }, // Group deposits by day
            },
            username: { $first: "$username" },
            totalDepositAmount: { $sum: "$depositAmount" }, // Sum deposits for that day
            totalDepositCount: { $sum: 1 }, // Count deposits for that day
          },
        },
        {
          $group: {
            _id: "$_id.userId",
            username: { $first: "$username" },
            totalDepositAmount: { $sum: "$totalDepositAmount" }, // Sum total deposit amount
            totalDepositCount: { $sum: "$totalDepositCount" }, // Sum total deposit count for all days
            dailyDepositDays: { $push: "$_id.day" }, // Collect all days when deposits were made
            uniqueDepositDayCount: { $sum: 1 },
          },
        },
      ]);

      // Calculate totalOverallDepositCount (sum of all deposit counts)
      const totalOverallDepositCount = depositData.reduce(
        (acc, user) => acc + user.totalDepositCount,
        0
      );

      // Step 2: Fetch bonus data for the week after the selected range, matches promotion name "签到彩金" and is approved
      const bonusData = await Bonus.aggregate([
        {
          $match: {
            createdAt: { $gte: bonusStart, $lte: bonusEnd }, // The next week
            promotionname: "簽到獎金", // Filter for "签到彩金"
            status: "APPROVED", // Only approved bonuses
            reverted: false, // Exclude reverted bonuses
          },
        },
        {
          $group: {
            _id: "$userId",
            username: { $first: "$username" },
            claimDate: { $first: "$createdAt" }, // Get the first bonus claim date
            totalBonusCount: { $sum: 1 }, // Count bonuses
            totalBonusAmount: { $sum: "$bonusAmount" }, // Sum bonus amounts
          },
        },
      ]);

      // Define the days of the week from startDate to endDate
      const totalDays = Array.from(
        { length: moment(end).diff(moment(start), "days") + 1 },
        (_, i) => moment(start).add(i, "days").date()
      );

      // Step 3: Merge the deposit and bonus data based on the userId and calculate the claim status
      const mergedData = depositData.map((deposit) => {
        // Check if the user has made a deposit on every day in the range
        const hasDepositedEachDay = totalDays.every((day) =>
          deposit.dailyDepositDays.includes(day)
        );

        let claimStatus = "N/A"; // Default to N/A if the user doesn't meet deposit conditions
        let claimDate = null; // Default to null if the user hasn't claimed the bonus
        let totalBonusCount = 0;
        let totalBonusAmount = 0;

        if (hasDepositedEachDay) {
          // Check if the user has claimed the bonus
          const userBonus = bonusData.find((bonus) =>
            bonus._id.equals(deposit._id)
          );

          if (userBonus) {
            claimStatus = "true";
            claimDate = userBonus.claimDate; // Get claim date
            totalBonusCount = userBonus.totalBonusCount;
            totalBonusAmount = userBonus.totalBonusAmount;
          } else {
            claimStatus = "false"; // Qualifies but hasn't claimed
          }
        }

        return {
          userId: deposit._id,
          username: deposit.username,
          totalDepositAmount: deposit.totalDepositAmount,
          totalDepositCount: deposit.totalDepositCount,
          uniqueDepositDayCount: deposit.uniqueDepositDayCount,
          totalBonusCount,
          totalBonusAmount,
          claimStatus,
          claimDate,
          startDate,
          endDate,
        };
      });

      // Step 4: Send the merged data as a response
      res.status(200).json({
        authorized: true,
        report: mergedData,
        bonusData: totalOverallDepositCount, // Overall deposit count for all users
      });
    } catch (error) {
      console.error("Error generating promotion report:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.post(
  "/api/loyaltyBonusReport",
  authenticateAdminToken,
  async (req, res) => {
    const { startDate, endDate } = req.query;

    // Selected month range (e.g., 2024-10-01 to 2024-10-31)
    let start, end;

    start = moment.utc(startDate, "YYYY-MM-DD").startOf("day").toDate();
    end = moment.utc(endDate, "YYYY-MM-DD").endOf("day").toDate();

    // Calculate the next month's range for bonus data
    let nextMonthStart = moment
      .utc(endDate, "YYYY-MM-DD")
      .add(1, "day")
      .startOf("day")
      .toDate();
    let nextMonthEnd = moment
      .utc(endDate, "YYYY-MM-DD")
      .add(1, "month")
      .endOf("month")
      .toDate();

    try {
      const currentUser = await adminUser.findById(req.user.userId);
      if (!currentUser) {
        return res.status(200).json({ message: "User not found!" });
      }

      // Step 1: Fetch total deposit amount for the selected month
      const depositData = await Deposit.aggregate([
        {
          $match: {
            createdAt: { $gte: start, $lte: end },
            reverted: false,
            status: "APPROVED", // Exclude reverted deposits
          },
        },
        {
          $group: {
            _id: "$userId",
            username: { $first: "$username" },
            totalDepositAmount: { $sum: "$depositAmount" }, // Sum deposits for the month
            totalDepositCount: { $sum: 1 }, // Count deposits for the month
          },
        },
      ]);

      // Step 2: Fetch bonus data for the next month, matching promotion name "每月獎金" (monthly bonus) and status APPROVED
      const bonusData = await Bonus.aggregate([
        {
          $match: {
            createdAt: { $gte: nextMonthStart, $lte: nextMonthEnd }, // The next month
            promotionname: "忠實獎金", // Filter for "每月獎金"
            status: "APPROVED", // Only approved bonuses
            reverted: false, // Exclude reverted bonuses
          },
        },
        {
          $group: {
            _id: "$userId",
            username: { $first: "$username" },
            claimDate: { $first: "$createdAt" }, // Get the first bonus claim date
            totalBonusCount: { $sum: 1 }, // Count bonuses
            totalBonusAmount: { $sum: "$bonusAmount" }, // Sum bonus amounts
          },
        },
      ]);

      // Step 3: Merge the deposit and bonus data, and calculate the bonus eligibility and claim status
      const mergedData = depositData.map((deposit) => {
        let eligibleBonusAmount = 0;
        let claimStatus = "N/A"; // Default to N/A if the user doesn't meet deposit conditions
        let claimDate = null; // Default to null if the user hasn't claimed the bonus
        let totalBonusCount = 0;
        let totalBonusAmount = 0;

        // Determine eligible bonus based on total deposit amount

        if (deposit.totalDepositAmount > 1000000) {
          eligibleBonusAmount = 8888;
        } else if (deposit.totalDepositAmount > 100000) {
          eligibleBonusAmount = 1888;
        } else if (deposit.totalDepositAmount > 50000) {
          eligibleBonusAmount = 888;
        } else if (deposit.totalDepositAmount > 10000) {
          eligibleBonusAmount = 188;
        } else if (deposit.totalDepositAmount > 1000) {
          eligibleBonusAmount = 88;
        }

        // Check if the user has claimed the bonus in the next month
        if (eligibleBonusAmount > 0) {
          const userBonus = bonusData.find((bonus) =>
            bonus._id.equals(deposit._id)
          );

          if (userBonus) {
            claimStatus = "true";
            claimDate = userBonus.claimDate; // Get claim date
            totalBonusCount = userBonus.totalBonusCount;
            totalBonusAmount = userBonus.totalBonusAmount;
          } else {
            claimStatus = "false"; // Qualifies but hasn't claimed
          }
        }

        return {
          userId: deposit._id,
          username: deposit.username,
          totalDepositAmount: deposit.totalDepositAmount,
          totalDepositCount: deposit.totalDepositCount,
          eligibleBonusAmount,
          totalBonusCount,
          totalBonusAmount,
          claimStatus,
          claimDate,
          startDate,
          endDate,
        };
      });

      // Step 4: Send the merged data as a response
      res.status(200).json({
        authorized: true,
        report: mergedData,
      });
    } catch (error) {
      console.error("Error generating loyalty bonus report:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.post(
  "/api/vipMonthlyBonusReport",
  authenticateAdminToken,
  async (req, res) => {
    const { startDate, endDate } = req.query;

    // Selected month range (e.g., 2024-10-01 to 2024-10-31)
    let start, end;

    start = moment.utc(startDate, "YYYY-MM-DD").startOf("day").toDate();
    end = moment.utc(endDate, "YYYY-MM-DD").endOf("day").toDate();

    // Calculate the next month's range for bonus data
    let nextMonthStart = moment
      .utc(endDate, "YYYY-MM-DD")
      .add(1, "day")
      .startOf("day")
      .toDate();
    let nextMonthEnd = moment
      .utc(endDate, "YYYY-MM-DD")
      .add(1, "month")
      .endOf("month")
      .toDate();

    try {
      const currentUser = await adminUser.findById(req.user.userId);
      if (!currentUser) {
        return res.status(200).json({ message: "User not found!" });
      }

      // Step 1: Fetch total deposit amount for the selected month
      const depositData = await Deposit.aggregate([
        {
          $match: {
            createdAt: { $gte: start, $lte: end },
            reverted: false,
            status: "APPROVED", // Only approved deposits
          },
        },
        {
          $group: {
            _id: "$userId",
            username: { $first: "$username" },
            totalDepositAmount: { $sum: "$depositAmount" }, // Sum deposits for the month
            totalDepositCount: { $sum: 1 }, // Count deposits for the month
          },
        },
      ]);

      // Step 2: Fetch bonus data for the next month, matching promotion name "每月獎金" and status APPROVED
      const bonusData = await Bonus.aggregate([
        {
          $match: {
            createdAt: { $gte: nextMonthStart, $lte: nextMonthEnd }, // The next month
            promotionname: "每月獎金", // Filter for "每月獎金"
            status: "APPROVED", // Only approved bonuses
            reverted: false, // Exclude reverted bonuses
          },
        },
        {
          $group: {
            _id: "$userId",
            username: { $first: "$username" },
            claimDate: { $first: "$createdAt" }, // Get the first bonus claim date
            totalBonusCount: { $sum: 1 }, // Count bonuses
            totalBonusAmount: { $sum: "$bonusAmount" }, // Sum bonus amounts
          },
        },
      ]);

      // Step 3: Get the VIP levels from the VIP schema
      const vipLevelsData = await vip.find({ inuse: "Yes" });
      const vipDetails = vipLevelsData[0].vipDetails;

      const mergedData = await Promise.all(
        depositData.map(async (deposit) => {
          let eligibleBonusAmount = 0;
          let claimStatus = "N/A"; // Default to N/A if the user doesn't meet deposit conditions
          let claimDate = null; // Default to null if the user hasn't claimed the bonus
          let totalBonusCount = 0;
          let totalBonusAmount = 0;
          let userVipLevel = "普通 / NORMAL";

          // Fetch user information to get the VIP level
          const user = await User.findById(deposit._id);

          if (user) {
            userVipLevel = user.viplevel;
            totaldeposit = user.totaldeposit;
          }

          for (const detail of vipDetails) {
            const requiredTotalDeposit = parseInt(detail.depositmaintain, 10);

            // Check if deposit meets minimum requirement of 1,500
            if (deposit.totalDepositAmount >= 1500) {
              // Find the matching VIP level based on deposit amount
              if (deposit.totalDepositAmount >= requiredTotalDeposit) {
                eligibleBonusAmount = parseInt(detail.birthdaybonus, 10);
              }

              // Check if the user has claimed the bonus in the bonusData
              const userBonus = bonusData.find((bonus) =>
                bonus._id.equals(deposit._id)
              );

              if (userBonus) {
                // If bonus is claimed, use the actual claimed amount
                claimStatus = "true";
                claimDate = userBonus.claimDate;
                totalBonusCount = userBonus.totalBonusCount;
                totalBonusAmount = userBonus.totalBonusAmount;
                eligibleBonusAmount = totalBonusAmount; // Set eligible amount to match claimed amount
                break; // Exit loop since bonus is already claimed
              }

              // If the user's VIP level matches the current VIP detail level
              if (detail.name === userVipLevel) {
                claimStatus = "false"; // Eligible but not claimed
              }
            } else {
              // If the deposit is below the minimum required amount
              claimStatus = "N/A";
              eligibleBonusAmount = 0;
            }
          }
          return {
            userId: deposit._id,
            username: deposit.username,
            totalDepositAmount: deposit.totalDepositAmount,
            totalDepositCount: deposit.totalDepositCount,
            eligibleBonusAmount, // Eligible monthly bonus amount based on deposits
            totalBonusCount,
            totalBonusAmount,
            claimStatus, // Whether the user has claimed the bonus
            claimDate, // The date when the bonus was claimed, if applicable
            userVipLevel, // User's current VIP level
            totaldeposit,
            startDate,
            endDate,
          };
        })
      );

      // Step 5: Send the merged data as a response
      res.status(200).json({
        authorized: true,
        report: mergedData,
      });
    } catch (error) {
      console.error("Error generating VIP monthly bonus report:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.post(
  "/api/vipLevelUpBonusReport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const currentUser = await adminUser.findById(req.user.userId);
      if (!currentUser) {
        return res.status(200).json({ message: "User not found!" });
      }

      // Step 1: Get the VIP levels from the VIP schema
      const vipLevelsData = await vip.find({ inuse: "Yes" });
      const vipDetails = vipLevelsData[0].vipDetails;

      // Step 2: Fetch users whose VIP level is not "普通 / NORMAL"
      const users = await User.find({
        viplevel: { $ne: "普通 / NORMAL" }, // Exclude users with "普通 / NORMAL" VIP level
        username: { $not: /^mario/i }, // Exclude usernames starting with "mario" (case-insensitive)
      });

      // Step 3: For each user, check if they haven't claimed their level-up bonus and calculate the bonus amount
      const levelUpBonusReport = await Promise.all(
        users.map(async (user) => {
          let status = "true"; // Assume the bonus is already claimed by default
          let upgradeBonusAmount = 0;
          let userVipLevel = user.viplevel;
          let userLastClaimedVipLevel = user.lastClaimedVipLevel;

          // Check if the user's current VIP level is higher than their last claimed VIP level
          if (userVipLevel !== userLastClaimedVipLevel) {
            status = "false"; // If the VIP levels don't match, it means the user hasn't claimed their level-up bonus

            // Fetch the upgrade bonus amount based on the user's new VIP level
            const vipDetail = vipDetails.find(
              (detail) => detail.name === userVipLevel
            );

            if (vipDetail) {
              upgradeBonusAmount = parseInt(vipDetail.upgradebonus, 10); // Use upgrade bonus from VIP schema
            }
          }

          return {
            userId: user._id,
            username: user.username,
            totalDepositAmount: user.totaldeposit,
            userVipLevel: userVipLevel,
            lastClaimedVipLevel: userLastClaimedVipLevel,
            claimStatus: status, // "unclaimed" if the level-up bonus hasn't been claimed, "claimed" otherwise
            eligibleBonusAmount: upgradeBonusAmount, // The bonus amount for level-up
          };
        })
      );

      // Send the unclaimed level-up bonus report as a response
      res.status(200).json({
        authorized: true,
        report: levelUpBonusReport,
      });
    } catch (error) {
      console.error("Error generating VIP level-up bonus report:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

// Admin Change Password
router.post(
  "/admin/api/change-password",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { currentPassword, newPassword, confirmPassword } = req.body;

      if (newPassword.length < 8) {
        return res.status(200).json({
          success: false,
          message: {
            en: "New password must be at least 8 characters long",
            zh: "新密码至少需要8个字符",
          },
        });
      }

      if (newPassword !== confirmPassword) {
        return res.status(200).json({
          success: false,
          message: {
            en: "New password and confirm password do not match",
            zh: "新密码和确认密码不匹配",
          },
        });
      }

      const userId = req.user.userId;
      const user = await adminUser.findById(userId);
      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "未找到用户",
          },
        });
      }
      const isPasswordValid = await bcrypt.compare(
        currentPassword,
        user.password
      );
      if (!isPasswordValid) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Current password is incorrect",
            zh: "当前密码不正确",
          },
        });
      }
      if (currentPassword === newPassword) {
        return res.status(200).json({
          success: false,
          message: {
            en: "New password cannot be the same as your current password",
            zh: "新密码不能与当前密码相同",
          },
        });
      }
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await adminUser.findByIdAndUpdate(userId, {
        password: hashedPassword,
      });
      res.status(200).json({
        success: true,
        message: {
          en: "Password changed successfully",
          zh: "密码修改成功",
        },
      });
    } catch (error) {
      console.error("Error changing password:", error);
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

// Admin Track Logs
router.post("/admin/api/logtrack", authenticateAdminToken, async (req, res) => {
  try {
    const { remark } = req.body;
    const admin = await adminUser.findById(req.user.userId);
    let clientIp = req.headers["x-forwarded-for"] || req.ip;
    clientIp = clientIp.split(",")[0].trim();
    await adminLog.create({
      username: admin.username,
      fullname: admin.fullname,
      ip: clientIp,
      remark: remark,
    });
    return res.status(200).json({
      success: true,
      message: "Developer tools usage logged",
    });
  } catch (error) {
    console.error("Error logging devtools usage:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to log developer tools usage",
    });
  }
});

module.exports = router;
