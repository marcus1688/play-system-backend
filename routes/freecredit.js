const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../auth/auth");
const { User } = require("../models/users.model");
const Bonus = require("../models/bonus.model");
const UserWalletLog = require("../models/userwalletlog.model");
const Promotion = require("../models/promotion.model");
const { v4: uuidv4 } = require("uuid");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const multer = require("multer");
require("dotenv").config();

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 5,
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"), false);
    }
  },
});

async function uploadFileToS3(file) {
  const folderPath = "freecredit/";
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

router.post(
  "/api/client/submitfreecredit",
  authenticateToken,
  upload.array("photos", 5),
  async (req, res) => {
    try {
      const userId = req.user.userId;
      const user = await User.findById(userId);
      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found, please contact customer service",
            zh: "找不到用户，请联系客服",
            ms: "Pengguna tidak dijumpai, sila hubungi khidmat pelanggan",
          },
        });
      }
      if (!req.files || req.files.length === 0) {
        return res.status(200).json({
          success: false,
          message: {
            en: "At least one photo is required",
            zh: "至少需要上传一张照片",
            ms: "Sekurang-kurangnya satu foto diperlukan",
          },
        });
      }
      if (req.files.length > 5) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Maximum 5 photos allowed",
            zh: "最多只能上传5张照片",
            ms: "Maksimum 5 foto dibenarkan",
          },
        });
      }
      const promotionId = "683210a3eaf0782558467e9b";
      const promotion = await Promotion.findById(promotionId);
      if (!promotion) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Free credit promotion not found",
            zh: "找不到免费积分促销活动",
            ms: "Promosi kredit percuma tidak dijumpai",
          },
        });
      }
      const existingPendingBonus = await Bonus.findOne({
        userId: userId,
        promotionId: promotionId,
        status: "pending",
      });
      if (existingPendingBonus) {
        return res.status(200).json({
          success: false,
          message: {
            en: "You already have a pending free credit application. Please wait for approval.",
            zh: "您已有一个待审核的免费分申请，请等待审批。",
            ms: "Anda sudah mempunyai permohonan kredit percuma yang menunggu kelulusan.",
          },
        });
      }
      const existingApprovedBonus = await Bonus.findOne({
        userId: userId,
        promotionId: promotionId,
        status: "approved",
        reverted: false,
      });
      if (existingApprovedBonus) {
        return res.status(200).json({
          success: false,
          message: {
            en: "You have already claimed this free credit promotion.",
            zh: "您已经领取过此免费积分促销。",
            ms: "Anda telah menuntut promosi kredit percuma ini.",
          },
        });
      }
      let photoUrls = [];
      try {
        for (const file of req.files) {
          const photoUrl = await uploadFileToS3(file);
          photoUrls.push(photoUrl);
        }
      } catch (uploadError) {
        console.error("Error uploading photos:", uploadError);
        return res.status(500).json({
          success: false,
          message: {
            en: "Failed to upload photos",
            zh: "照片上传失败",
            ms: "Gagal memuat naik foto",
          },
        });
      }
      const transactionId = uuidv4();
      const bonusAmount = 20;
      const NewBonusTransaction = new Bonus({
        transactionId: transactionId,
        userId: userId,
        username: user.username,
        fullname: user.fullname,
        transactionType: "bonus",
        processBy: "admin",
        amount: bonusAmount,
        walletamount: user.wallet,
        status: "pending",
        method: "manual",
        remark: "-",
        promotionname: promotion.maintitle,
        promotionnameEN: promotion.maintitleEN,
        promotionId: promotionId,
        imageUrls: photoUrls,
        duplicateIP: user.duplicateIP,
      });
      await NewBonusTransaction.save();
      const walletLog = new UserWalletLog({
        userId: userId,
        transactionid: NewBonusTransaction.transactionId,
        transactiontime: new Date(),
        transactiontype: "bonus",
        amount: bonusAmount,
        status: "pending",
        promotionnameCN: promotion.maintitle,
        promotionnameEN: promotion.maintitleEN,
      });
      await walletLog.save();
      res.status(200).json({
        success: true,
        message: {
          en: "Free credit application submitted successfully",
          zh: "免费积分申请提交成功",
          ms: "Permohonan kredit percuma berjaya dihantar",
        },
        data: {
          transactionId: transactionId,
          amount: bonusAmount,
          photoUrls: photoUrls,
          photoCount: photoUrls.length,
        },
      });
    } catch (error) {
      console.error("Error during free credit submission:", error);
      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          success: false,
          message: {
            en: "File size too large. Maximum 5MB per file.",
            zh: "文件太大，每个文件最大5MB",
            ms: "Saiz fail terlalu besar. Maksimum 5MB setiap fail.",
          },
        });
      }
      if (error.message === "Only image files are allowed") {
        return res.status(400).json({
          success: false,
          message: {
            en: "Only image files are allowed",
            zh: "只允许上传图片文件",
            ms: "Hanya fail imej dibenarkan",
          },
        });
      }
      res.status(500).json({
        success: false,
        message: {
          en: "Failed to submit free credit application",
          zh: "免费积分申请提交失败",
          ms: "Gagal menghantar permohonan kredit percuma",
        },
      });
    }
  }
);

