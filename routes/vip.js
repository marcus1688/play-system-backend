const express = require("express");
const vip = require("../models/vip.model");
const { adminUser } = require("../models/adminuser.model");
const { User } = require("../models/users.model");
const router = express.Router();
const { authenticateAdminToken } = require("../auth/adminAuth");
const { authenticateToken } = require("../auth/auth");
const Withdraw = require("../models/withdraw.model");
const Deposit = require("../models/deposit.model");
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const multer = require("multer");
const moment = require("moment");
const { parse } = require("dotenv");
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
    fieldSize: 10 * 1024 * 1024,
    fileSize: 10 * 1024 * 1024,
  },
});
async function uploadFileToS3(file) {
  const folderPath = "vip/";
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

// Get User VIP Icon
router.get("/api/vipicon", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    const vipSettings = await vip.findOne();
    if (
      !vipSettings ||
      !vipSettings.vipLevels ||
      !vipSettings.vipLevels.length
    ) {
      return res.status(404).json({
        success: false,
        message: "VIP settings not found",
      });
    }
    const userVipLevel = user.viplevel || 0;
    if (userVipLevel === "member") {
      return res.json({
        success: true,
        data: {
          level: 0,
          iconUrl: "/favicon.png",
        },
      });
    }
    const vipLevelData = vipSettings.vipLevels[userVipLevel - 1];

    if (!vipLevelData) {
      return res.status(404).json({
        success: false,
        message: "VIP level data not found",
      });
    }
    res.json({
      success: true,
      data: {
        level: userVipLevel,
        iconUrl: vipLevelData.iconUrl || "/favicon.png",
      },
    });
  } catch (error) {
    console.error("Error getting VIP icon:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

//  User Get VIP Settings
router.get("/api/vipsettings", async (req, res) => {
  try {
    const settings = await vip.find();
    res.json({
      success: true,
      data: settings,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Admin Create VIP Settings
router.post(
  "/admin/api/vipsettings",
  authenticateAdminToken,
  upload.any(),
  async (req, res) => {
    try {
      const vipData =
        typeof req.body.settings === "string"
          ? JSON.parse(req.body.settings)
          : req.body.settings;
      const files = req.files || [];
      let existingVip = await vip.findOne();
      if (existingVip) {
        const deletePromises = existingVip.vipLevels.map(
          async (oldLevel, oldIndex) => {
            const stillExists = vipData.vipLevels.some(
              (newLevel, newIndex) =>
                newIndex === oldIndex && newLevel.iconUrl === oldLevel.iconUrl
            );
            if (oldLevel.iconUrl && !stillExists) {
              const oldKey = oldLevel.iconUrl.split("/").pop();
              try {
                await s3Client.send(
                  new DeleteObjectCommand({
                    Bucket: process.env.S3_MAINBUCKET,
                    Key: `vip/${oldKey}`,
                  })
                );
              } catch (error) {
                console.error("Error deleting old icon:", error);
              }
            }
          }
        );
        await Promise.all(deletePromises);
      }
      const uploadPromises = vipData.vipLevels.map(async (level, index) => {
        const file = files.find((f) => f.fieldname === `icon_${index}`);
        if (file) {
          if (existingVip && existingVip.vipLevels[index]?.iconUrl) {
            const oldKey = existingVip.vipLevels[index].iconUrl
              .split("/")
              .pop();
            try {
              await s3Client.send(
                new DeleteObjectCommand({
                  Bucket: process.env.S3_MAINBUCKET,
                  Key: `vip/${oldKey}`,
                })
              );
            } catch (error) {
              console.error("Error deleting old icon:", error);
            }
          }
          level.iconUrl = await uploadFileToS3(file);
        } else if (
          existingVip &&
          existingVip.vipLevels[index]?.iconUrl &&
          level.iconUrl
        ) {
          level.iconUrl = existingVip.vipLevels[index].iconUrl;
        }
        return level;
      });
      vipData.vipLevels = await Promise.all(uploadPromises);
      if (existingVip) {
        const updatedVip = await vip.findByIdAndUpdate(
          existingVip._id,
          {
            $set: {
              tableTitle: vipData.tableTitle,
              rowHeaders: vipData.rowHeaders,
              vipLevels: vipData.vipLevels,
              terms: vipData.terms,
            },
          },
          { new: true }
        );
        return res.status(200).json({
          success: true,
          message: {
            en: "VIP settings updated successfully",
            zh: "VIP 设置更新成功",
          },
          data: updatedVip,
        });
      } else {
        const newVipSettings = new vip(vipData);
        await newVipSettings.save();
        return res.status(200).json({
          success: true,
          message: {
            en: "VIP settings created successfully",
            zh: "VIP 设置创建成功",
          },
          data: newVipSettings,
        });
      }
    } catch (error) {
      console.error("Error:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "Error saving VIP settings",
          zh: "保存 VIP 设置时出错",
        },
      });
    }
  }
);

//  Admin Get VIP Settings
router.get(
  "/admin/api/vipsettings",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const settings = (await vip.findOne()) || {
        tableTitle: "VIP Benefits",
        rowHeaders: [],
        vipLevels: [],
        terms: { en: "", zh: "" },
      };
      res.json({
        success: true,
        data: settings,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

// Admin Delete VIP Settings
router.delete(
  "/admin/api/vipsettings/:id",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const existingVip = await vip.findById(req.params.id);
      if (!existingVip) {
        return res.status(404).json({
          success: false,
          message: "VIP settings not found",
        });
      }

      if (existingVip.iconUrl) {
        const imageKey = existingVip.iconUrl.split("/").slice(-2).join("/");
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: process.env.S3_MAINBUCKET,
            Key: imageKey,
          })
        );
      }

      await vip.findByIdAndDelete(req.params.id);
      res.json({
        success: true,
        message: "VIP settings deleted successfully",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

module.exports = router;
