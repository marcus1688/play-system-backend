const express = require("express");
const bcrypt = require("bcrypt");
const {
  User,
  userLog,
  adminUserWalletLog,
  GameDataLog,
} = require("../models/users.model");
const UserBankList = require("../models/userbanklist.model");
const { adminUser, adminLog } = require("../models/adminuser.model");
const router = express.Router();
const Deposit = require("../models/deposit.model");
const vip = require("../models/vip.model");
const Withdraw = require("../models/withdraw.model");
const RebateLog = require("../models/rebate.model");
const UserWalletCashOut = require("../models/userwalletcashout.model");
const jwt = require("jsonwebtoken");
const {
  generateToken,
  generateGameToken,
  setCookie,
  authenticateToken,
  generateRefreshToken,
  handleLoginSuccess,
  setRefreshCookie,
  clearCookie,
} = require("../auth/auth");
const { authenticateAdminToken } = require("../auth/adminAuth");
const geoip = require("geoip-lite");
const BankList = require("../models/banklist.model");
const BankTransactionLog = require("../models/banktransactionlog.model");
const UserWalletLog = require("../models/userwalletlog.model");
const Bonus = require("../models/bonus.model");
const querystring = require("querystring");
const GameWalletLog = require("../models/gamewalletlog.model");
const LuckySpinSetting = require("../models/luckyspinsetting.model");
const { updateKioskBalance } = require("../services/kioskBalanceService");
const kioskbalance = require("../models/kioskbalance.model");
const Contact = require("../models/contact.model");
const axios = require("axios");
const crypto = require("crypto");
const moment = require("moment");
const {
  AgentCommission,
  AgentCommissionReport,
} = require("../models/agent.model");
const { setConnForRequest } = require("../lib/dbContext");
const dotenv = require("dotenv");
const nodemailer = require("nodemailer");
const mg = require("nodemailer-mailgun-transport");
const { v4: uuidv4 } = require("uuid");
const messagebird = require("messagebird");
const QRCode = require("qrcode");
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

dotenv.config();

router.use(express.json());

async function generateUniqueReferralCode() {
  let referralCode;
  let isUnique = false;

  while (!isUnique) {
    referralCode = crypto.randomBytes(4).toString("hex");
    const existingUser = await User.findOne({ referralCode: referralCode });
    if (!existingUser) {
      isUnique = true;
    }
  }
  return referralCode;
}

const generateReferralLink = (referralCode) => {
  return `${process.env.REFERRAL_URL}${referralCode}`;
};

