const express = require("express");
const router = express.Router();
const Kiosk = require("../models/kiosk.model");
const KioskCategory = require("../models/kioskcategory.model");
const { authenticateAdminToken } = require("../auth/adminAuth");
const { setConnForRequest } = require("../lib/dbContext");
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
require("dotenv").config();

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

function getBucket(companyId) {
  const bucket = process.env[`S3_MAINBUCKET_${companyId}`];
  return bucket;
}

function getR2Bucket(companyId) {
  const bucket = process.env[`R2_BUCKET_NAME_${companyId}`];
  return bucket;
}

function getR2PublicId(companyId) {
  const publicId = process.env[`R2_PUBLIC_ID_${companyId}`];
  return publicId;
}

async function uploadFileToS3(file, companyId) {
  const bucket = getBucket(companyId);
  if (!bucket) throw new Error(`No S3 bucket configured for ${companyId}`);
  const folderPath = "kiosk/";
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

async function uploadFileToR2(file, companyId) {
  const bucket = getR2Bucket(companyId);
  const publicId = getR2PublicId(companyId);
  if (!bucket) throw new Error(`No R2 bucket configured for ${companyId}`);
  if (!publicId) throw new Error(`No R2 public ID configured for ${companyId}`);
  const folderPath = "kiosk/";
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
      Kiosk.findOne().limit(1),
      KioskCategory.findOne().limit(1),
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

// Admin Create Kiosk
router.post(
  "/admin/api/kiosks",
  authenticateAdminToken,
  upload.fields([
    { name: "logo", maxCount: 1 },
    { name: "icon", maxCount: 1 },
    { name: "banner", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      setConnForRequest(req.db);

      const {
        categoryId,
        name,
        apiLink,
        gameListLink,
        backendLink,
        downloadUrl,
        iosDownloadUrl,
        androidDownloadUrl,
        changePasswordApi,
        transferInAPI,
        transferOutAPI,
        balanceAPI,
        databaseName,
        databaseGameID,
        databaseGamePassword,
        databasePastGameID,
        databasePastGamePassword,
        setAsMainAPI,
        lockTransferInAPI,
        lockTransferOutAPI,
        lockGameAPI,
        yesterdayTurnoverWinlossAPI,
        todayTurnoverWinlossAPI,
        todayKioskReportAPI,
        yesterdayKioskReportAPI,
        transferAllBalanceAPI,
        transferBalanceAPI,
        registerGameAPI,
        adminCheckUserBalanceAPI,
        isActive,
        isManualGame,
        isHTMLGame,
      } = req.body;

      let logoUrl = null;
      let iconUrl = null;
      let bannerUrl = null;

      // Upload to R2 (preferred) or S3
      if (req.files.logo) {
        logoUrl = await uploadFileToR2(req.files.logo[0], req.companyId);
      }
      if (req.files.icon) {
        iconUrl = await uploadFileToR2(req.files.icon[0], req.companyId);
      }
      if (req.files.banner) {
        bannerUrl = await uploadFileToR2(req.files.banner[0], req.companyId);
      }

      const kiosk = new Kiosk({
        categoryId,
        name,
        apiLink,
        gameListLink,
        backendLink,
        downloadUrl,
        iosDownloadUrl,
        androidDownloadUrl,
        changePasswordApi,
        transferInAPI,
        transferOutAPI,
        balanceAPI,
        databaseName,
        databaseGameID,
        databaseGamePassword,
        databasePastGameID,
        databasePastGamePassword,
        setAsMainAPI,
        lockTransferInAPI,
        lockTransferOutAPI,
        lockGameAPI,
        yesterdayTurnoverWinlossAPI,
        todayTurnoverWinlossAPI,
        todayKioskReportAPI,
        yesterdayKioskReportAPI,
        transferAllBalanceAPI,
        transferBalanceAPI,
        registerGameAPI,
        adminCheckUserBalanceAPI,
        isManualGame,
        isHTMLGame,
        logo: logoUrl,
        icon: iconUrl,
        banner: bannerUrl,
        isActive: isActive === "true",
      });

      await kiosk.save();

      res.status(200).json({
        success: true,
        message: {
          en: "Kiosk created successfully",
          zh: "游戏终端创建成功",
        },
        data: kiosk,
      });
    } catch (error) {
      console.error("Error creating kiosk:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error creating kiosk",
          zh: "创建游戏终端时出错",
        },
      });
    }
  }
);

// Admin Get All Kiosks
router.get("/admin/api/kiosks", authenticateAdminToken, async (req, res) => {
  try {
    const kiosks = await Kiosk.find()
      .populate("categoryId")
      .sort({ createdAt: -1 });
    res.json({ success: true, data: kiosks });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Admin Update Kiosk
router.put(
  "/admin/api/kiosks/:id",
  authenticateAdminToken,
  upload.fields([
    { name: "logo", maxCount: 1 },
    { name: "icon", maxCount: 1 },
    { name: "banner", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      setConnForRequest(req.db);

      const {
        categoryId,
        name,
        apiLink,
        gameListLink,
        backendLink,
        downloadUrl,
        iosDownloadUrl,
        androidDownloadUrl,
        changePasswordApi,
        transferInAPI,
        transferOutAPI,
        balanceAPI,
        databaseName,
        databaseGameID,
        databaseGamePassword,
        databasePastGameID,
        databasePastGamePassword,
        setAsMainAPI,
        lockTransferInAPI,
        lockTransferOutAPI,
        lockGameAPI,
        yesterdayTurnoverWinlossAPI,
        todayTurnoverWinlossAPI,
        todayKioskReportAPI,
        yesterdayKioskReportAPI,
        transferAllBalanceAPI,
        transferBalanceAPI,
        registerGameAPI,
        adminCheckUserBalanceAPI,
        isManualGame,
        isHTMLGame,
        isActive,
      } = req.body;

      const updates = {
        categoryId,
        name,
        apiLink,
        gameListLink,
        backendLink,
        downloadUrl,
        iosDownloadUrl,
        androidDownloadUrl,
        changePasswordApi,
        transferInAPI,
        transferOutAPI,
        balanceAPI,
        databaseName,
        databaseGameID,
        databaseGamePassword,
        databasePastGameID,
        databasePastGamePassword,
        setAsMainAPI,
        lockTransferInAPI,
        lockTransferOutAPI,
        lockGameAPI,
        yesterdayTurnoverWinlossAPI,
        todayTurnoverWinlossAPI,
        todayKioskReportAPI,
        yesterdayKioskReportAPI,
        transferAllBalanceAPI,
        transferBalanceAPI,
        registerGameAPI,
        adminCheckUserBalanceAPI,
        isManualGame,
        isHTMLGame,
        isActive: isActive === "true",
      };

      const kiosk = await Kiosk.findById(req.params.id);
      if (!kiosk) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Kiosk not found",
            zh: "找不到游戏终端",
          },
        });
      }

      // Handle logo update
      if (req.files.logo) {
        if (kiosk.logo) {
          await smartDeleteFile(kiosk.logo, req.companyId);
        }
        updates.logo = await uploadFileToR2(req.files.logo[0], req.companyId);
      }

      // Handle icon update
      if (req.files.icon) {
        if (kiosk.icon) {
          await smartDeleteFile(kiosk.icon, req.companyId);
        }
        updates.icon = await uploadFileToR2(req.files.icon[0], req.companyId);
      }

      // Handle banner update
      if (req.files.banner) {
        if (kiosk.banner) {
          await smartDeleteFile(kiosk.banner, req.companyId);
        }
        updates.banner = await uploadFileToR2(
          req.files.banner[0],
          req.companyId
        );
      }

      const updatedKiosk = await Kiosk.findByIdAndUpdate(
        req.params.id,
        updates,
        { new: true }
      ).populate("categoryId");

      res.status(200).json({
        success: true,
        message: {
          en: "Kiosk updated successfully",
          zh: "游戏终端更新成功",
        },
        data: updatedKiosk,
      });
    } catch (error) {
      console.error("Error updating kiosk:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error updating kiosk",
          zh: "更新游戏终端时出错",
        },
      });
    }
  }
);

