const express = require("express");
const promotion = require("../models/promotion.model");
const PromotionCategory = require("../models/promotioncategory.model");
const Bonus = require("../models/bonus.model");
const Kiosk = require("../models/kiosk.model");
const KioskCategory = require("../models/kioskcategory.model");
const { adminUser } = require("../models/adminuser.model");

const router = express.Router();
const { authenticateAdminToken } = require("../auth/adminAuth");
const { authenticateToken } = require("../auth/auth");
const { setConnForRequest } = require("../lib/dbContext");
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const multer = require("multer");
const moment = require("moment");
require("dotenv").config();
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});
const upload = multer({ storage: multer.memoryStorage() });
function getBucket(companyId) {
  const bucket = process.env[`S3_MAINBUCKET_${companyId}`];
  // console.log(`[getBucket] companyId: ${companyId}, bucket: ${bucket}`);
  return bucket;
}
async function uploadFileToS3(file, companyId) {
  const bucket = getBucket(companyId);
  if (!bucket) throw new Error(`No S3 bucket configured for ${companyId}`);
  const folderPath = "promotion/";
  const fileKey = `${folderPath}${Date.now()}_${file.originalname}`;
  const uploadParams = {
    Bucket: bucket,
    Key: fileKey,
    Body: file.buffer,
    ContentType: file.mimetype,
  };
  await s3Client.send(new PutObjectCommand(uploadParams));
  return `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`;
}

const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

function getR2Bucket(companyId) {
  const bucket = process.env[`R2_BUCKET_NAME_${companyId}`];
  return bucket;
}

function getR2PublicId(companyId) {
  const publicId = process.env[`R2_PUBLIC_ID_${companyId}`];
  return publicId;
}

async function uploadFileToR2(file, companyId) {
  const bucket = getR2Bucket(companyId);
  const publicId = getR2PublicId(companyId);
  if (!bucket) throw new Error(`No R2 bucket configured for ${companyId}`);
  if (!publicId) throw new Error(`No R2 public ID configured for ${companyId}`);

  const folderPath = "promotion/";
  const fileKey = `${folderPath}${Date.now()}_${file.originalname}`;
  const uploadParams = {
    Bucket: bucket,
    Key: fileKey,
    Body: file.buffer,
    ContentType: file.mimetype,
  };
  await r2Client.send(new PutObjectCommand(uploadParams));
  return `https://pub-${publicId}.r2.dev/${fileKey}`;
}

async function smartDeleteFile(fileUrl, companyId) {
  try {
    if (
      fileUrl.includes("r2.dev") ||
      fileUrl.includes("r2.cloudflarestorage.com")
    ) {
      // R2 文件删除
      let fileKey;
      if (fileUrl.includes("r2.dev")) {
        const urlParts = fileUrl.split("r2.dev/");
        fileKey = urlParts[1];
      } else {
        const urlParts = fileUrl.split(".r2.cloudflarestorage.com/");
        const pathParts = urlParts[1].split("/");
        fileKey = pathParts.slice(1).join("/");
      }

      const bucket = getR2Bucket(companyId);
      if (!bucket) throw new Error(`No R2 bucket configured for ${companyId}`);

      await r2Client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: fileKey,
        })
      );
    } else {
      const key = fileUrl.split("/").slice(-2).join("/");
      const bucket = getBucket(companyId);
      if (bucket) {
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: bucket,
            Key: key,
          })
        );
      }
    }
  } catch (error) {
    console.error("Error deleting file:", error);
  }
}

