const express = require("express");
const router = express.Router();
const multer = require("multer");
const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} = require("@aws-sdk/client-s3");
const { authenticateToken } = require("../auth/auth");
const { authenticateAdminToken } = require("../auth/adminAuth");
const { adminUser } = require("../models/adminuser.model");
const Deposit = require("../models/deposit.model");
const { v4: uuidv4 } = require("uuid");
const BankList = require("../models/banklist.model");
const { User } = require("../models/users.model");
const UserWalletLog = require("../models/userwalletlog.model");
const Promotion = require("../models/promotion.model");
const moment = require("moment");
const Bonus = require("../models/bonus.model");
require("dotenv").config();
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});
const upload = multer({ storage: multer.memoryStorage() });
async function uploadFileToS3(file) {
  const folderPath = "deposits/";
  const fileKey = `${folderPath}${Date.now()}_${file.originalname}`;
  const uploadParams = {
    Bucket: process.env.S3_MAINBUCKET,
    Key: fileKey,
    Body: file.buffer,
    ContentType: file.mimetype,
  };

  await s3Client.send(new PutObjectCommand(uploadParams));
  return `https://${process.env.S3_MAINBUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`;
}

async function submitLuckySpin(
  userId,
  depositId,
  status = "pending",
  method = "manual",
  processtime = "PENDING",
  paymentMethod = "manual"
) {
  try {
    const user = await User.findById(userId);
    if (!user) {
      console.error("User not found when submitting lucky spin bonus");
      return false;
    }
    const promotionId = "685c1608f7c7aa5ec9aa1038";
    const promotion = await Promotion.findById(promotionId);
    if (!promotion) {
      console.error("Lucky Spin promotion not found");
      return false;
    }
    const bonusAmount = user.luckySpinAmount;
    const transactionId = uuidv4();

    const NewBonusTransaction = new Bonus({
      transactionId: transactionId,
      userId: userId,
      username: user.username,
      fullname: user.fullname,
      transactionType: "bonus",
      processBy: "system",
      amount: bonusAmount,
      walletamount: user.wallet,
      status: status,
      method: method,
      remark: "-",
      promotionname: promotion.maintitle,
      promotionnameEN: promotion.maintitleEN,
      promotionId: promotionId,
      depositId,
      isLuckySpin: true,
      processtime,
      duplicateIP: user.duplicateIP,
    });
    await NewBonusTransaction.save();
    const walletLog = new UserWalletLog({
      userId: userId,
      transactionid: transactionId,
      transactiontime: new Date(),
      transactiontype: "bonus",
      amount: bonusAmount,
      status: status,
      promotionnameCN: promotion.maintitle,
      promotionnameEN: promotion.maintitleEN,
    });
    await walletLog.save();

    return true;
  } catch (error) {
    console.error("Error submitting lucky spin bonus:", error);
    return false;
  }
}

// Customer Submit Deposit
router.post(
  "/api/deposit",
  authenticateToken,
  upload.single("receipt"),
  async (req, res) => {
    if (!req.file) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Please upload a receipt",
          zh: "请上传收据",
          zh_hk: "請上傳收據",
          ms: "Sila muat naik resit",
          id: "Silakan upload bukti transfer",
        },
      });
    }

    try {
      const userId = req.user.userId;
      const user = await User.findById(userId);
      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found, please contact customer service",
            zh: "找不到用户，请联系客服",
            zh_hk: "搵唔到用戶，請聯繫客服",
            ms: "Pengguna tidak dijumpai, sila hubungi khidmat pelanggan",
            id: "Pengguna tidak ditemukan, silakan hubungi layanan pelanggan",
          },
        });
      }
      const existingPendingDeposit = await Deposit.findOne({
        userId: userId,
        status: "pending",
      });

      if (existingPendingDeposit) {
        return res.status(200).json({
          success: false,
          message: {
            en: "You already have a pending deposit. Please wait for it to be processed",
            zh: "您已有一笔待处理的存款，请等待处理完成",
            zh_hk: "你已經有一筆待處理嘅存款，請等待處理完成",
            ms: "Anda sudah mempunyai deposit yang belum selesai. Sila tunggu sehingga ia diproses",
            id: "Anda sudah memiliki deposit yang sedang diproses. Silakan tunggu hingga selesai",
          },
        });
      }
      if (req.body.depositAmount < 20) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Minimum deposit amount is HKD 20",
            zh: "最低存款金额为HKD 20",
            zh_hk: "最低存款金額為HKD 20",
            ms: "Jumlah deposit minimum adalah HKD 20",
            id: "Jumlah deposit minimum adalah HKD 20",
          },
        });
      }
      // if (req.body.depositAmount > 10000) {
      //   return res.status(200).json({
      //     success: false,
      //     message: {
      //       en: "Deposit amount exceeds the limit of $10,000",
      //       zh: "存款金额超过$10,000的限制",
      //       ms: "Jumlah deposit melebihi had $10,000",
      //     },
      //   });
      // }
      const imageUrl = await uploadFileToS3(req.file);
      const transactionId = uuidv4();
      const deposit = new Deposit({
        userId: userId,
        username: user.username || "unknown",
        fullname: user.fullname || "unknown",
        bankname: req.body.bankname || "unknown",
        ownername: req.body.ownername || "unknown",
        transfernumber: req.body.transferNumber,
        bankid: req.body.bankid,
        walletType: "Main",
        transactionType: "deposit",
        method: "manual",
        processBy: "admin",
        amount: req.body.depositAmount,
        walletamount: user.wallet,
        imageUrl,
        remark: req.body.remark || "-",
        transactionId: transactionId,
        duplicateIP: user.duplicateIP,
      });
      await deposit.save();
      const walletLog = new UserWalletLog({
        userId: userId,
        transactionid: deposit.transactionId,
        transactiontime: new Date(),
        transactiontype: "deposit",
        amount: parseFloat(deposit.amount),
        status: "pending",
      });
      await walletLog.save();
      if (req.body.isLuckySpinClaim === "true") {
        submitLuckySpin(userId, deposit._id);
      }
      res.status(200).json({
        success: true,
        depositId: deposit._id,
        message: {
          en: "Deposit submitted successfully",
          zh: "存款提交成功",
          zh_hk: "存款提交成功",
          ms: "Deposit berjaya dihantar",
          id: "Deposit berhasil dikirim",
        },
      });
    } catch (error) {
      console.error("Error during submit deposit:", error);
      res.status(500).send({
        success: false,
        message: {
          en: "Failed to submit deposit",
          zh: "存款提交失败",
          zh_hk: "存款提交失敗",
          ms: "Gagal menghantar deposit",
          id: "Gagal mengirim deposit",
        },
      });
    }
  }
);