// Admin Delete Kiosk
router.delete(
  "/admin/api/kiosks/:id",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const kiosk = await Kiosk.findById(req.params.id);
      if (!kiosk) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Kiosk not found",
            zh: "找不到游戏终端",
          },
        });
      }

      // Delete all associated files
      if (kiosk.logo) {
        await smartDeleteFile(kiosk.logo, req.companyId);
      }
      if (kiosk.icon) {
        await smartDeleteFile(kiosk.icon, req.companyId);
      }
      if (kiosk.banner) {
        await smartDeleteFile(kiosk.banner, req.companyId);
      }

      await Kiosk.findByIdAndDelete(req.params.id);

      res.status(200).json({
        success: true,
        message: {
          en: "Kiosk deleted successfully",
          zh: "游戏终端删除成功",
        },
      });
    } catch (error) {
      console.error("Error deleting kiosk:", error);
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

// Admin Toggle Kiosk Status
router.patch(
  "/admin/api/kiosks/:id/toggle",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const kiosk = await Kiosk.findById(req.params.id);
      if (!kiosk) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Kiosk not found",
            zh: "找不到游戏终端",
          },
        });
      }

      kiosk.isActive = !kiosk.isActive;
      await kiosk.save();

      res.status(200).json({
        success: true,
        message: {
          en: `Kiosk is now ${kiosk.isActive ? "active" : "inactive"}`,
          zh: `游戏终端现在${kiosk.isActive ? "已激活" : "已停用"}`,
        },
        data: kiosk,
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

// Admin Toggle Hot Game Status
router.patch(
  "/admin/api/kiosks/:id/toggle-hot-game",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const kiosk = await Kiosk.findById(req.params.id);
      if (!kiosk) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Kiosk not found",
            zh: "找不到游戏终端",
          },
        });
      }

      kiosk.isHotGame = !kiosk.isHotGame;
      await kiosk.save();

      res.status(200).json({
        success: true,
        message: {
          en: `Hot game status ${
            kiosk.isHotGame ? "activated" : "deactivated"
          } successfully`,
          zh: `热门游戏状态${kiosk.isHotGame ? "已激活" : "已停用"}`,
        },
        data: kiosk,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: {
          en: "Failed to update hot game status",
          zh: "更新热门游戏状态失败",
        },
      });
    }
  }
);