router.use(async (req, res, next) => {
  try {
    setConnForRequest(req.db);
    const companyId = req.headers["x-company-id"];
    req.companyId = companyId;
    req.bucket = getBucket(companyId);
    req.r2Bucket = getR2Bucket(companyId);
    await Promise.all([
      promotion.findOne().limit(1),
      PromotionCategory.findOne().limit(1),
      Kiosk.findOne().limit(1),
      KioskCategory.findOne().limit(1),
      Bonus.findOne().limit(1),
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

// Admin Side Check Promotion
router.post(
  "/admin/api/checkpromotion",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { promotionId, depositAmount, userid } = req.body;
      if (!promotionId) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Promotion ID is required",
            zh: "需要提供优惠活动ID",
          },
        });
      }
      const promotionData = await promotion.findById(promotionId);
      if (!promotionData) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Promotion not found",
            zh: "找不到该优惠活动",
          },
        });
      }

      if (depositAmount < promotionData.mindeposit) {
        return res.status(200).json({
          success: false,
          message: {
            en: `Minimum deposit amount for this promotion is ${promotionData.mindeposit}`,
            zh: `此优惠的最低存款金额为 ${promotionData.mindeposit}`,
          },
        });
      }
      const malaysiaNow = moment().tz("Asia/Kuala_Lumpur");
      let dateFilter = {};
      switch (promotionData.claimfrequency) {
        case "daily":
          const dayStart = malaysiaNow.clone().startOf("day").utc().toDate();
          const dayEnd = malaysiaNow.clone().endOf("day").utc().toDate();
          dateFilter = {
            createdAt: {
              $gte: dayStart,
              $lt: dayEnd,
            },
          };
          break;

        case "weekly":
          const weekStart = malaysiaNow.clone().startOf("week").utc().toDate();
          const weekEnd = malaysiaNow.clone().endOf("week").utc().toDate();
          dateFilter = {
            createdAt: {
              $gte: weekStart,
              $lt: weekEnd,
            },
          };
          break;

        case "monthly":
          const monthStart = malaysiaNow
            .clone()
            .startOf("month")
            .utc()
            .toDate();
          const monthEnd = malaysiaNow.clone().endOf("month").utc().toDate();
          dateFilter = {
            createdAt: {
              $gte: monthStart,
              $lt: monthEnd,
            },
          };
          break;

        case "lifetime":
          dateFilter = {};
          break;
      }

      if (promotionData.claimcount === 0) {
        return res.status(200).json({
          success: true,
          message: {
            en: "You can claim this promotion",
            zh: "您可以申请此优惠",
          },
        });
      }

      const bonusCount = await Bonus.countDocuments({
        userId: userid,
        promotionId: promotionId,
        status: "approved",
        ...dateFilter,
      });

      if (bonusCount >= promotionData.claimcount) {
        return res.status(200).json({
          success: false,
          message: {
            en: `This user have reached the maximum claim limit for this promotion (${promotionData.claimcount} times ${promotionData.claimfrequency})`,
            zh: `这名用户已达到此优惠的最大申请次数限制（${
              promotionData.claimfrequency === "daily"
                ? "每天"
                : promotionData.claimfrequency === "weekly"
                ? "每周"
                : promotionData.claimfrequency === "monthly"
                ? "每月"
                : "永久"
            } ${promotionData.claimcount} 次）`,
          },
        });
      }
      return res.status(200).json({
        success: true,
        message: {
          en: "You can claim this promotion",
          zh: "您可以申请此优惠",
        },
      });
    } catch (error) {
      console.error("Error checking promotion:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Failed to check promotion",
          zh: "检查优惠失败",
        },
      });
    }
  }
);

// Admin Get Deposit Promotion
router.get(
  "/admin/api/getdepositpromotion",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const promotions = await promotion
        .find({ isDeposit: true }, "_id maintitle maintitleEN bonuspercentage")
        .sort({ createdAt: 1 });
      res.status(200).json({ success: true, data: promotions });
    } catch (error) {
      console.error(error);
      res.status(200).send({ message: "Internal server error" });
    }
  }
);