function formatSeconds(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0"
  )}:${String(secs).padStart(2, "0")}`;
}

function calculateProcessingTime(createdAtDate) {
  const approvedAt = new Date();
  const createdAt = new Date(createdAtDate);
  let timeDiff = approvedAt.getTime() - createdAt.getTime();

  let seconds = Math.floor((timeDiff / 1000) % 60);
  let minutes = Math.floor((timeDiff / (1000 * 60)) % 60);
  let hours = Math.floor((timeDiff / (1000 * 60 * 60)) % 24);

  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function parseTimeToSeconds(timeString) {
  const [hours, minutes, seconds] = timeString.split(":").map(Number);
  return hours * 3600 + minutes * 60 + seconds;
}

function formatTime(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}
//Main function for averageprocessingtime
async function updateAverageProcessingTime(
  username,
  newProcessTime,
  transactionType
) {
  const admin = await adminUser.findOne({ username: username });
  if (!admin) {
    return res.status(200).json({ message: "Admin not found!" });
  }

  const newProcessTimeInSeconds = parseTimeToSeconds(newProcessTime);

  if (transactionType === "deposit") {
    admin.totalDepositProcessingTime += newProcessTimeInSeconds;
    admin.depositTransactionCount += 1;
    if (admin.depositTransactionCount > 0) {
      const averageSeconds =
        admin.totalDepositProcessingTime / admin.depositTransactionCount;
      admin.averageDepositProcessingTime = formatTime(averageSeconds);
    }
  } else if (transactionType === "withdrawal") {
    admin.totalWithdrawalProcessingTime += newProcessTimeInSeconds;
    admin.withdrawalTransactionCount += 1;
    if (admin.withdrawalTransactionCount > 0) {
      const averageSeconds =
        admin.totalWithdrawalProcessingTime / admin.withdrawalTransactionCount;
      admin.averageWithdrawalProcessingTime = formatTime(averageSeconds);
    }
  }

  await admin.save();
}

async function adminLogAttempt(company, username, fullname, clientIp, remark) {
  await adminLog.create({
    company,
    username,
    fullname,
    loginTime: new Date(),
    ip: clientIp,
    remark,
  });
}

async function userLogAttempt(
  username,
  fullname,
  phonenumber,
  source,
  clientIp,
  ipcountry,
  ipcity,
  remark
) {
  await userLog.create({
    username,
    fullname,
    phonenumber,
    source,
    ipaddress: clientIp,
    ipcountry,
    ipcity,
    loginTime: new Date(),
    remark,
  });
}

async function updateUserReferral(
  userId,
  referralByUsername,
  adminUsername,
  adminFullname,
  clientIp
) {
  try {
    const user = await User.findById(userId);
    if (!user) {
      return {
        success: false,
        message: {
          en: "User not found",
          zh: "找不到用户",
        },
      };
    }
    const originalReferrer =
      user.referralBy && user.referralBy.username
        ? user.referralBy.username
        : "none";
    if (!referralByUsername) {
      if (user.referralBy && user.referralBy.user_id) {
        await User.updateOne(
          { _id: user.referralBy.user_id },
          { $pull: { referrals: { user_id: user._id } } }
        );
      }
      user.referralBy = null;
      await user.save();
      await adminLog.create({
        username: adminUsername,
        fullname: adminFullname,
        loginTime: new Date(),
        ip: clientIp,
        remark: `Cleared referral relationship for user: ${user.username} (previously referred by: ${originalReferrer})`,
      });
      return {
        success: true,
        message: {
          en: "Referral relationship cleared successfully",
          zh: "推荐关系已成功清除",
        },
      };
    }
    const referrer = await User.findOne({ username: referralByUsername });
    if (!referrer) {
      return {
        success: false,
        message: {
          en: "Referrer not found",
          zh: "找不到推荐人",
        },
      };
    }
    if (referrer._id.toString() === userId) {
      return {
        success: false,
        message: {
          en: "Users cannot refer themselves",
          zh: "用户不能推荐自己",
        },
      };
    }
    if (user.referralBy && user.referralBy.user_id) {
      await User.updateOne(
        { _id: user.referralBy.user_id },
        { $pull: { referrals: { user_id: user._id } } }
      );
    }
    user.referralBy = {
      user_id: referrer._id,
      username: referrer.username,
    };
    await user.save();
    const referralExists = await User.findOne({
      _id: referrer._id,
      "referrals.user_id": user._id,
    });
    if (!referralExists) {
      await User.updateOne(
        { _id: referrer._id },
        {
          $push: {
            referrals: {
              user_id: user._id,
              username: user.username,
            },
          },
        }
      );
    }
    await adminLog.create({
      username: adminUsername,
      fullname: adminFullname,
      loginTime: new Date(),
      ip: clientIp,
      remark: `Changed referral for user: ${user.username} from ${originalReferrer} to ${referrer.username}`,
    });
    return {
      success: true,
      message: {
        en: "User referral updated successfully",
        zh: "用户推荐关系更新成功",
      },
    };
  } catch (error) {
    console.error("Error updating referral relationship:", error);
    return {
      success: false,
      message: {
        en: "Internal server error when updating referral",
        zh: "更新推荐关系时发生内部服务器错误",
      },
      error: error.message,
    };
  }
}

async function generateUniqueGameId() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  let isUnique = false;

  while (!isUnique) {
    result = "";
    for (let i = 0; i < 7; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    if (result.endsWith("2x")) {
      continue;
    }

    const existingUser = await User.findOne({
      $or: [{ gameId: result }],
    });

    if (!existingUser) {
      isUnique = true;
    }
  }

  return result;
}
// Register User
router.post("/api/register", async (req, res) => {
  const {
    username,
    fullname,
    password,
    phonenumber,
    referralCode,
    isPhoneVerified,
  } = req.body;

  if (!username || !password || !fullname) {
    return res.status(200).json({
      success: false,
      message: {
        en: "Please fill in all required fields",
        zh: "请填写所有必填字段",
        zh_hk: "請填寫所有必填欄位",
        ms: "Sila isi semua ruangan yang diperlukan",
        id: "Silakan isi semua field yang diperlukan",
      },
    });
  }

  if (!/^[a-zA-Z\s]+$/.test(fullname)) {
    return res.status(200).json({
      success: false,
      message: {
        en: "Full name can only contain letters and spaces",
        zh: "全名只能包含字母和空格",
        zh_hk: "全名只可以包含字母同空格",
        ms: "Nama penuh hanya boleh mengandungi huruf dan ruang",
        id: "Nama lengkap hanya boleh berisi huruf dan spasi",
      },
    });
  }

  if (!/^[a-zA-Z0-9]+$/.test(username)) {
    return res.status(200).json({
      success: false,
      message: {
        en: "Username can only contain letters and numbers",
        zh: "用户名只能包含字母和数字",
        zh_hk: "用戶名只可以包含字母同數字",
        ms: "Nama pengguna hanya boleh mengandungi huruf dan nombor",
        id: "Username hanya boleh berisi huruf dan angka",
      },
    });
  }

  if (username.length < 6) {
    return res.status(200).json({
      success: false,
      message: {
        en: "Username must be at least 6 characters long",
        zh: "用户名长度必须至少为6个字符",
        zh_hk: "用戶名長度必須至少為6個字符",
        ms: "Nama pengguna mestilah sekurang-kurangnya 6 aksara",
        id: "Username harus minimal 6 karakter",
      },
    });
  }

  if (password.length < 8) {
    return res.status(200).json({
      success: false,
      message: {
        en: "Password must be at least 8 characters long",
        zh: "密码长度必须至少为8个字符",
        zh_hk: "密碼長度必須至少為8個字符",
        ms: "Kata laluan mestilah sekurang-kurangnya 8 aksara",
        id: "Password harus minimal 8 karakter",
      },
    });
  }
  const normalizedUsername = username.toLowerCase();
  const cleanedFullname = fullname.trim().replace(/\s+/g, " ");
  const formattedNumber = String(phonenumber).startsWith("852")
    ? String(phonenumber)
    : `852${phonenumber}`;

  const normalizedFullname = cleanedFullname.toLowerCase();
  let clientIp = req.headers["x-forwarded-for"] || req.ip;
  clientIp = clientIp.split(",")[0].trim();
  try {
    const existingUser = await User.findOne({
      $or: [{ fullname: new RegExp(`^${normalizedFullname}$`, "i") }],
    });
    if (existingUser) {
      return res.status(200).json({
        success: false,
        message: {
          en: "full name is already registered. Please try a different one.",
          zh: "全名已被注册。请尝试使用其他名称。",
          zh_hk: "全名已被註冊。請嘗試使用其他名稱。",
          ms: "Nama penuh sudah didaftarkan. Sila cuba nama yang lain.",
          id: "Nama lengkap sudah terdaftar. Silakan coba yang lain.",
        },
      });
    }
    const existingUsername = await User.findOne({
      username: normalizedUsername,
    });
    if (existingUsername) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Username is already taken. Please choose a different one.",
          zh: "用户名已被占用。请选择其他用户名。",
          zh_hk: "用戶名已被佔用。請選擇其他用戶名。",
          ms: "Nama pengguna sudah diambil. Sila pilih yang lain.",
          id: "Username sudah digunakan. Silakan pilih yang lain.",
        },
      });
    }
    const existingPhoneNumber = await User.findOne({
      phonenumber: formattedNumber,
    });

    if (existingPhoneNumber) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Phone number is already registered. Please use a different number.",
          zh: "手机号码已被注册。请使用其他号码。",
          zh_hk: "手機號碼已被註冊。請使用其他號碼。",
          ms: "Nombor telefon sudah didaftarkan. Sila gunakan nombor yang berbeza.",
          id: "Nomor telepon sudah terdaftar. Silakan gunakan nomor yang berbeda.",
        },
      });
    }

    const allUsersWithSameIp = await User.find({
      $or: [{ lastLoginIp: clientIp }, { registerIp: clientIp }],
    });

    const isDuplicateIP = allUsersWithSameIp.length > 0;

    if (isDuplicateIP) {
      const userIdsToUpdate = allUsersWithSameIp.map((u) => u._id);
      if (userIdsToUpdate.length > 0) {
        await User.updateMany(
          { _id: { $in: userIdsToUpdate } },
          { $set: { duplicateIP: true } }
        );
      }
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const newReferralCode = await generateUniqueReferralCode();
    const referralLink = generateReferralLink(newReferralCode);
    const referralQrCode = await QRCode.toDataURL(referralLink);

    let referralBy = null;
    if (referralCode) {
      const referrer = await User.findOne({ referralCode: referralCode });
      if (referrer) {
        referralBy = {
          user_id: referrer._id,
          username: referrer.username,
        };
      }
    }

    const newUser = await User.create({
      username: normalizedUsername,
      fullname: normalizedFullname,
      password: hashedPassword,
      phonenumber: formattedNumber,
      registerIp: clientIp,
      referralLink,
      referralCode: newReferralCode,
      referralQrCode,
      referralBy,
      duplicateIP: isDuplicateIP,
      isPhoneVerified: isPhoneVerified,
      viplevel: "Bronze",
      gameId: await generateUniqueGameId(),
    });

    if (referralBy) {
      await User.findByIdAndUpdate(referralBy.user_id, {
        $push: {
          referrals: {
            user_id: newUser._id,
            username: newUser.username,
          },
        },
      });
    }
    res.status(200).json({
      success: true,
      message: {
        en: "User created successfully",
        zh: "用户创建成功",
        zh_hk: "用戶建立成功",
        ms: "Pengguna berjaya dicipta",
        id: "Pengguna berhasil dibuat",
      },
    });
  } catch (error) {
    console.error("Error occurred while creating user:", error);
    res.status(200).json({
      success: false,
      message: {
        en: "Registration failed due to a system error. Please try again later",
        zh: "由于系统错误，注册失败。请稍后再试",
        zh_hk: "由於系統錯誤，註冊失敗。請稍後再試",
        ms: "Pendaftaran gagal kerana ralat sistem. Sila cuba lagi kemudian",
        id: "Registrasi gagal karena kesalahan sistem. Silakan coba lagi nanti",
      },
    });
  }
});

// Refresh Token

// User Login
router.post("/api/login", loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  const normalizedUsername = username.toLowerCase();
  let clientIp = req.headers["x-forwarded-for"] || req.ip;
  clientIp = clientIp.split(",")[0].trim();
  const geo = geoip.lookup(clientIp);
  try {
    const user = await User.findOne({
      username: normalizedUsername,
    });
    if (!user) {
      await userLogAttempt(
        normalizedUsername,
        "-",
        null,
        req.get("User-Agent"),
        clientIp,
        geo ? geo.country : "Unknown",
        geo ? geo.city : "Unknown",
        `Invalid Login: Wrong Username Attempted ${normalizedUsername}`
      );
      return res.status(200).json({
        success: false,
        message: {
          en: "Login unsuccessful. Please ensure your details are correct or contact customer service.",
          zh: "登录失败。请确认您的信息正确或联系客服。",
          zh_hk: "登入失敗。請確認你嘅資料正確或聯繫客服。",
          ms: "Log masuk tidak berjaya. Sila pastikan butiran anda betul atau hubungi khidmat pelanggan.",
          id: "Login gagal. Silakan pastikan detail Anda benar atau hubungi layanan pelanggan.",
        },
      });
    }
    const isPasswordCorrect = await bcrypt.compare(password, user.password);
    if (!isPasswordCorrect) {
      await userLogAttempt(
        user.username,
        user.fullname,
        user.phonenumber,
        req.get("User-Agent"),
        clientIp,
        geo ? geo.country : "Unknown",
        geo ? geo.city : "Unknown",
        `Invalid Login: Wrong Password Attempted ${password}`
      );
      return res.status(200).json({
        success: false,
        message: {
          en: "Login unsuccessful. Please ensure your details are correct or contact customer service.",
          zh: "登录失败。请确认您的信息正确或联系客服。",
          zh_hk: "登入失敗。請確認你嘅資料正確或聯繫客服。",
          ms: "Log masuk tidak berjaya. Sila pastikan butiran anda betul atau hubungi khidmat pelanggan.",
          id: "Login gagal. Silakan pastikan detail Anda benar atau hubungi layanan pelanggan.",
        },
      });
    }
    if (user.status === false) {
      await userLogAttempt(
        user.username,
        user.fullname,
        user.phonenumber,
        req.get("User-Agent"),
        clientIp,
        geo ? geo.country : "Unknown",
        geo ? geo.city : "Unknown",
        "Invalid Login: Account Is Inactive"
      );
      return res.status(200).json({
        success: false,
        status: "inactive",
        message: {
          en: "Your account is currently inactive",
          zh: "您的账号当前未激活",
          zh_hk: "你嘅賬號目前未激活",
          ms: "Akaun anda kini tidak aktif",
          id: "Akun Anda saat ini tidak aktif",
        },
      });
    }
    const allUsersWithSameIp = await User.find({
      _id: { $ne: user._id },
      $or: [{ lastLoginIp: clientIp }, { registerIp: clientIp }],
    });

    const isDuplicateIP = allUsersWithSameIp.length > 0;

    if (isDuplicateIP) {
      const userIdsToUpdate = [
        ...allUsersWithSameIp.map((u) => u._id),
        user._id,
      ];
      await User.updateMany(
        { _id: { $in: userIdsToUpdate } },
        { $set: { duplicateIP: true } }
      );
    }
    await User.findByIdAndUpdate(user._id, {
      lastLogin: new Date(),
      lastLoginIp: clientIp,
    });

    const { token, refreshToken, newGameToken } = await handleLoginSuccess(
      user._id
    );

    await userLogAttempt(
      user.username,
      user.fullname,
      user.phonenumber,
      req.get("User-Agent"),
      clientIp,
      geo ? geo.country : "Unknown",
      geo ? geo.city : "Unknown",
      isDuplicateIP ? "Login Success - Duplicate IP Detected" : "Login Success"
    );
    res.status(200).json({
      success: true,
      token,
      refreshToken,
      newGameToken,
      message: {
        en: "Login successful",
        zh: "登录成功",
        zh_hk: "登入成功",
        ms: "Log masuk berjaya",
        id: "Login berhasil",
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: {
        en: "An error occurred. Please try again later",
        zh: "发生错误，请稍后再试",
        zh_hk: "發生錯誤，請稍後再試",
        ms: "Ralat berlaku. Sila cuba lagi kemudian",
        id: "Terjadi kesalahan. Silakan coba lagi nanti",
      },
    });
  }
});

// Refresh Token
router.post("/api/refresh-token", async (req, res) => {
  const authHeader = req.headers["authorization"];
  const refreshToken = authHeader && authHeader.split(" ")[1];
  if (!refreshToken) {
    return res.status(401).json({ message: "Refresh token not provided" });
  }
  try {
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    const newToken = await generateToken(decoded.userId);

    res.json({
      success: true,
      token: newToken,
    });
  } catch (error) {
    res.status(401).json({ message: "Invalid refresh token" });
  }
});

router.post("/api/game-token", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);

    const newGameToken = await generateGameToken(user._id);

    return res.status(200).json({
      success: true,
      gameToken: newGameToken,
    });
  } catch (error) {
    res.status(401).json({ message: "Invalid game token" });
  }
});

router.post(
  "/api/game-token-validtest",
  authenticateToken,
  async (req, res) => {
    const userId = req.user.userId;
    const user = await User.findById(userId);

    try {
      const { gameToken } = req.body;

      const decodedToken = jwt.verify(gameToken, process.env.JWT_GAME_SECRET);

      return res.status(200).json({
        success: true,
      });
    } catch (error) {
      if (
        error.message === "jwt expired" ||
        error.message === "invalid token" ||
        error.message === "jwt malformed"
      ) {
        const newGameToken = await generateGameToken(user._id);

        return res.status(200).json({
          success: false,
          gameToken: newGameToken,
        });
      } else {
        res.status(401).json({ message: "Invalid game token" });
      }
    }
  }
);

// Logout User
router.post("/api/logout", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    let clientIp = req.headers["x-forwarded-for"] || req.ip;
    clientIp = clientIp.split(",")[0].trim();
    const geo = geoip.lookup(clientIp);
    await userLogAttempt(
      user.username,
      user.fullname,
      user.phonenumber,
      req.get("User-Agent"),
      clientIp,
      geo ? geo.country : "Unknown",
      geo ? geo.city : "Unknown",
      "Logout Success"
    );
    res.status(200).json({
      success: true,
      message: {
        en: "Logout successful",
        zh: "登出成功",
        zh_hk: "登出成功",
        ms: "Log keluar berjaya",
        id: "Logout berhasil",
      },
    });
  } catch (error) {
    console.error("Error occurred while logging out:", error);
    res.status(500).json({
      success: false,
      message: {
        en: "An error occurred while logging out",
        zh: "登出时发生错误",
        zh_hk: "登出時發生錯誤",
        ms: "Ralat berlaku semasa log keluar",
        id: "Terjadi kesalahan saat logout",
      },
    });
  }
});

// Get User Data
router.get("/api/userdata", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId).select(
      "fullname username bankAccounts positionTaking totaldeposit email telegramId facebookId lastLogin phonenumber wallet createdAt dob withdrawlock rebate email isPhoneVerified isEmailVerified monthlyBonusCountdownTime monthlyLoyaltyCountdownTime weeklySignInTime totaldeposit viplevel cryptoWallet luckySpinCount referralLink referralCode referralQrCode totalturnover firstDepositDate luckySpinAmount luckySpinClaim"
    );
    if (!user) {
      return res.status(200).json({ message: "用户未找到" });
    }
    res.status(200).json({ success: true, user });
  } catch (error) {
    console.error("Error occurred while retrieving user data:", error);
    res.status(200).json({ message: "Internal server error" });
  }
});

// Change User Password
router.post("/api/changepassword", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { oldPassword, newPassword, confirmPassword } = req.body;
    if (!oldPassword || !newPassword || !confirmPassword) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Please enter both old password and new password",
          zh: "请输入旧密码和新密码",
          zh_hk: "請輸入舊密碼同新密碼",
          ms: "Sila masukkan kata laluan lama dan kata laluan baru",
          id: "Silakan masukkan password lama dan password baru",
        },
      });
    }
    if (newPassword !== confirmPassword) {
      return res.status(200).json({
        success: false,
        message: {
          en: "New passwords do not match",
          zh: "输入的新密码不匹配",
          zh_hk: "輸入嘅新密碼不匹配",
          ms: "Kata laluan baru tidak sepadan",
          id: "Password baru tidak cocok",
        },
      });
    }
    if (newPassword.length < 8) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Password must be at least 8 characters long",
          zh: "密码长度必须至少为8个字符",
          zh_hk: "密碼長度必須至少為8個字符",
          ms: "Kata laluan mestilah sekurang-kurangnya 8 aksara",
          id: "Password harus minimal 8 karakter",
        },
      });
    }
    const user = await User.findById(userId);
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Current password is incorrect",
          zh: "当前密码不正确",
          zh_hk: "當前密碼不正確",
          ms: "Kata laluan semasa tidak betul",
          id: "Password saat ini salah",
        },
      });
    }
    if (oldPassword === newPassword) {
      return res.status(200).json({
        success: false,
        message: {
          en: "New password cannot be the same as the current password",
          zh: "新密码不能与当前密码相同",
          zh_hk: "新密碼不可以同當前密碼相同",
          ms: "Kata laluan baru tidak boleh sama dengan kata laluan semasa",
          id: "Password baru tidak boleh sama dengan password saat ini",
        },
      });
    }
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    user.password = hashedPassword;
    await user.save();
    res.status(200).json({
      success: true,
      message: {
        en: "Password has been changed successfully",
        zh: "密码修改成功",
        zh_hk: "密碼修改成功",
        ms: "Kata laluan telah berjaya ditukar",
        id: "Password berhasil diubah",
      },
    });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({
      success: false,
      message: {
        en: "An error occurred. Please try again later",
        zh: "发生错误，请稍后再试",
        zh_hk: "發生錯誤，請稍後再試",
        ms: "Ralat berlaku. Sila cuba lagi kemudian",
        id: "Terjadi kesalahan. Silakan coba lagi nanti",
      },
    });
  }
});

// Add Bank
router.post("/api/addbank", async (req, res) => {
  try {
    const { name, bankname, banknumber } = req.body;
    if (!bankname || !banknumber || !name) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Bank name, account number and name cannot be empty",
          zh: "银行名称、账号和姓名不能为空",
          zh_hk: "銀行名稱、賬號同姓名不可以為空",
          ms: "Nama bank, nombor akaun dan nama tidak boleh kosong",
          id: "Nama bank, nomor rekening dan nama tidak boleh kosong",
        },
      });
    }

    const normalizedName = name.toLowerCase();
    const user = await User.findOne({ fullname: normalizedName });
    if (!user) {
      return res.status(200).json({
        success: false,
        message: {
          en: "User not found",
          zh: "找不到用户",
          zh_hk: "搵唔到用戶",
          ms: "Pengguna tidak dijumpai",
          id: "Pengguna tidak ditemukan",
        },
      });
    }
    if (user.bankAccounts.length >= 1) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Maximum 1 bank accounts allowed",
          zh: "最多只能添加1个银行账户",
          zh_hk: "最多只可以新增1個銀行賬戶",
          ms: "Maksimum 1 akaun bank dibenarkan",
          id: "Maksimal 1 rekening bank diizinkan",
        },
      });
    }
    user.bankAccounts.push({ name, bankname, banknumber });
    await user.save();
    res.json({
      success: true,
      message: {
        en: "Bank account added successfully",
        zh: "银行账户添加成功",
        zh_hk: "銀行賬戶新增成功",
        ms: "Akaun bank berjaya ditambah",
        id: "Rekening bank berhasil ditambahkan",
      },
    });
  } catch (error) {
    console.error("Error in addbank API:", error);
    res.status(500).json({
      success: false,
      message: {
        en: "Internal server error",
        zh: "服务器内部错误",
        zh_hk: "伺服器內部錯誤",
        ms: "Ralat dalaman pelayan",
        id: "Kesalahan server internal",
      },
    });
  }
});

// Get User Bank
router.get("/api/getbank", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("bankAccounts");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    res.json({
      success: true,
      data: user.bankAccounts,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Delete User Bank
router.delete("/api/userbank", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { bankAccountId } = req.body;
    const result = await User.updateOne(
      { _id: userId },
      { $pull: { bankAccounts: { _id: bankAccountId } } }
    );
    if (result.matchedCount === 0) {
      return res.status(200).json({
        success: false,
        message: {
          en: "User not found",
          zh: "找不到用户",
        },
      });
    }
    res.status(200).json({
      success: true,
      message: {
        en: "Bank account deleted successfully",
        zh: "银行账户已成功删除",
      },
    });
  } catch (error) {
    console.error("Error deleting bank account:", error);
    res.status(500).json({
      success: false,
      message: {
        en: "Failed to delete bank account",
        zh: "删除银行账户失败",
      },
    });
  }
});

async function checkAndUpdateVIPLevel(userId) {
  try {
    const user = await User.findById(userId);
    if (!user) {
      console.error("User not found when checking VIP level");
      return { success: false, message: "User not found" };
    }
    const vipSettings = await vip.findOne({});
    if (
      !vipSettings ||
      !vipSettings.vipLevels ||
      vipSettings.vipLevels.length === 0
    ) {
      console.error("VIP settings not found");
      return { success: false, message: "VIP settings not found" };
    }
    const totalDeposit = user.totaldeposit;
    const sortedVipLevels = [...vipSettings.vipLevels].sort((a, b) => {
      let depositA = 0;
      let depositB = 0;
      if (a.benefits instanceof Map) {
        depositA = parseFloat(a.benefits.get("Total Deposit") || 0);
      } else {
        depositA = parseFloat(a.benefits["Total Deposit"] || 0);
      }

      if (b.benefits instanceof Map) {
        depositB = parseFloat(b.benefits.get("Total Deposit") || 0);
      } else {
        depositB = parseFloat(b.benefits["Total Deposit"] || 0);
      }

      return depositB - depositA;
    });
    let newLevel = null;
    for (const level of sortedVipLevels) {
      let requiredDeposit = 0;
      if (level.benefits instanceof Map) {
        requiredDeposit = parseFloat(level.benefits.get("Total Deposit") || 0);
      } else {
        requiredDeposit = parseFloat(level.benefits["Total Deposit"] || 0);
      }
      if (totalDeposit >= requiredDeposit) {
        newLevel = level.name;
        break;
      }
    }
    if (!newLevel && sortedVipLevels.length > 0) {
      const lowestLevelIndex = sortedVipLevels.length - 1;
      newLevel = sortedVipLevels[lowestLevelIndex].name;
    }
    if (newLevel && newLevel !== user.viplevel) {
      const oldLevel = user.viplevel;
      user.viplevel = newLevel;
      await user.save();
      console.log(
        `User ${user.username} VIP level updated from ${oldLevel} to ${newLevel}`
      );
      try {
        // 假设您有一个VIPChangeLog模型来记录VIP变更
        /*
        await new VIPChangeLog({
          userId: user._id,
          username: user.username,
          oldLevel,
          newLevel,
          reason: "Total deposit threshold reached",
          totalDeposit: user.totaldeposit
        }).save();
        */
      } catch (logError) {
        console.error("Error logging VIP change:", logError);
      }
      return {
        success: true,
        message: "VIP level updated",
        oldLevel,
        newLevel,
      };
    }

    return {
      success: true,
      message: "VIP level checked, no update needed",
      currentLevel: user.viplevel,
    };
  } catch (error) {
    console.error("Error in checkAndUpdateVIPLevel:", error);
    return {
      success: false,
      message: "Internal server error",
      error: error.message,
    };
  }
}

// Admin Approve Deposit
router.post(
  "/admin/api/approvedeposit/:depositId",
  authenticateAdminToken,
  async (req, res) => {
    const { depositId } = req.params;
    const userId = req.user.userId;
    const adminuser = await adminUser.findById(userId);
    if (!adminuser) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Admin User not found, please contact customer service",
          zh: "未找到管理员用户，请联系客户服务",
        },
      });
    }
    try {
      const deposit = await Deposit.findById(depositId);
      if (!deposit) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Deposit record not found",
            zh: "找不到存款记录",
          },
        });
      }
      if (deposit.status !== "pending") {
        return res.status(200).json({
          success: false,
          message: {
            en: "Deposit has been processed or status is incorrect",
            zh: "存款已处理或状态不正确",
          },
        });
      }
      const user = await User.findOne({ username: deposit.username });
      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "找不到用户",
          },
        });
      }
      const bank = await BankList.findById(deposit.bankid);
      if (!bank) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Bank not found",
            zh: "找不到银行",
          },
        });
      }

      const kioskSettings = await kioskbalance.findOne({});
      if (kioskSettings && kioskSettings.status) {
        const kioskResult = await updateKioskBalance(
          "subtract",
          deposit.amount,
          {
            username: user.username,
            transactionType: "deposit approval",
            remark: `Deposit ID: ${deposit._id}`,
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

      const formattedProcessTime = calculateProcessingTime(deposit.createdAt);
      if (user.firstDepositDate === null) {
        user.firstDepositDate = deposit.createdAt;
        deposit.newDeposit = true;
      }

      deposit.status = "approved";
      deposit.processBy = adminuser.username;
      deposit.processtime = formattedProcessTime;
      await deposit.save();

      // const spinSetting = await LuckySpinSetting.findOne();
      // if (spinSetting) {
      //   const spinCount = Math.floor(
      //     deposit.amount / spinSetting.depositAmount
      //   );
      //   if (spinCount > 0) {
      //     user.luckySpinCount = (user.luckySpinCount || 0) + spinCount;
      //   }
      // }

      user.totaldeposit += deposit.amount;
      user.lastdepositdate = new Date();
      user.wallet += deposit.amount;
      await user.save();

      await checkAndUpdateVIPLevel(user._id);

      const walletLog = await UserWalletLog.findOne({
        transactionid: deposit.transactionId,
        status: "pending",
      });

      if (walletLog) {
        walletLog.status = "approved";
        await walletLog.save();
      } else {
        console.error("UserWalletLog record not found for the deposit.");
      }

      bank.totalDeposits += deposit.amount;
      bank.currentbalance =
        bank.startingbalance +
        bank.totalDeposits -
        bank.totalWithdrawals +
        bank.totalCashIn -
        bank.totalCashOut;
      await bank.save();

      const depositLog = new BankTransactionLog({
        bankName: bank.bankname,
        ownername: bank.ownername,
        remark: deposit.remark,
        lastBalance: bank.currentbalance - deposit.amount,
        currentBalance: bank.currentbalance,
        processby: adminuser.username,
        qrimage: bank.qrimage,
        playerusername: user.username,
        playerfullname: user.fullname,
        transactiontype: deposit.transactionType,
        amount: deposit.amount,
      });
      await depositLog.save();

      await updateAverageProcessingTime(
        adminuser.username,
        deposit.processtime,
        "deposit"
      );

      res.status(200).json({
        success: true,
        message: {
          en: "Deposit approved successfully, wallet balance updated",
          zh: "存款已成功批准，钱包余额已更新",
        },
      });
    } catch (error) {
      console.error("Error occurred while approving deposit:", error);
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

// Admin Approve Withdraw
router.post(
  "/admin/api/approvewithdraw/:withdrawId",
  authenticateAdminToken,
  async (req, res) => {
    const { withdrawId } = req.params;
    const { bankId, cashoutAmount } = req.body;
    const userId = req.user.userId;
    const adminuser = await adminUser.findById(userId);
    if (!adminuser) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Admin User not found, please contact customer service",
          zh: "未找到管理员用户，请联系客户服务",
        },
      });
    }
    try {
      const withdraw = await Withdraw.findById(withdrawId);
      if (!withdraw) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Withdraw record not found",
            zh: "找不到提款记录",
          },
        });
      }
      if (withdraw.status !== "pending") {
        return res.status(200).json({
          success: false,
          message: {
            en: "Withdraw has been processed or status is incorrect",
            zh: "提款已处理或状态不正确",
          },
        });
      }
      const bank = await BankList.findById(bankId);
      if (!bank) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Bank not found",
            zh: "找不到银行",
          },
        });
      }
      const actualWithdrawAmount =
        cashoutAmount && cashoutAmount > 0
          ? withdraw.amount - cashoutAmount
          : withdraw.amount;
      if (actualWithdrawAmount <= 0) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Invalid withdraw amount after cashout adjustment",
            zh: "调整后的提款金额无效",
          },
        });
      }
      if (bank.currentbalance < actualWithdrawAmount) {
        return res.status(200).json({
          success: false,
          message: {
            en: "The bank's current balance is insufficient to cover this withdrawal",
            zh: "银行当前余额不足以支付此提款",
          },
        });
      }
      const user = await User.findOne({ username: withdraw.username });
      const formattedProcessTime = calculateProcessingTime(withdraw.createdAt);
      const kioskSettings = await kioskbalance.findOne({});
      if (kioskSettings && kioskSettings.status) {
        const kioskResult = await updateKioskBalance(
          "add",
          actualWithdrawAmount,
          {
            username: user.username,
            transactionType: "withdraw approval",
            remark: `Withdraw ID: ${withdraw._id}`,
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
      bank.totalWithdrawals += actualWithdrawAmount;
      bank.currentbalance =
        bank.startingbalance +
        bank.totalDeposits -
        bank.totalWithdrawals +
        bank.totalCashIn -
        bank.totalCashOut;
      await bank.save();
      if (cashoutAmount && cashoutAmount > 0) {
        withdraw.remark = `Original Amount: ${withdraw.amount}\nCashout: ${cashoutAmount}\nActual Withdraw: ${actualWithdrawAmount}`;
      }
      withdraw.amount = actualWithdrawAmount;
      withdraw.status = "approved";
      withdraw.processBy = adminuser.username;
      withdraw.processtime = formattedProcessTime;
      withdraw.withdrawbankid = bankId;
      await withdraw.save();
      const walletLog = await UserWalletLog.findOne({
        transactionid: withdraw.transactionId,
        status: "pending",
      });

      if (walletLog) {
        walletLog.status = "approved";
        walletLog.amount = actualWithdrawAmount;
        await walletLog.save();
      } else {
        console.error("UserWalletLog record not found for the Withdraw.");
      }
      user.totalwithdraw += actualWithdrawAmount;
      await user.save();
      const withdrawLog = new BankTransactionLog({
        bankName: bank.bankname,
        ownername: bank.ownername,
        remark: withdraw.remark,
        lastBalance: bank.currentbalance + actualWithdrawAmount,
        currentBalance: bank.currentbalance,
        processby: adminuser.username,
        qrimage: bank.qrimage,
        playerusername: user.username,
        playerfullname: user.fullname,
        transactiontype: withdraw.transactionType,
        amount: actualWithdrawAmount,
      });
      await withdrawLog.save();

      await updateAverageProcessingTime(
        adminuser.username,
        withdraw.processtime,
        "withdrawal"
      );
      res.status(200).json({
        success: true,
        message: {
          en: "Withdrawal approved successfully",
          zh: "提款已成功批准",
        },
      });
    } catch (error) {
      console.error("Error occurred while approving withdrawal:", error);
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

// Admin Approve Bonus
router.post(
  "/admin/api/approvebonus/:bonusId",
  authenticateAdminToken,
  async (req, res) => {
    const { bonusId } = req.params;
    const userId = req.user.userId;
    const adminuser = await adminUser.findById(userId);
    if (!adminuser) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Admin User not found, please contact customer service",
          zh: "未找到管理员用户，请联系客户服务",
        },
      });
    }

    try {
      const bonus = await Bonus.findById(bonusId);
      if (!bonus) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Bonus record not found",
            zh: "找不到奖金记录",
          },
        });
      }
      if (bonus.status !== "pending") {
        return res.status(200).json({
          success: false,
          message: {
            en: "Bonus has been processed or status is incorrect",
            zh: "奖金已处理或状态不正确",
          },
        });
      }
      const user = await User.findOne({ username: bonus.username });
      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "找不到用户",
          },
        });
      }

      const kioskSettings = await kioskbalance.findOne({});
      if (kioskSettings && kioskSettings.status) {
        const kioskResult = await updateKioskBalance("subtract", bonus.amount, {
          username: user.username,
          transactionType: "bonus approval",
          remark: `Bonus ID: ${bonus._id}`,
          processBy: adminuser.username,
        });

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

      const formattedProcessTime = calculateProcessingTime(bonus.createdAt);

      bonus.status = "approved";
      bonus.processBy = adminuser.username;
      bonus.processtime = formattedProcessTime;
      await bonus.save();

      user.totalbonus += bonus.amount;
      user.wallet += bonus.amount;
      if (bonus.isLuckySpin) {
        user.luckySpinClaim = true;
      }
      await user.save();

      const walletLog = await UserWalletLog.findOne({
        transactionid: bonus.transactionId,
        status: "pending",
      });

      if (walletLog) {
        walletLog.status = "approved";
        await walletLog.save();
      } else {
        console.error("UserWalletLog record not found for the bonus.");
      }

      await updateAverageProcessingTime(
        adminuser.username,
        bonus.processtime,
        "bonus"
      );
      res.status(200).json({
        success: true,
        message: {
          en: "Bonus approved successfully, wallet balance updated",
          zh: "奖金已成功批准，钱包余额已更新",
        },
      });
    } catch (error) {
      console.error("Error occurred while approving bonus:", error);
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

// Admin Reject Deposit
router.post(
  "/admin/api/rejectdeposit/:depositId",
  authenticateAdminToken,
  async (req, res) => {
    const { depositId } = req.params;
    const { rejectRemark } = req.body;
    const userId = req.user.userId;
    const adminuser = await adminUser.findById(userId);
    if (!adminuser) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Admin User not found, please contact customer service",
          zh: "未找到管理员用户，请联系客户服务",
        },
      });
    }
    try {
      const deposit = await Deposit.findById(depositId);
      if (!deposit) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Deposit record not found",
            zh: "找不到存款记录",
          },
        });
      }
      if (deposit.status !== "pending") {
        return res.status(200).json({
          success: false,
          message: {
            en: "Deposit has been processed or status is incorrect",
            zh: "存款已处理或状态不正确",
          },
        });
      }

      const formattedProcessTime = calculateProcessingTime(deposit.createdAt);

      deposit.status = "rejected";
      deposit.processBy = adminuser.username;
      deposit.processtime = formattedProcessTime;
      deposit.remark = rejectRemark;
      await deposit.save();

      const walletLog = await UserWalletLog.findOne({
        transactionid: deposit.transactionId,
        status: "pending",
      });

      if (walletLog) {
        walletLog.status = "rejected";
        walletLog.promotionnameEN = rejectRemark;
        await walletLog.save();
      } else {
        console.error("UserWalletLog record not found for the deposit.");
      }

      await updateAverageProcessingTime(
        adminuser.username,
        deposit.processtime,
        "deposit"
      );

      res.status(200).json({
        success: true,
        message: {
          en: "Deposit rejected successfully",
          zh: "存款已成功拒绝",
        },
      });
    } catch (error) {
      console.error("Error occurred while rejecting deposit:", error);
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

// Admin Reject Withdraw
router.post(
  "/admin/api/rejectwithdraw/:withdrawId",
  authenticateAdminToken,
  async (req, res) => {
    const { withdrawId } = req.params;
    const { rejectRemark } = req.body;
    const userId = req.user.userId;
    const adminuser = await adminUser.findById(userId);
    if (!adminuser) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Admin User not found, please contact customer service",
          zh: "未找到管理员用户，请联系客户服务",
        },
      });
    }
    try {
      const withdraw = await Withdraw.findById(withdrawId);
      if (!withdraw) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Withdrawal record not found",
            zh: "找不到提款记录",
          },
        });
      }

      if (withdraw.status !== "pending") {
        return res.status(200).json({
          success: false,
          message: {
            en: "Withdrawal has been processed or status is incorrect",
            zh: "提款已处理或状态不正确",
          },
        });
      }

      const user = await User.findOne({ username: withdraw.username });
      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "找不到用户",
          },
        });
      }

      const formattedProcessTime = calculateProcessingTime(withdraw.createdAt);

      user.wallet += withdraw.amount;
      await user.save();

      withdraw.status = "rejected";
      withdraw.processBy = adminuser.username;
      withdraw.processtime = formattedProcessTime;
      withdraw.remark = rejectRemark;
      await withdraw.save();

      const walletLog = await UserWalletLog.findOne({
        transactionid: withdraw.transactionId,
        status: "pending",
      });

      if (walletLog) {
        walletLog.status = "rejected";
        walletLog.promotionnameEN = rejectRemark;
        await walletLog.save();
      } else {
        console.error("UserWalletLog record not found for the Withdraw.");
      }

      await updateAverageProcessingTime(
        adminuser.username,
        withdraw.processtime,
        "withdrawal"
      );

      res.status(200).json({
        success: true,
        message: {
          en: "Withdrawal rejected successfully, wallet balance updated",
          zh: "提款已成功拒绝，钱包余额已更新",
        },
      });
    } catch (error) {
      console.error("Error occurred while rejecting withdrawal:", error);
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

// Admin Reject Bonus
router.post(
  "/admin/api/rejectbonus/:bonusId",
  authenticateAdminToken,
  async (req, res) => {
    const { bonusId } = req.params;
    const { rejectRemark } = req.body;
    const userId = req.user.userId;
    const adminuser = await adminUser.findById(userId);
    if (!adminuser) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Admin User not found, please contact customer service",
          zh: "未找到管理员用户，请联系客户服务",
        },
      });
    }
    try {
      const bonus = await Bonus.findById(bonusId);
      if (!bonus) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Bonus record not found",
            zh: "找不到奖金记录",
          },
        });
      }
      if (bonus.status !== "pending") {
        return res.status(200).json({
          success: false,
          message: {
            en: "Bonus has been processed or status is incorrect",
            zh: "奖金已处理或状态不正确",
          },
        });
      }

      const formattedProcessTime = calculateProcessingTime(bonus.createdAt);

      bonus.status = "rejected";
      bonus.processBy = adminuser.username;
      bonus.processtime = formattedProcessTime;
      bonus.remark = rejectRemark;
      await bonus.save();

      const walletLog = await UserWalletLog.findOne({
        transactionid: bonus.transactionId,
        status: "pending",
      });

      if (walletLog) {
        walletLog.status = "rejected";
        walletLog.promotionnameEN = rejectRemark;
        await walletLog.save();
      } else {
        console.error("UserWalletLog record not found for the bonus.");
      }
      await updateAverageProcessingTime(
        adminuser.username,
        bonus.processtime,
        "bonus"
      );

      res.status(200).json({
        success: true,
        message: {
          en: "Bonus rejected successfully",
          zh: "奖金已成功拒绝",
        },
      });
    } catch (error) {
      console.error("Error occurred while rejecting bonus:", error);
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

// Admin Revert Deposit
router.post(
  "/admin/api/revertdeposit/:depositId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { depositId } = req.params;
      const userId = req.user.userId;
      const adminuser = await adminUser.findById(userId);
      if (!adminuser) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Admin User not found, please contact customer service",
            zh: "未找到管理员用户，请联系客户服务",
          },
        });
      }
      const deposit = await Deposit.findById(depositId);
      if (!deposit) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Deposit record not found",
            zh: "找不到存款记录",
          },
        });
      }
      if (deposit.status !== "approved" || deposit.reverted) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Unable to revert this deposit",
            zh: "无法撤销此存款",
          },
        });
      }
      const user = await User.findOne({ username: deposit.username });
      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "找不到用户",
          },
        });
      }
      if (user.wallet < deposit.amount) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Insufficient wallet balance for reversion",
            zh: "钱包余额不足，无法撤销",
          },
        });
      }
      const bank = await BankList.findById(deposit.bankid);
      if (!bank) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Bank account not found",
            zh: "找不到银行账户",
          },
        });
      }

      const kioskSettings = await kioskbalance.findOne({});
      if (kioskSettings && kioskSettings.status) {
        const kioskResult = await updateKioskBalance("add", deposit.amount, {
          username: user.username,
          transactionType: "deposit reverted",
          remark: `Deposit ID: ${deposit._id}`,
          processBy: adminuser.username,
        });
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

      if (
        user.firstDepositDate &&
        moment(deposit.createdAt).isSame(moment(user.firstDepositDate))
      ) {
        user.firstDepositDate = null;
        deposit.newDeposit = false;
      }

      // const spinSetting = await LuckySpinSetting.findOne();
      // if (spinSetting) {
      //   const spinCount = Math.floor(
      //     deposit.amount / spinSetting.depositAmount
      //   );
      //   if (user.luckySpinCount < spinCount) {
      //     return res.status(200).json({
      //       success: false,
      //       message: {
      //         en: "User does not have enough Lucky Spins to revert",
      //         zh: "用户没有足够的幸运转盘次数可撤销",
      //       },
      //     });
      //   }
      //   user.luckySpinCount -= spinCount;
      // }

      user.wallet -= deposit.amount;
      user.totaldeposit -= deposit.amount;
      await user.save();

      await checkAndUpdateVIPLevel(user._id);

      bank.currentbalance -= deposit.amount;
      bank.totalDeposits -= deposit.amount;
      await bank.save();

      deposit.reverted = true;
      deposit.status = "reverted";
      deposit.revertedProcessBy = adminuser.username;
      await deposit.save();

      const walletLog = await UserWalletLog.findOne({
        transactionid: deposit.transactionId,
      });

      if (walletLog) {
        walletLog.status = "cancel";
        await walletLog.save();
      } else {
        console.error("UserWalletLog record not found for the deposit.");
      }

      adminuser.totalRevertedDeposits += 1;
      await adminuser.save();

      const transactionLog = new BankTransactionLog({
        bankName: bank.bankname,
        ownername: bank.ownername,
        remark: deposit.remark || "-",
        lastBalance: bank.currentbalance + deposit.amount,
        currentBalance: bank.currentbalance,
        processby: adminuser.username,
        transactiontype: "reverted deposit",
        amount: deposit.amount,
        qrimage: bank.qrimage,
        playerusername: user.username,
        playerfullname: user.fullname,
      });
      await transactionLog.save();

      res.status(200).json({
        success: true,
        message: {
          en: "Deposit successfully reverted and user wallet updated",
          zh: "存款已成功撤销并更新用户钱包",
        },
      });
    } catch (error) {
      console.error("Error during deposit reversion:", error);
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

// Admin Revert Withdraw
router.post(
  "/admin/api/revertwithdraw/:withdrawId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { withdrawId } = req.params;
      const userId = req.user.userId;
      const adminuser = await adminUser.findById(userId);
      if (!adminuser) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Admin User not found, please contact customer service",
            zh: "未找到管理员用户，请联系客户服务",
          },
        });
      }
      const withdraw = await Withdraw.findById(withdrawId);
      if (!withdraw) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Withdrawal record not found",
            zh: "找不到提款记录",
          },
        });
      }
      if (withdraw.status !== "approved" || withdraw.reverted) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Unable to revert this withdrawal",
            zh: "无法撤销此提款",
          },
        });
      }
      const user = await User.findOne({ username: withdraw.username });
      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "找不到用户",
          },
        });
      }
      const bank = await BankList.findById(withdraw.withdrawbankid);
      if (!bank) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Bank account not found",
            zh: "找不到银行账户",
          },
        });
      }

      const kioskSettings = await kioskbalance.findOne({});
      if (kioskSettings && kioskSettings.status) {
        const kioskResult = await updateKioskBalance(
          "subtract",
          withdraw.amount,
          {
            username: user.username,
            transactionType: "withdraw reverted",
            remark: `Withdraw ID: ${withdraw._id}`,
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

      user.wallet += withdraw.amount;
      user.totalwithdraw -= withdraw.amount;
      await user.save();

      bank.currentbalance += withdraw.amount;
      bank.totalWithdrawals -= withdraw.amount;
      await bank.save();

      withdraw.reverted = true;
      withdraw.status = "reverted";
      withdraw.revertedProcessBy = adminuser.username;
      await withdraw.save();

      const walletLog = await UserWalletLog.findOne({
        transactionid: withdraw.transactionId,
      });

      if (walletLog) {
        walletLog.status = "cancel";
        await walletLog.save();
      } else {
        console.error("UserWalletLog record not found for the Withdraw.");
      }

      adminuser.totalRevertedWithdrawals += 1;
      await adminuser.save();

      const transactionLog = new BankTransactionLog({
        bankName: bank.bankname,
        ownername: bank.ownername,
        remark: withdraw.remark || "-",
        lastBalance: bank.currentbalance - withdraw.amount,
        currentBalance: bank.currentbalance,
        processby: adminuser.username,
        transactiontype: "reverted deposit",
        amount: withdraw.amount,
        qrimage: bank.qrimage,
        playerusername: user.username,
        playerfullname: user.fullname,
      });
      await transactionLog.save();

      res.status(200).json({
        success: true,
        message: {
          en: "Withdrawal successfully reverted and user wallet updated",
          zh: "提款已成功撤销并更新用户钱包",
        },
      });
    } catch (error) {
      console.error("Error during withdrawal reversion:", error);
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

//Admin Revert Bonus
router.post(
  "/admin/api/revertbonus/:bonusId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { bonusId } = req.params;
      const userId = req.user.userId;
      const adminuser = await adminUser.findById(userId);
      if (!adminuser) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Admin User not found, please contact customer service",
            zh: "未找到管理员用户，请联系客户服务",
          },
        });
      }
      const bonus = await Bonus.findById(bonusId);
      if (!bonus) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Bonus record not found",
            zh: "找不到奖金记录",
          },
        });
      }
      if (bonus.status !== "approved" || bonus.reverted) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Unable to revert this bonus",
            zh: "无法撤销此奖金",
          },
        });
      }
      const user = await User.findOne({ username: bonus.username });
      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "找不到用户",
          },
        });
      }

      if (user.wallet < bonus.amount) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Insufficient wallet balance for reversion",
            zh: "钱包余额不足，无法撤销",
          },
        });
      }

      const kioskSettings = await kioskbalance.findOne({});
      if (kioskSettings && kioskSettings.status) {
        const kioskResult = await updateKioskBalance("add", bonus.amount, {
          username: user.username,
          transactionType: "bonus reverted",
          remark: `Bonus ID: ${bonus._id}`,
          processBy: adminuser.username,
        });
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

      user.wallet -= bonus.amount;
      user.totalbonus -= bonus.amount;
      if (bonus.isLuckySpin) {
        user.luckySpinClaim = false;
      }
      await user.save();

      bonus.reverted = true;
      bonus.status = "reverted";
      bonus.revertedProcessBy = adminuser.username;
      await bonus.save();

      const walletLog = await UserWalletLog.findOne({
        transactionid: bonus.transactionId,
      });
      if (walletLog) {
        walletLog.status = "cancel";
        await walletLog.save();
      } else {
        console.error("UserWalletLog record not found for the bonus.");
      }
      const commissionReport = await AgentCommissionReport.findOne({
        bonusTransactionId: bonus._id.toString(),
        status: "approved",
      });

      if (commissionReport) {
        commissionReport.status = "cancel";
        await commissionReport.save();
      }

      adminuser.totalRevertedBonuses += 1;
      await adminuser.save();

      res.status(200).json({
        success: true,
        message: {
          en: "Bonus successfully reverted and user wallet updated",
          zh: "奖金已成功撤销并更新用户钱包",
        },
      });
    } catch (error) {
      console.error("Error during bonus reversion:", error);
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

// Export all users
router.get(
  "/admin/api/allusers/export",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const users = await User.find({})
        .select(
          "username fullname phonenumber email viplevel wallet status isPhoneVerified isEmailVerified totaldeposit totalwithdraw totalbonus totalturnover createdAt firstDepositDate lastLogin lastdepositdate registerIp lastLoginIp duplicateIP remark"
        )
        .sort({ createdAt: -1 })
        .lean();

      const formattedUsers = users.map((user) => {
        const totaldeposit = parseFloat(user.totaldeposit || 0);
        const totalwithdraw = parseFloat(user.totalwithdraw || 0);

        return {
          ...user,
          wallet: user.wallet?.$numberDecimal
            ? parseFloat(user.wallet.$numberDecimal)
            : parseFloat(user.wallet || 0),
          totalturnover: user.totalturnover?.$numberDecimal
            ? parseFloat(user.totalturnover.$numberDecimal)
            : parseFloat(user.totalturnover || 0),
          totaldeposit,
          totalwithdraw,
          winloss: totaldeposit - totalwithdraw,
        };
      });

      res.json({
        success: true,
        data: formattedUsers,
      });
    } catch (error) {
      console.error("Error exporting users:", error);
      res.status(500).json({
        success: false,
        message: "Failed to export users",
        error: error.message,
      });
    }
  }
);

// Admin Search User
router.get(
  "/admin/api/search/:username",
  authenticateAdminToken,
  async (req, res) => {
    try {
      setConnForRequest(req.db);
      let username = req.params.username.toLowerCase();
      const user = await User.findOne({
        username: { $regex: new RegExp(`^${username}$`, "i") },
      });

      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "找不到用户",
          },
        });
      }
      res.status(200).json({
        success: true,
        data: {
          _id: user._id,
          username: user.username,
          balance: user.wallet,
          viplevel: user.viplevel,
          email: user.email,
          fullname: user.fullname,
        },
      });
    } catch (error) {
      console.error("Error searching user:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error during user search",
          zh: "搜索用户时出错",
        },
      });
    }
  }
);
// Admin Get Specific User Bank Accounts
router.get(
  "/admin/api/user/bankaccounts/:username",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const username = req.params.username;
      const user = await User.findOne({ username }).select("bankAccounts");
      if (!user || !user.bankAccounts) {
        return res.status(200).json({
          success: false,
          message: "No bank accounts found for this user",
        });
      }
      res.status(200).json({
        success: true,
        data: user.bankAccounts,
      });
    } catch (error) {
      console.error("Error fetching user bank accounts:", error);
      res.status(200).json({
        success: false,
        message: "Error fetching bank accounts",
      });
    }
  }
);

// Admin Get ALl Users
router.get("/admin/api/allusers", authenticateAdminToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";
    const sortKey = req.query.sortKey || "createdAt";
    const sortOrder = req.query.sortOrder || "desc";
    const skip = (page - 1) * limit;

    const query = search
      ? {
          $or: [
            { username: new RegExp(search, "i") },
            { fullname: new RegExp(search, "i") },
            ...(isNaN(search) ? [] : [{ phonenumber: parseInt(search) }]),
          ],
        }
      : {};

    const sortKeyMap = {
      vipLevel: "viplevel",
      username: "username",
      fullname: "fullname",
      verified: "isVerified",
      creationDate: "createdAt",
      lastLoginDate: "lastLogin",
      status: "status",
      totalDeposit: "totaldeposit",
      totalWithdraw: "totalwithdraw",
      winLose: "winlose",
    };

    // Optimized aggregation pipeline
    const pipeline = [
      // Match stage first for better performance
      { $match: query },

      // Computed fields stage
      {
        $addFields: {
          isVerified: {
            $or: ["$isPhoneVerified", "$isEmailVerified"],
          },
        },
      },

      {
        $addFields: {
          winlose: {
            $subtract: ["$totaldeposit", "$totalwithdraw"],
          },
          walletAmount: {
            $toDouble: "$wallet",
          },
        },
      },

      // Sorting stage
      {
        $sort: (() => {
          if (sortKey === "verified") {
            return {
              isVerified: sortOrder === "asc" ? 1 : -1,
              createdAt: -1,
            };
          }

          if (sortKey === "creationDate" || sortKey === "lastLoginDate") {
            const field = sortKeyMap[sortKey];
            return {
              [field]: sortOrder === "asc" ? 1 : -1,
              _id: 1, // Secondary sort for consistency
            };
          }

          return {
            [sortKeyMap[sortKey] || "createdAt"]: sortOrder === "asc" ? 1 : -1,
            _id: 1,
          };
        })(),
      },

      // Pagination
      { $skip: skip },
      { $limit: limit },

      // Project only needed fields
      {
        $project: {
          _id: 1,
          username: 1,
          fullname: 1,
          viplevel: 1,
          isPhoneVerified: 1,
          isEmailVerified: 1,
          phonenumber: 1,
          createdAt: 1,
          lastLogin: 1,
          lastLoginIp: 1,
          status: 1,
          duplicateIP: 1,
          isVerified: 1,
          totaldeposit: 1,
          totalwithdraw: 1,
          winlose: 1,
          wallet: "$walletAmount",
        },
      },
    ];

    const [users, totalUsers] = await Promise.all([
      User.aggregate(pipeline).allowDiskUse(true).exec(),
      User.countDocuments(query).lean(),
    ]);

    const totalPages = Math.ceil(totalUsers / limit);

    res.status(200).json({
      success: true,
      data: {
        users,
        pagination: {
          page,
          totalPages,
          totalUsers,
          limit,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching all users",
      error: error.message,
    });
  }
});

// Admin Register User
router.post(
  "/admin/api/registeruser",
  authenticateAdminToken,
  async (req, res) => {
    const {
      username,
      fullname,
      email,
      dob,
      password,
      phonenumber,
      bankAccounts = [],
      referralCode,
    } = req.body;

    if (!username || !fullname || !email || !dob || !password || !phonenumber) {
      return res.status(200).json({
        success: false,
        message: {
          en: "All fields are required",
          zh: "所有字段都是必填的",
        },
      });
    }

    const normalizedUsername = username.toLowerCase();
    const normalizedFullname = fullname.toLowerCase().replace(/\s+/g, "");
    const formattedNumber = String(phonenumber).startsWith("852")
      ? String(phonenumber)
      : `852${phonenumber}`;

    try {
      const existingUser = await User.findOne({
        $or: [
          { username: normalizedUsername },
          { fullname: new RegExp(`^${normalizedFullname}$`, "i") },
        ],
      });
      if (existingUser) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Duplicate User",
            zh: "用户已存在",
          },
        });
      }
      const existingPhoneNumber = await User.findOne({
        phonenumber: formattedNumber,
      });

      if (existingPhoneNumber) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Duplicate Phone Number",
            zh: "电话号码已存在",
          },
        });
      }
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      const newReferralCode = await generateUniqueReferralCode();
      const referralLink = generateReferralLink(newReferralCode);
      const referralQrCode = await QRCode.toDataURL(referralLink);

      let referralBy = null;
      if (referralCode) {
        const referrer = await User.findOne({ referralCode: referralCode });
        if (referrer) {
          referralBy = {
            user_id: referrer._id,
            username: referrer.username,
          };
        }
      }

      const newUser = await User.create({
        username: normalizedUsername,
        fullname: normalizedFullname,
        email,
        dob,
        password: hashedPassword,
        phonenumber: formattedNumber,
        bankAccounts,
        registerIp: "admin register",
        referralLink,
        referralCode: newReferralCode,
        referralQrCode,
        viplevel: "Bronze",
        gameId: await generateUniqueGameId(),
      });

      if (referralBy) {
        await User.findByIdAndUpdate(referralBy.user_id, {
          $push: {
            referrals: {
              user_id: newUser._id,
              username: newUser.username,
            },
          },
        });
      }

      res.status(200).json({
        success: true,
        message: {
          en: "User created successfully",
          zh: "用户创建成功",
        },
      });
    } catch (error) {
      console.error("Error occurred while creating user:", error);
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

// Admin Get Specific User Data
router.get(
  "/admin/api/user/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;
      const user = await User.findById(userId).select(
        " username totalturnover  fullname email phonenumber positionTaking status viplevel bankAccounts wallet createdAt lastLogin lastLoginIp registerIp dob wallet withdrawlock rebate turnover winloss gamewallet rebate totaldeposit totalwithdraw lastdepositdate totalbonus gameStatus luckySpinCount remark referralCode referralBy duplicateIP gameStatus gameLock"
      );
      if (!user) {
        return res.status(200).json({
          success: false,
          message: "User not found",
        });
      }
      return res.status(200).json({
        success: true,
        data: user,
      });
    } catch (error) {
      console.error("Error fetching user details:", error);
      return res.status(500).json({
        success: false,
        message: "Error fetching user details",
        error: error.message,
      });
    }
  }
);

// Admin Update Specific User Data
router.put(
  "/admin/api/user/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;
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
      const {
        fullname,
        email,
        phonenumber,
        dob,
        viplevel,
        luckySpinCount,
        totalturnover,
        positionTaking,
        referralByUsername,
      } = req.body;

      const updatedUser = await User.findByIdAndUpdate(
        userId,
        {
          $set: {
            fullname,
            email,
            phonenumber: Number(phonenumber),
            dob,
            viplevel,
            luckySpinCount,
            totalturnover,
            positionTaking,
          },
        },
        { new: true }
      );
      if (!updatedUser) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "找不到用户",
          },
        });
      }
      let clientIp = req.headers["x-forwarded-for"] || req.ip;
      clientIp = clientIp.split(",")[0].trim();
      if (referralByUsername !== undefined) {
        const currentReferralBy = updatedUser.referralBy
          ? updatedUser.referralBy.username
          : null;
        if (currentReferralBy !== referralByUsername) {
          const referralResult = await updateUserReferral(
            userId,
            referralByUsername,
            adminuser.username,
            adminuser.fullname,
            clientIp
          );
          if (!referralResult.success) {
            return res.status(200).json(referralResult);
          }
        }
      }
      res.status(200).json({
        success: true,
        message: {
          en: "User information updated successfully",
          zh: "用户信息更新成功",
        },
        data: updatedUser,
      });
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error updating user information",
          zh: "更新用户信息时出错",
        },
      });
    }
  }
);

// Admin Update User Password
router.put(
  "/admin/api/user/:userId/password",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;
      const { password } = req.body;
      if (!password || password.length < 6) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Password must be at least 6 characters long",
            zh: "密码长度必须至少为6个字符",
          },
        });
      }
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        {
          $set: { password: hashedPassword },
        },
        { new: true }
      );
      if (!updatedUser) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "找不到用户",
          },
        });
      }
      res.status(200).json({
        success: true,
        message: {
          en: "Password updated successfully",
          zh: "密码更新成功",
        },
      });
    } catch (error) {
      console.error("Error updating password:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error updating password",
          zh: "更新密码时出错",
        },
      });
    }
  }
);

// Admnin Update User Status
router.put(
  "/admin/api/user/:userId/toggle-status",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;
      const user = await User.findById(userId);
      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "找不到用户",
          },
        });
      }
      const newStatus = user.status === true ? false : true;
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        {
          $set: { status: newStatus },
        },
        { new: true }
      );
      res.status(200).json({
        success: true,
        message: {
          en: `User status updated to ${newStatus ? "active" : "inactive"}`,
          zh: `用户状态已更新为${newStatus ? "激活" : "禁用"}`,
        },
        status: newStatus,
      });
    } catch (error) {
      console.error("Error updating status:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error updating user status",
          zh: "更新用户状态时出错",
        },
      });
    }
  }
);

// Admin Update User Withdraw Lock
router.put(
  "/admin/api/user/:userId/toggle-withdraw-lock",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;
      const user = await User.findById(userId);
      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "找不到用户",
          },
        });
      }
      const newLockStatus = !user.withdrawlock;
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        {
          $set: { withdrawlock: newLockStatus },
        },
        { new: true }
      );
      res.status(200).json({
        success: true,
        message: {
          en: newLockStatus
            ? "Withdraw lock for this user has been enabled"
            : "Withdraw lock for this user has been disabled",
          zh: newLockStatus
            ? "该用户的提款锁定已启用"
            : "该用户的提款锁定已禁用",
        },
      });
    } catch (error) {
      console.error("Error toggling withdraw lock:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error updating withdraw lock status",
          zh: "更新提款锁定状态时出错",
        },
      });
    }
  }
);

// Admin Update User Duplicate IP
router.put(
  "/admin/api/user/:userId/toggle-duplicate-ip",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;
      const user = await User.findById(userId);
      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "找不到用户",
          },
        });
      }
      const newDuplicateIPStatus = !user.duplicateIP;
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        {
          $set: { duplicateIP: newDuplicateIPStatus },
        },
        { new: true }
      );
      res.status(200).json({
        success: true,
        message: {
          en: newDuplicateIPStatus
            ? "Duplicate IP status for this user has been enabled"
            : "Duplicate IP status for this user has been disabled",
          zh: newDuplicateIPStatus
            ? "该用户的重复IP状态已启用"
            : "该用户的重复IP状态已禁用",
        },
      });
    } catch (error) {
      console.error("Error toggling Duplicate IP status:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error updating duplicate IP status",
          zh: "更新重复IP状态时出错",
        },
      });
    }
  }
);

// Admin Update User Remark
router.put(
  "/admin/api/user/:userId/remark",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;
      const { remark } = req.body;
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $set: { remark } },
        { new: true }
      );
      if (!updatedUser) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "找不到用户",
          },
        });
      }
      res.status(200).json({
        success: true,
        message: {
          en: "Remark updated successfully",
          zh: "备注更新成功",
        },
      });
    } catch (error) {
      console.error("Error updating remark:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error updating remark",
          zh: "更新备注时出错",
        },
      });
    }
  }
);

// Admin Add User Bank Account
router.post(
  "/admin/api/user/:userId/bank-accounts",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;
      const { name, bankname, banknumber } = req.body;
      if (!name || !bankname || !banknumber) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Please provide all required bank account details",
            zh: "请提供所有必需的银行账户详情",
          },
        });
      }
      const user = await User.findById(userId);
      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "找不到用户",
          },
        });
      }
      user.bankAccounts.push({
        name,
        bankname,
        banknumber,
      });
      await user.save();
      res.status(200).json({
        success: true,
        message: {
          en: "Bank account added successfully",
          zh: "银行账户添加成功",
        },
        data: user.bankAccounts,
      });
    } catch (error) {
      console.error("Error adding bank account:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error adding bank account",
          zh: "添加银行账户时出错",
        },
      });
    }
  }
);

// Admin Delete User Bank Account
router.delete(
  "/admin/api/user/:userId/bank-accounts/:bankId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { userId, bankId } = req.params;
      const user = await User.findById(userId);
      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "找不到用户",
          },
        });
      }
      const bankIndex = user.bankAccounts.findIndex(
        (bank) => bank._id.toString() === bankId
      );
      if (bankIndex === -1) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Bank account not found",
            zh: "找不到银行账户",
          },
        });
      }
      user.bankAccounts.splice(bankIndex, 1);
      await user.save();
      res.status(200).json({
        success: true,
        message: {
          en: "Bank account deleted successfully",
          zh: "银行账户删除成功",
        },
        data: user.bankAccounts,
      });
    } catch (error) {
      console.error("Error deleting bank account:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error deleting bank account",
          zh: "删除银行账户时出错",
        },
      });
    }
  }
);

// Admin Get Active Bank Names
router.get(
  "/admin/api/activebanknames",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const activeBanks = await UserBankList.find(
        { isActive: true },
        "bankname"
      );
      res.json({
        success: true,
        data: activeBanks,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

// Admin Cashout User Wallet
router.patch(
  "/admin/api/user/cashout/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;
      const adminId = req.user.userId;
      const adminuser = await adminUser.findById(adminId);
      if (!adminuser) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Admin User not found, please contact customer service",
            zh: "找不到管理员用户，请联系客服",
          },
        });
      }
      const { amount, remark } = req.body;
      const user = await User.findById(userId);

      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "找不到用户",
          },
        });
      }
      if (amount !== undefined) {
        if (amount > user.wallet) {
          return res.status(200).json({
            success: false,
            message: {
              en: "Withdrawal amount exceeds current wallet balance",
              zh: "提款金额超过当前钱包余额",
            },
          });
        }
        const kioskSettings = await kioskbalance.findOne({});
        if (kioskSettings && kioskSettings.status) {
          const kioskResult = await updateKioskBalance("add", amount, {
            username: user.username,
            transactionType: "user cashout",
            remark: `Manual cashout`,
            processBy: adminuser.username,
          });
          if (!kioskResult.success) {
            return res.status(200).json({
              success: false,
              message: {
                en: "Failed to update kiosk balance",
                zh: "更新网点余额失败",
              },
            });
          }
        }
        user.wallet -= amount;
      }
      await user.save();

      const newCashOut = new UserWalletCashOut({
        transactionId: uuidv4(),
        userId: user._id,
        username: user.username,
        fullname: user.fullname,
        method: "manual",
        transactionType: "user cashout",
        processBy: adminuser.username,
        amount: amount,
        status: "approved",
        remark: remark,
      });
      await newCashOut.save();

      res.status(200).json({
        success: true,
        message: {
          en: "Wallet has been updated successfully",
          zh: "钱包已成功更新",
        },
      });
    } catch (error) {
      console.error("Error occurred while updating wallet:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error processing cashout",
          zh: "处理提现时出错",
        },
      });
    }
  }
);

// Admin Update User Rebate
router.patch(
  "/admin/api/user/:userId/updateRebate",
  authenticateAdminToken,
  async (req, res) => {
    const { userId } = req.params;
    const { rebate } = req.body;
    if (typeof rebate !== "number" || rebate < 0) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Invalid rebate amount",
          zh: "无效的返利金额",
        },
      });
    }
    try {
      const user = await User.findById(userId);
      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "找不到用户",
          },
        });
      }
      user.rebate = rebate;
      await user.save();
      res.status(200).json({
        success: true,
        message: {
          en: "Rebate amount updated successfully",
          zh: "返利金额更新成功",
        },
        rebate: user.rebate,
      });
    } catch (error) {
      console.error("Error updating rebate amount:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error updating rebate amount",
          zh: "更新返利金额时出错",
        },
      });
    }
  }
);

// Admin Get User Wallet Transfer Log
router.get(
  "/admin/api/user/walletransferlog/:userId",
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
      const walletLogs = await adminUserWalletLog
        .find({ username: user.username })
        .sort({ createdAt: -1 });
      const processedLogs = walletLogs.map((log) => {
        let gameBalance = 0;
        const transferAmount = Math.abs(log.transferamount);
        if (log.transactiontype === "deposit") {
          gameBalance = log.userwalletbalance + transferAmount;
        }
        return {
          ...log.toObject(),
          gameBalance,
        };
      });

      // Return successful response
      res.status(200).json({
        success: true,
        message: "Wallet transfer logs retrieved successfully",
        data: processedLogs,
      });
    } catch (error) {
      console.error("Error retrieving wallet transfer logs:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve wallet transfer logs",
        error: error.message,
      });
    }
  }
);

// Admin Get User Logs
router.get("/admin/api/userlogs", authenticateAdminToken, async (req, res) => {
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
      return res.status(404).json({
        success: false,
        message: "Admin user not found",
      });
    }
    const logs = await userLog
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
});

// Admin Get Specific User Wallet Logs
router.get(
  "/admin/api/userwalletlog/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { startDate, endDate } = req.query;
      const filter = { userId: userId };
      if (startDate && endDate) {
        filter.createdAt = {
          $gte: moment(new Date(startDate)).startOf("day").utc().toDate(),
          $lte: moment(new Date(endDate)).endOf("day").utc().toDate(),
        };
      }
      const userwalletlog = await UserWalletLog.find(filter).sort({
        createdAt: -1,
      });
      res.status(200).json({
        success: true,
        message: "User Wallet Log retrieved successfully",
        data: userwalletlog,
      });
    } catch (error) {
      console.error("Error occurred while retrieving User Wallet Log:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  }
);

// Update TelegramId & FacebookId
router.post("/api/updateSocialMedia", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(200).json({
        success: false,
        message: {
          en: "User not found",
          zh: "找不到用户",
        },
      });
    }
    const { telegramId, facebookId, email } = req.body;
    if (email !== undefined) {
      user.email = email;
    }
    if (telegramId !== undefined) {
      user.telegramId = telegramId;
    }
    if (facebookId !== undefined) {
      user.facebookId = facebookId;
    }
    await user.save();
    res.status(200).json({
      success: true,
      message: {
        en: "Social media updated successfully",
        zh: "社交媒体更新成功",
      },
    });
  } catch (error) {
    console.error("Update social media error:", error);
    res.status(500).json({
      success: false,
      message: {
        en: "Internal server error",
        zh: "服务器内部错误",
      },
    });
  }
});

// Admin Get Summary Report
router.get(
  "/admin/api/summary-report",
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
      const [
        depositStats,
        withdrawStats,
        bonusStats,
        rebateStats,
        cashStats,
        newDepositCount,
        revertedStats,
        newRegistrations,
      ] = await Promise.all([
        Deposit.aggregate([
          {
            $match: {
              status: "approved",
              reverted: false,
              ...dateFilter,
            },
          },
          {
            $group: {
              _id: null,
              depositQty: { $sum: 1 },
              totalDeposit: { $sum: "$amount" },
              uniquePlayers: { $addToSet: "$username" },
              totalProcessTime: {
                $sum: {
                  $add: [
                    {
                      $multiply: [
                        {
                          $convert: {
                            input: {
                              $arrayElemAt: [
                                { $split: ["$processtime", ":"] },
                                0,
                              ],
                            },
                            to: "int",
                            onError: 0,
                            onNull: 0,
                          },
                        },
                        3600,
                      ],
                    },
                    {
                      $multiply: [
                        {
                          $convert: {
                            input: {
                              $arrayElemAt: [
                                { $split: ["$processtime", ":"] },
                                1,
                              ],
                            },
                            to: "int",
                            onError: 0,
                            onNull: 0,
                          },
                        },
                        60,
                      ],
                    },
                    {
                      $convert: {
                        input: {
                          $arrayElemAt: [{ $split: ["$processtime", ":"] }, 2],
                        },
                        to: "int",
                        onError: 0,
                        onNull: 0,
                      },
                    },
                  ],
                },
              },
            },
          },
        ]),
        Withdraw.aggregate([
          {
            $match: {
              status: "approved",
              reverted: false,
              ...dateFilter,
            },
          },
          {
            $group: {
              _id: null,
              withdrawQty: { $sum: 1 },
              totalWithdraw: { $sum: "$amount" },
              uniquePlayers: { $addToSet: "$username" },
              totalProcessTime: {
                $sum: {
                  $add: [
                    {
                      $multiply: [
                        {
                          $convert: {
                            input: {
                              $arrayElemAt: [
                                { $split: ["$processtime", ":"] },
                                0,
                              ],
                            },
                            to: "int",
                            onError: 0,
                            onNull: 0,
                          },
                        },
                        3600,
                      ],
                    },
                    {
                      $multiply: [
                        {
                          $convert: {
                            input: {
                              $arrayElemAt: [
                                { $split: ["$processtime", ":"] },
                                1,
                              ],
                            },
                            to: "int",
                            onError: 0,
                            onNull: 0,
                          },
                        },
                        60,
                      ],
                    },
                    {
                      $convert: {
                        input: {
                          $arrayElemAt: [{ $split: ["$processtime", ":"] }, 2],
                        },
                        to: "int",
                        onError: 0,
                        onNull: 0,
                      },
                    },
                  ],
                },
              },
            },
          },
        ]),
        Bonus.aggregate([
          {
            $match: {
              status: "approved",
              reverted: false,
              ...dateFilter,
            },
          },
          {
            $group: {
              _id: null,
              totalBonus: { $sum: "$amount" },
            },
          },
        ]),
        RebateLog.aggregate([
          {
            $match: dateFilter,
          },
          {
            $group: {
              _id: null,
              totalRebate: { $sum: "$totalRebate" },
            },
          },
        ]),
        BankTransactionLog.aggregate([
          {
            $match: {
              transactiontype: { $in: ["cashin", "cashout"] },
              ...dateFilter,
            },
          },
          {
            $group: {
              _id: null,
              totalCashIn: {
                $sum: {
                  $cond: [
                    { $eq: ["$transactiontype", "cashin"] },
                    "$amount",
                    0,
                  ],
                },
              },
              totalCashOut: {
                $sum: {
                  $cond: [
                    { $eq: ["$transactiontype", "cashout"] },
                    "$amount",
                    0,
                  ],
                },
              },
            },
          },
        ]),
        Deposit.countDocuments({
          newDeposit: true,
          status: "approved",
          reverted: false,
          ...dateFilter,
        }),
        Promise.all([
          Deposit.countDocuments({ reverted: true, ...dateFilter }),
          Withdraw.countDocuments({ reverted: true, ...dateFilter }),
          Bonus.countDocuments({ reverted: true, ...dateFilter }),
        ]),
        User.countDocuments(dateFilter),
      ]);
      const reportData = {
        depositQty: depositStats[0]?.depositQty || 0,
        totalDeposit: depositStats[0]?.totalDeposit || 0,
        withdrawQty: withdrawStats[0]?.withdrawQty || 0,
        totalWithdraw: withdrawStats[0]?.totalWithdraw || 0,
        totalBonus: bonusStats[0]?.totalBonus || 0,
        totalRebate: rebateStats[0]?.totalRebate || 0,
        winLose:
          (depositStats[0]?.totalDeposit || 0) -
          (withdrawStats[0]?.totalWithdraw || 0),
        depositActivePlayers: depositStats[0]?.uniquePlayers?.length || 0,
        withdrawActivePlayers: withdrawStats[0]?.uniquePlayers?.length || 0,
        activePlayers: (() => {
          const depositPlayers = depositStats[0]?.uniquePlayers || [];
          const withdrawPlayers = withdrawStats[0]?.uniquePlayers || [];
          const allPlayers = [
            ...new Set([...depositPlayers, ...withdrawPlayers]),
          ];
          // console.log("=== Active Players Debug ===");
          // console.log("Deposit Players:", depositPlayers);
          // console.log("Withdraw Players:", withdrawPlayers);
          // console.log("All Unique Active Players:", allPlayers);
          // console.log("Total Active Players Count:", allPlayers.length);
          // console.log("============================");
          return allPlayers.length;
        })(),
        newDeposits: newDepositCount || 0,
        newRegistrations: newRegistrations || 0,
        revertedTransactions:
          (revertedStats[0] || 0) +
          (revertedStats[1] || 0) +
          (revertedStats[2] || 0),
        totalCashIn: cashStats[0]?.totalCashIn || 0,
        totalCashOut: cashStats[0]?.totalCashOut || 0,
        avgDepositTime: depositStats[0]?.depositQty
          ? formatSeconds(
              Math.round(
                depositStats[0].totalProcessTime / depositStats[0].depositQty
              )
            )
          : "00:00:00",
        avgWithdrawTime: withdrawStats[0]?.withdrawQty
          ? formatSeconds(
              Math.round(
                withdrawStats[0].totalProcessTime / withdrawStats[0].withdrawQty
              )
            )
          : "00:00:00",
      };
      res.status(200).json({
        success: true,
        message: "Report data retrieved successfully",
        data: reportData,
      });
    } catch (error) {
      console.error("Error generating summary report:", error);
      res.status(200).json({
        success: false,
        message: "Internal server error",
        error: error.toString(),
      });
    }
  }
);

// Admin Get Player Report
router.get(
  "/admin/api/player-report",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: "Start date and end date are required",
        });
      }

      const today = moment.utc().format("YYYY-MM-DD");
      const startDateFormatted = moment(new Date(startDate))
        .utc()
        .add(8, "hours")
        .format("YYYY-MM-DD");
      const endDateFormatted = moment(new Date(endDate))
        .utc()
        .add(8, "hours")
        .format("YYYY-MM-DD");

      const needsTodayData = endDateFormatted >= today;
      const needsHistoricalData = startDateFormatted < today;

      const dateFilter = {};
      if (startDate && endDate) {
        dateFilter.createdAt = {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        };
      }

      // Run financial queries
      const financialResults = await Promise.all([
        Deposit.aggregate([
          {
            $match: {
              status: "approved",
              reverted: false,
              ...dateFilter,
            },
          },
          {
            $group: {
              _id: "$username",
              depositQty: { $sum: 1 },
              totalDeposit: { $sum: "$amount" },
            },
          },
        ]),

        Withdraw.aggregate([
          {
            $match: {
              status: "approved",
              reverted: false,
              ...dateFilter,
            },
          },
          {
            $group: {
              _id: "$username",
              withdrawQty: { $sum: 1 },
              totalWithdraw: { $sum: "$amount" },
            },
          },
        ]),

        Bonus.aggregate([
          {
            $match: {
              status: "approved",
              reverted: false,
              ...dateFilter,
            },
          },
          {
            $group: {
              _id: "$username",
              totalBonus: { $sum: "$amount" },
            },
          },
        ]),

        RebateLog.aggregate([
          {
            $match: dateFilter,
          },
          {
            $group: {
              _id: "$username",
              totalRebate: { $sum: "$totalRebate" },
            },
          },
        ]),

        UserWalletCashOut.aggregate([
          {
            $match: {
              reverted: false,
              ...dateFilter,
            },
          },
          {
            $group: {
              _id: "$username",
              totalCashout: { $sum: "$amount" },
            },
          },
        ]),
      ]);

      // Extract financial data
      const [
        depositStats,
        withdrawStats,
        bonusStats,
        rebateStats,
        cashoutStats,
      ] = financialResults;

      // Generic aggregation function for game turnover
      const getAllUsersTurnover = async (
        model,
        matchConditions,
        turnoverExpression = { $ifNull: ["$betamount", 0] }
      ) => {
        try {
          // Add date filter to match conditions
          const fullMatchConditions = {
            ...matchConditions,
            createdAt: dateFilter.createdAt,
          };

          const results = await model.aggregate([
            {
              $match: fullMatchConditions,
            },
            {
              $group: {
                _id: { $toLower: "$username" },
                turnover: { $sum: turnoverExpression },
              },
            },
          ]);

          return results.map((item) => ({
            username: item._id,
            turnover: Number(item.turnover.toFixed(2)),
          }));
        } catch (error) {
          console.error(
            `Error aggregating turnover for model ${model.modelName}:`,
            error
          );
          return [];
        }
      };

      // Process turnover data
      const userTurnoverMap = {};

      // Get historical data if needed
      if (needsHistoricalData) {
        const historicalData = await GameDataLog.find({
          date: {
            $gte: startDateFormatted,
            $lte:
              endDateFormatted < today
                ? endDateFormatted
                : moment.utc().subtract(1, "days").format("YYYY-MM-DD"),
          },
        });

        historicalData.forEach((record) => {
          const username = record.username.toLowerCase();

          if (!userTurnoverMap[username]) {
            userTurnoverMap[username] = 0;
          }

          // Convert gameCategories Map to Object if needed
          const gameCategories =
            record.gameCategories instanceof Map
              ? Object.fromEntries(record.gameCategories)
              : record.gameCategories;

          // Sum up turnover from all categories and games
          if (gameCategories) {
            Object.keys(gameCategories).forEach((categoryName) => {
              const category =
                gameCategories[categoryName] instanceof Map
                  ? Object.fromEntries(gameCategories[categoryName])
                  : gameCategories[categoryName];

              // Process each game in this category
              Object.keys(category).forEach((gameName) => {
                const game = category[gameName];
                const turnover = Number(game.turnover || 0);

                // Add to user total
                userTurnoverMap[username] += turnover;
              });
            });
          }
        });
      }

      // Get today's data if needed
      if (needsTodayData) {
        const todayGamePromises = [
          getAllUsersTurnover(SlotLivePPModal, {
            refunded: false,
            ended: true,
          }),
          getAllUsersTurnover(SlotCQ9Modal, {
            cancel: { $ne: true },
            refund: { $ne: true },
            settle: true,
          }),
        ];

        const todayGameResults = await Promise.allSettled(todayGamePromises);

        todayGameResults.forEach((gameResultPromise) => {
          if (gameResultPromise.status === "fulfilled") {
            const gameResults = gameResultPromise.value;

            gameResults.forEach((userResult) => {
              const username = userResult.username;
              if (!username) return;

              if (!userTurnoverMap[username]) {
                userTurnoverMap[username] = 0;
              }

              userTurnoverMap[username] += userResult.turnover || 0;
            });
          }
        });
      }

      // Get all unique usernames
      const usernames = new Set([
        ...depositStats.map((stat) => stat._id),
        ...withdrawStats.map((stat) => stat._id),
        ...bonusStats.map((stat) => stat._id),
        ...rebateStats.map((stat) => stat._id),
        ...cashoutStats.map((stat) => stat._id),
        ...Object.keys(userTurnoverMap),
      ]);

      // Create report data
      const reportData = Array.from(usernames).map((username) => {
        const deposit =
          depositStats.find((stat) => stat._id === username) || {};
        const withdraw =
          withdrawStats.find((stat) => stat._id === username) || {};
        const bonus = bonusStats.find((stat) => stat._id === username) || {};
        const rebate = rebateStats.find((stat) => stat._id === username) || {};
        const cashout =
          cashoutStats.find((stat) => stat._id === username) || {};
        const totalTurnover = userTurnoverMap[username] || 0;

        return {
          username,
          depositQty: deposit.depositQty || 0,
          totalDeposit: deposit.totalDeposit || 0,
          withdrawQty: withdraw.withdrawQty || 0,
          totalWithdraw: withdraw.totalWithdraw || 0,
          totalBonus: bonus.totalBonus || 0,
          totalRebate: rebate.totalRebate || 0,
          totalCashout: cashout.totalCashout || 0,
          totalTurnover: Number(totalTurnover.toFixed(2)),
          winLose: (deposit.totalDeposit || 0) - (withdraw.totalWithdraw || 0),
        };
      });

      res.status(200).json({
        success: true,
        message: "Report data retrieved successfully",
        data: reportData,
        dateRange: {
          start: startDateFormatted,
          end: endDateFormatted,
        },
      });
    } catch (error) {
      console.error("Error generating user summary report:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.toString(),
      });
    }
  }
);

router.get(
  "/admin/api/user/:userId/gamewalletlog",
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

      const { startDate, endDate } = req.query;

      const dateFilter = {
        username: user.username,
      };
      if (startDate && endDate) {
        dateFilter.createdAt = {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        };
      }

      const logs = await GameWalletLog.find(dateFilter)
        .sort({ createdAt: -1 })
        .lean();

      return res.status(200).json({
        success: true,
        message: "Game wallet log retrieved successfully",
        data: logs,
      });
    } catch (error) {
      console.error("Error generating game wallet log:", error);
      res.status(200).json({
        success: false,
        message: "Internal server error",
        error: error.toString(),
      });
    }
  }
);

// Get Today's Birthday Users (GMT+11)
router.get(
  "/admin/api/getTodayBirthdayUsers",

  async (req, res) => {
    try {
      const sydneyTime = moment().tz("Australia/Sydney");
      const todayMonth = sydneyTime.format("MM");
      const todayDay = sydneyTime.format("DD");
      const users = await User.find({
        dob: { $exists: true, $ne: null },
      }).select("username fullname dob");
      const birthdayUsers = users.filter((user) => {
        if (!user.dob) return false;
        const userBirthday = moment(user.dob, "DD/MM/YYYY");
        return (
          userBirthday.format("MM") === todayMonth &&
          userBirthday.format("DD") === todayDay
        );
      });
      const formattedUsers = birthdayUsers.map((user) => ({
        username: user.username,
        fullname: user.fullname,
        dob: user.dob,
      }));

      res.json({
        success: true,
        date: sydneyTime.format("DD/MM/YYYY"),
        timezone: "GMT+11 (Sydney)",
        birthdayUsers: formattedUsers,
      });
    } catch (error) {
      console.error("Error fetching birthday users:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch birthday users",
        error: error.message,
      });
    }
  }
);

// Get User Duplicate IP
router.get("/admin/api/users/find-by-ip/:ip", async (req, res) => {
  try {
    const { ip } = req.params;
    const users = await User.find(
      {
        $or: [{ lastLoginIp: ip }, { registerIp: ip }],
      },
      {
        username: 1,
        fullname: 1,
        lastLoginIp: 1,
        registerIp: 1,
        _id: 0,
      }
    );
    if (!users || users.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
        message: "No users found with this IP",
      });
    }
    const formattedUsers = users.map((user) => ({
      username: user.username,
      fullname: user.fullname,
      matchedWith: {
        lastLoginIp: user.lastLoginIp === ip,
        registerIp: user.registerIp === ip,
      },
    }));
    return res.status(200).json({
      success: true,
      data: formattedUsers,
      message: `Found ${users.length} user(s) with matching IP`,
    });
  } catch (error) {
    console.error("Error finding users by IP:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Admin Delete User
router.delete(
  "/admin/api/user/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;
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
      const user = await User.findById(userId);
      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "找不到用户",
          },
        });
      }
      await User.findByIdAndDelete(userId);
      await adminLog.create({
        company: adminuser.company,
        username: adminuser.username,
        fullname: adminuser.fullname,
        loginTime: new Date(),
        ip: req.headers["x-forwarded-for"] || req.ip,
        remark: `Deleted user: ${user.username}`,
      });
      res.status(200).json({
        success: true,
        message: {
          en: "User has been deleted successfully",
          zh: "用户已成功删除",
        },
      });
    } catch (error) {
      console.error("Error deleting user:", error);
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

// Admin Panel Get Contacts
router.get("/admin/api/contacts", authenticateAdminToken, async (req, res) => {
  try {
    const contactdata = await Contact.find().sort({ createdAt: -1 });
    res.json({ success: true, data: contactdata });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Admin Generate Magic Link
router.post(
  "/admin/api/user/:userId/generate-magic-link",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { userId } = req.params;
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
      const user = await User.findById(userId);
      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "找不到用户",
          },
        });
      }
      const token = crypto.randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 30 * 60 * 1000);
      user.adminMagicToken = token;
      user.adminMagicTokenExpires = expires;
      user.adminMagicTokenUsed = false;
      await user.save();

      let clientIp = req.headers["x-forwarded-for"] || req.ip;
      clientIp = clientIp.split(",")[0].trim();

      await adminLog.create({
        company: adminuser.company,
        username: adminuser.username,
        fullname: adminuser.fullname,
        loginTime: new Date(),
        ip: clientIp,
        remark: `Generated magic link for user: ${user.username}`,
      });

      const magicLink = `${process.env.FRONTEND_URL}magic-login?token=${token}`;

      res.status(200).json({
        success: true,
        magicLink: magicLink,
        expiresAt: expires,
        user: {
          username: user.username,
          fullname: user.fullname,
        },
        message: {
          en: `Magic link generated for user: ${user.username}`,
          zh: `已为用户 ${user.username} 生成魔法链接`,
        },
      });
    } catch (error) {
      console.error("Generate admin magic link error:", error);
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

// Verify Magic Link
router.get("/api/verify-magic-link/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const user = await User.findOne({
      adminMagicToken: token,
      adminMagicTokenExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: {
          en: "Invalid or expired magic link",
          zh: "无效或已过期的魔法链接",
        },
      });
    }

    user.adminMagicTokenUsed = true;
    user.lastLogin = new Date();
    user.lastAdminAccess = new Date();
    await user.save();

    const {
      token: authToken,
      refreshToken,
      newGameToken,
    } = await handleLoginSuccess(user._id);

    let clientIp = req.headers["x-forwarded-for"] || req.ip;
    clientIp = clientIp.split(",")[0].trim();
    const geo = geoip.lookup(clientIp);

    await userLogAttempt(
      user.username,
      user.fullname,
      user.phonenumber,
      req.get("User-Agent"),
      clientIp,
      geo ? geo.country : "Unknown",
      geo ? geo.city : "Unknown",
      "Admin Magic Link Login Success"
    );

    res.status(200).json({
      success: true,
      token: authToken,
      refreshToken,
      newGameToken,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        fullname: user.fullname,
      },
      message: {
        en: "Magic link login successful",
        zh: "魔法链接登录成功",
      },
    });
  } catch (error) {
    console.error("Verify admin magic link error:", error);
    res.status(500).json({
      success: false,
      message: {
        en: "Internal server error",
        zh: "服务器内部错误",
      },
    });
  }
});

module.exports = router;