// Get Backend Link by Game Name
router.get("/admin/api/kiosk/backend-link/:gameName", async (req, res) => {
  try {
    const { gameName } = req.params;
    if (!gameName) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Game name is required",
          zh: "游戏名称是必需的",
        },
      });
    }
    const gameNameLower = gameName
      .toLowerCase()
      .trim()
      .replace(/[^a-zA-Z0-9]/g, "");
    const kiosks = await Kiosk.find({ isActive: true });
    const matchedKiosk = kiosks.find(
      (kiosk) =>
        kiosk.name
          .toLowerCase()
          .trim()
          .replace(/[^a-zA-Z0-9]/g, "") === gameNameLower
    );
    if (!matchedKiosk) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Game not found or inactive",
          zh: "找不到游戏或游戏已停用",
        },
      });
    }
    if (!matchedKiosk.backendLink) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Backend link not configured for this game",
          zh: "该游戏未配置后端链接",
        },
      });
    }
    res.status(200).json({
      success: true,
      message: {
        en: "Backend link retrieved successfully",
        zh: "后端链接获取成功",
      },
      data: {
        gameName: matchedKiosk.name,
        backendLink: matchedKiosk.backendLink,
      },
    });
  } catch (error) {
    console.error("Error fetching backend link:", error);
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