// Admin Create Promotion
router.post(
  "/admin/api/promotions",
  authenticateAdminToken,
  upload.fields([
    { name: "promotionimage", maxCount: 1 },
    { name: "promotionimage2", maxCount: 1 },
    { name: "promotionimage3", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      setConnForRequest(req.db);
      const promotionData = req.body;

      if (promotionData.allowedGameDatabaseNames) {
        if (typeof promotionData.allowedGameDatabaseNames === "string") {
          promotionData.allowedGameDatabaseNames = JSON.parse(
            promotionData.allowedGameDatabaseNames
          );
        }
      }

      if (req.files && req.files.promotionimage) {
        promotionData.promotionimage = await uploadFileToR2(
          req.files.promotionimage[0],
          req.companyId
        );
      }
      if (req.files && req.files.promotionimage2) {
        promotionData.promotionimage2 = await uploadFileToR2(
          req.files.promotionimage2[0],
          req.companyId
        );
      }
      if (req.files && req.files.promotionimage3) {
        promotionData.promotionimage3 = await uploadFileToR2(
          req.files.promotionimage3[0],
          req.companyId
        );
      }
      const newPromotion = new promotion(promotionData);
      await newPromotion.save();
      res.status(200).json({
        success: true,
        message: {
          en: "Promotion created successfully",
          zh: "优惠创建成功",
        },
        data: newPromotion,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: {
          en: "Error creating promotion",
          zh: "创建优惠时出错",
        },
      });
    }
  }
);

//  Admin Get All Promotion
router.get(
  "/admin/api/promotions",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const promotions = await promotion.find().populate("categories");
      const sortedPromotions = promotions.sort((a, b) => {
        const orderA = a.order || 0;
        const orderB = b.order || 0;
        if (orderA === 0 && orderB !== 0) return 1;
        if (orderA !== 0 && orderB === 0) return -1;
        return orderA - orderB;
      });

      res.json({ success: true, data: sortedPromotions });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// Admin Update Promotion
router.put(
  "/admin/api/promotions/:id",
  authenticateAdminToken,
  upload.fields([
    { name: "promotionimage", maxCount: 1 },
    { name: "promotionimage2", maxCount: 1 },
    { name: "promotionimage3", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      setConnForRequest(req.db);

      const existingPromotion = await promotion.findById(req.params.id);
      if (!existingPromotion) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Promotion not found",
            zh: "找不到优惠",
          },
        });
      }

      const updates = req.body;

      if (updates.allowedGameDatabaseNames) {
        if (typeof updates.allowedGameDatabaseNames === "string") {
          updates.allowedGameDatabaseNames = JSON.parse(
            updates.allowedGameDatabaseNames
          );
        }
      }

      if (updates.removePromotionImage === "true") {
        if (existingPromotion.promotionimage) {
          await smartDeleteFile(
            existingPromotion.promotionimage,
            req.companyId
          );
        }
        updates.promotionimage = null;
      } else if (req.files && req.files.promotionimage) {
        if (existingPromotion.promotionimage) {
          await smartDeleteFile(
            existingPromotion.promotionimage,
            req.companyId
          );
        }
        updates.promotionimage = await uploadFileToR2(
          req.files.promotionimage[0],
          req.companyId
        );
      }

      if (updates.removePromotionImage2 === "true") {
        if (existingPromotion.promotionimage2) {
          await smartDeleteFile(
            existingPromotion.promotionimage2,
            req.companyId
          );
        }
        updates.promotionimage2 = null;
      } else if (req.files && req.files.promotionimage2) {
        if (existingPromotion.promotionimage2) {
          await smartDeleteFile(
            existingPromotion.promotionimage2,
            req.companyId
          );
        }
        updates.promotionimage2 = await uploadFileToR2(
          req.files.promotionimage2[0],
          req.companyId
        );
      }
      if (updates.removePromotionImage3 === "true") {
        if (existingPromotion.promotionimage3) {
          await smartDeleteFile(
            existingPromotion.promotionimage3,
            req.companyId
          );
        }
        updates.promotionimage3 = null;
      } else if (req.files && req.files.promotionimage3) {
        if (existingPromotion.promotionimage3) {
          await smartDeleteFile(
            existingPromotion.promotionimage3,
            req.companyId
          );
        }
        updates.promotionimage3 = await uploadFileToR2(
          req.files.promotionimage3[0],
          req.companyId
        );
      }
      delete updates.removePromotionImage;
      delete updates.removePromotionImage2;
      delete updates.removePromotionImage3;

      const updatedPromotion = await promotion
        .findByIdAndUpdate(req.params.id, updates, { new: true })
        .populate("categories");

      res.status(200).json({
        success: true,
        message: {
          en: "Promotion updated successfully",
          zh: "优惠更新成功",
        },
        data: updatedPromotion,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: {
          en: "Error updating promotion",
          zh: "更新优惠时出错",
        },
      });
    }
  }
);