router.post("/api/client/freecredit", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(200).json({
        success: false,
        message: {
          en: "User not found, please contact customer service",
          zh: "找不到用户，请联系客服",
          ms: "Pengguna tidak dijumpai, sila hubungi khidmat pelanggan",
          zh_hk: "搵唔到用戶，請聯絡客戶服務",
          id: "Pengguna tidak ditemukan, silakan hubungi layanan pelanggan",
        },
      });
    }
    const promotion = await Promotion.findOne({
      maintitleEN: { $regex: /Free Credit/i },
    });
    if (!promotion) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Free credit promotion not found",
          zh: "找不到免费注册彩金",
          ms: "Promosi kredit percuma tidak dijumpai",
          zh_hk: "搵唔到免費註冊彩金",
          id: "Promosi kredit gratis tidak ditemukan",
        },
      });
    }
    const existingPendingBonus = await Bonus.findOne({
      userId: userId,
      promotionId: promotion._id,
      status: "pending",
    });
    if (existingPendingBonus) {
      return res.status(200).json({
        success: false,
        message: {
          en: "You already have a pending free credit application. Please wait for approval.",
          zh: "您已有一个待审核的免费注册彩金申请，请等待审批。",
          ms: "Anda sudah mempunyai permohonan kredit percuma yang menunggu kelulusan.",
          zh_hk: "您已經有一個待審核嘅免費註冊彩金申請，請等待批核。",
          id: "Anda sudah memiliki aplikasi kredit gratis yang sedang menunggu. Silakan tunggu persetujuan.",
        },
      });
    }
    const existingApprovedBonus = await Bonus.findOne({
      userId: userId,
      promotionId: promotion._id,
      status: "approved",
      reverted: false,
    });
    if (existingApprovedBonus) {
      return res.status(200).json({
        success: false,
        message: {
          en: "You have already claimed this free credit promotion.",
          zh: "您已经领取过此免费注册彩金。",
          ms: "Anda telah menuntut promosi kredit percuma ini.",
          zh_hk: "您已經領取過呢個免費註冊彩金。",
          id: "Anda sudah mengklaim promosi kredit gratis ini.",
        },
      });
    }
    const transactionId = uuidv4();
    const bonusAmount = promotion.bonusexact;
    const NewBonusTransaction = new Bonus({
      transactionId: transactionId,
      userId: userId,
      username: user.username,
      fullname: user.fullname,
      transactionType: "bonus",
      processBy: "admin",
      amount: bonusAmount,
      walletamount: user.wallet,
      status: "pending",
      method: "manual",
      remark: "-",
      promotionname: promotion.maintitle,
      promotionnameEN: promotion.maintitleEN,
      promotionId: promotion._id,
      duplicateIP: user.duplicateIP,
    });
    await NewBonusTransaction.save();
    const walletLog = new UserWalletLog({
      userId: userId,
      transactionid: NewBonusTransaction.transactionId,
      transactiontime: new Date(),
      transactiontype: "bonus",
      amount: bonusAmount,
      status: "pending",
      promotionnameCN: promotion.maintitle,
      promotionnameEN: promotion.maintitleEN,
    });

    await walletLog.save();

    res.status(200).json({
      success: true,
      message: {
        en: "Free credit application submitted successfully",
        zh: "免费注册彩金申请提交成功",
        ms: "Permohonan kredit percuma berjaya dihantar",
        zh_hk: "免費註冊彩金申請提交成功",
        id: "Aplikasi kredit gratis berhasil dikirim",
      },
      data: {
        transactionId: transactionId,
        amount: bonusAmount,
        promotionName: promotion.maintitleEN,
        promotionId: promotion._id,
      },
    });
  } catch (error) {
    console.error("Error during free credit submission:", error);
    res.status(500).json({
      success: false,
      message: {
        en: "Failed to submit free credit application",
        zh: "免费注册彩金申请提交失败",
        ms: "Gagal menghantar permohonan kredit percuma",
        zh_hk: "免費註冊彩金申請提交失敗",
        id: "Gagal mengirim aplikasi kredit gratis",
      },
    });
  }
});

module.exports = router;