// Admin Submit Deposit
router.post("/admin/api/deposit", authenticateAdminToken, async (req, res) => {
  try {
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
    const { userid, username, bankid, amount } = req.body;
    if (!userid || !username || !bankid || !amount) {
      return res.status(200).json({
        success: false,
        message: {
          en: "All fields are required",
          zh: "所有字段都是必填的",
        },
      });
    }
    const user = await User.findById(userid);
    if (!user) {
      return res.status(200).json({
        success: false,
        message: {
          en: "User not found",
          zh: "找不到用户",
        },
      });
    }
    const bank = await BankList.findById(bankid);
    if (!bank) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Bank information not found",
          zh: "找不到银行信息",
        },
      });
    }
    const transactionId = uuidv4();
    const deposit = new Deposit({
      userId: userid,
      username: username,
      fullname: user.fullname,
      bankname: bank.bankname,
      ownername: bank.ownername,
      transfernumber: bank.bankaccount,
      walletType: "Main",
      method: "manual",
      transactionType: "deposit",
      processBy: "admin",
      amount: parseFloat(amount),
      walletamount: user.wallet,
      imageUrl: null,
      remark: "CS",
      transactionId: transactionId,
      bankid: bankid,
      status: "pending",
      duplicateIP: user.duplicateIP,
    });
    await deposit.save();

    const walletLog = new UserWalletLog({
      userId: userid,
      transactionid: deposit.transactionId,
      transactiontime: new Date(),
      transactiontype: "deposit",
      amount: parseFloat(amount),
      status: "pending",
    });
    await walletLog.save();

    res.status(200).json({
      success: true,
      depositId: deposit._id,
      message: {
        en: "Deposit submitted successfully",
        zh: "存款提交成功",
      },
      data: {
        transactionId: deposit.transactionId,
        amount: deposit.amount,
        status: deposit.status,
        createdAt: deposit.createdAt,
      },
    });
  } catch (error) {
    console.error("Error during submit deposit:", error);
    res.status(200).json({
      success: false,
      message: {
        en: "Error submitting deposit",
        zh: "提交存款时出错",
      },
      error: error.toString(),
    });
  }
});

// Admin Get User Deposit Logs
router.get(
  "/admin/api/user/:userId/deposits",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const Deposit = req.db.model("deposit", depositSchema);
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

      const deposits = await Deposit.find(dateFilter)
        .sort({ createdAt: -1 })
        .lean();
      res.status(200).json({
        success: true,
        message: "Deposits retrieved successfully",
        data: deposits,
      });
    } catch (error) {
      console.error("Error retrieving user deposits:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve deposits",
        error: error.message,
      });
    }
  }
);

// User Get Last 5 Deposits Logs
router.get("/api/depositslogs", async (req, res) => {
  try {
    const deposits = await Deposit.find({ status: "approved" })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("amount username");
    const processedDeposits = deposits.map((deposit) => {
      let username = deposit.username;
      if (username.startsWith("6")) {
        username = username.substring(1);
      }
      if (username.length > 6) {
        username =
          username.substring(0, 3) +
          "****" +
          username.substring(username.length - 3);
      }
      return {
        amount: deposit.amount,
        username: username,
      };
    });
    res.status(200).json({
      success: true,
      message: "Deposits fetched successfully",
      data: processedDeposits,
    });
  } catch (error) {
    console.error("Error fetching deposits", error);
    res.status(500).json({
      success: false,
      message: "Error fetching deposits",
    });
  }
});

// 只是獲取APPROVED OR REJECTED的存款數據而已
router.get("/api/filterdeposits", async (req, res) => {
  try {
    const deposits = await Deposit.find({
      $or: [{ status: "APPROVED" }, { status: "REJECTED" }],
    });
    res.status(200).json({
      authorized: true,
      message: "Deposits fetched successfully",
      data: deposits,
    });
  } catch (error) {
    console.error("Error fetching deposits", error);
    res
      .status(200)
      .json({ message: "Error fetching deposits", error: error.toString() });
  }
});

// 检查用户是否有PENDING存款
router.get("/api/checkPendingDeposit/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    const userExists = await User.findById(userId);
    if (!userExists) {
      return res.status(200).json({ message: "用户不存在。" });
    }

    const pendingDeposits = await Deposit.find({
      userId: userId,
      status: "pending",
    });

    const hasPendingDeposits = pendingDeposits.length > 0;

    res.status(200).json({
      authorized: true,
      message: "未决存款检查完成。",
      hasPendingDeposits: hasPendingDeposits,
    });
  } catch (error) {
    console.error("检查未决存款时发生错误：", error);
    res.status(200).json({
      message: "检查未决存款时发生内部服务器错误。",
      error: error.toString(),
    });
  }
});

module.exports = router;