// Admin Delete Promotion
router.delete(
  "/admin/api/promotions/:id",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const existingPromotion = await promotion.findById(req.params.id);
      if (!existingPromotion) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Promotion not found",
            zh: "找不到优惠活动",
          },
        });
      }
      if (existingPromotion.promotionimage) {
        await smartDeleteFile(existingPromotion.promotionimage, req.companyId);
      }
      if (existingPromotion.promotionimage2) {
        await smartDeleteFile(existingPromotion.promotionimage2, req.companyId);
      }
      if (existingPromotion.promotionimage3) {
        await smartDeleteFile(existingPromotion.promotionimage3, req.companyId);
      }
      await promotion.findByIdAndDelete(req.params.id);
      res.status(200).json({
        success: true,
        message: {
          en: "Promotion deleted successfully",
          zh: "优惠删除成功",
        },
      });
    } catch (error) {
      console.error("Error deleting promotion:", error);
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

// Admin Update Promotion Status
router.patch(
  "/admin/api/promotions/:id/toggle",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const existingPromotion = await promotion.findById(req.params.id);
      if (!existingPromotion) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Promotion not found",
            zh: "找不到优惠",
          },
        });
      }
      existingPromotion.status = !existingPromotion.status;
      await existingPromotion.save();
      res.status(200).json({
        success: true,
        data: existingPromotion,
        message: {
          en: `Status ${
            existingPromotion.status ? "activated" : "deactivated"
          } successfully`,
          zh: `优惠已${existingPromotion.status ? "激活" : "停用"}`,
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
  }
);

// Admin Get Promotion Report
router.get(
  "/admin/api/promotions-report",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const promotions = await promotion.find().populate("categories");
      const dateFilter = {};
      if (startDate && endDate) {
        dateFilter.createdAt = {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        };
      }
      const statsResults = await Bonus.aggregate([
        {
          $match: {
            promotionId: { $in: promotions.map((p) => p._id.toString()) },
            ...dateFilter,
          },
        },
        {
          $group: {
            _id: "$promotionId",
            appClaimCount: {
              $sum: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] },
            },
            appBonusAmount: {
              $sum: { $cond: [{ $eq: ["$status", "approved"] }, "$amount", 0] },
            },
            rejClaimCount: {
              $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] },
            },
            rejBonusAmount: {
              $sum: { $cond: [{ $eq: ["$status", "rejected"] }, "$amount", 0] },
            },
            revClaimCount: {
              $sum: { $cond: [{ $eq: ["$reverted", true] }, 1, 0] },
            },
            revBonusAmount: {
              $sum: { $cond: [{ $eq: ["$reverted", true] }, "$amount", 0] },
            },
          },
        },
      ]);
      const statsMap = new Map(statsResults.map((stat) => [stat._id, stat]));
      const reportData = promotions.map((promo) => {
        const stats = statsMap.get(promo._id.toString()) || {};
        const categories = promo.categories.map((cat) => cat.name).join(", ");
        return {
          id: promo._id,
          name: promo.maintitle,
          nameEN: promo.maintitleEN,
          claimtype: promo.claimtype,
          category: categories,
          description: promo.description,
          claimType: promo.claimType,
          appClaimCount: stats.appClaimCount || 0,
          appBonusAmount: stats.appBonusAmount || 0,
          rejClaimCount: stats.rejClaimCount || 0,
          rejBonusAmount: stats.rejBonusAmount || 0,
          revClaimCount: stats.revClaimCount || 0,
          revBonusAmount: stats.revBonusAmount || 0,
        };
      });
      res.json({ success: true, data: reportData });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// Admin Get Available Kiosks
router.get(
  "/admin/api/promotions/available-kiosks",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const kiosks = await Kiosk.find({ isActive: true })
        .select("_id name databaseName categoryId")
        .populate("categoryId", "name")
        .sort({ name: 1 });
      res.status(200).json({
        success: true,
        data: kiosks,
      });
    } catch (error) {
      console.error("Error fetching kiosks:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Failed to fetch kiosks",
          zh: "获取游戏列表失败",
        },
      });
    }
  }
);
module.exports = router;
