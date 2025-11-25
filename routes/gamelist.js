const express = require("express");
const router = express.Router();
const Gamelist = require("../models/gamelist.model");
const { authenticateAdminToken } = require("../auth/adminAuth");
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const { setConnForRequest } = require("../lib/dbContext");
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});
function getBucket(companyId) {
  const bucket = process.env[`S3_MAINBUCKET_${companyId}`];
  //   console.log(`[getBucket] companyId: ${companyId}, bucket: ${bucket}`);
  return bucket;
}
async function uploadFileToS3(file, companyId) {
  const bucket = getBucket(companyId);
  if (!bucket) throw new Error(`No S3 bucket configured for ${companyId}`);
  const folderPath = "gamelist/";
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

router.use(async (req, res, next) => {
  try {
    setConnForRequest(req.db);
    const companyId = req.headers["x-company-id"];
    req.companyId = companyId;
    req.bucket = getBucket(companyId);
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

// Admin Get Game Providers
router.get(
  "/admin/api/gamelist/providers",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const providers = await Gamelist.distinct("provider");
      res.json({
        success: true,
        data: providers.filter((p) => p),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

// Admin Create Game
router.post(
  "/admin/api/gamelist",
  authenticateAdminToken,
  upload.fields([
    { name: "imageEN", maxCount: 1 },
    { name: "imageCN", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      setConnForRequest(req.db);
      const {
        gameNameEN,
        gameNameCN,
        gameID,
        rtpRate,
        hot,
        maintenance,
        provider,
        providerLaunchUrl,
        isslotgame,
      } = req.body;
      let imageUrlEN = null;
      let imageUrlCN = null;
      if (req.files.imageEN) {
        imageUrlEN = await uploadFileToS3(req.files.imageEN[0], req.companyId);
      }
      if (req.files.imageCN) {
        imageUrlCN = await uploadFileToS3(req.files.imageCN[0], req.companyId);
      }
      const game = new Gamelist({
        gameNameEN,
        gameNameCN,
        imageUrlEN,
        imageUrlCN,
        gameID,
        rtpRate,
        hot: hot === "true",
        maintenance: maintenance === "true",
        isslotgame: isslotgame === "true",
        provider,
        providerLaunchUrl,
      });
      await game.save();
      res.status(200).json({
        success: true,
        message: {
          en: "Game created successfully",
          zh: "游戏创建成功",
        },
        data: game,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: {
          en: "Error creating game",
          zh: "创建游戏时出错",
        },
        error: error.message,
      });
    }
  }
);

// Admin Get All Games
router.get("/admin/api/gamelist", authenticateAdminToken, async (req, res) => {
  try {
    const { provider, hot, maintenance, isslotgame } = req.query;
    const filter = {};
    if (provider) {
      filter.provider = provider;
    }
    if (hot !== undefined) {
      filter.hot = hot === "true";
    }
    if (maintenance !== undefined) {
      filter.maintenance = maintenance === "true";
    }
    if (isslotgame !== undefined) {
      filter.isslotgame = isslotgame === "true";
    }
    const games = await Gamelist.find(filter).sort({ createdAt: -1 });
    res.json({
      success: true,
      data: games,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Admin Update Game
router.put(
  "/admin/api/gamelist/:id",
  authenticateAdminToken,
  upload.fields([
    { name: "imageEN", maxCount: 1 },
    { name: "imageCN", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      setConnForRequest(req.db);
      const {
        gameNameEN,
        gameNameCN,
        gameID,
        rtpRate,
        hot,
        maintenance,
        provider,
        providerLaunchUrl,
        isslotgame,
      } = req.body;
      const updates = {
        gameNameEN,
        gameNameCN,
        gameID,
        rtpRate,
        hot: hot === "true",
        maintenance: maintenance === "true",
        isslotgame: isslotgame === "true",
        provider,
        providerLaunchUrl,
      };
      const game = await Gamelist.findById(req.params.id);
      if (!game) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Game not found",
            zh: "找不到游戏",
          },
        });
      }
      if (req.files.imageEN) {
        if (game.imageUrlEN) {
          const oldKey = game.imageUrlEN.split("/").slice(-2).join("/");
          await s3Client.send(
            new DeleteObjectCommand({
              Bucket: req.bucket,
              Key: oldKey,
            })
          );
        }
        updates.imageUrlEN = await uploadFileToS3(
          req.files.imageEN[0],
          req.companyId
        );
      }
      if (req.files.imageCN) {
        if (game.imageUrlCN) {
          const oldKey = game.imageUrlCN.split("/").slice(-2).join("/");
          await s3Client.send(
            new DeleteObjectCommand({
              Bucket: req.bucket,
              Key: oldKey,
            })
          );
        }
        updates.imageUrlCN = await uploadFileToS3(
          req.files.imageCN[0],
          req.companyId
        );
      }
      const updatedGame = await Gamelist.findByIdAndUpdate(
        req.params.id,
        updates,
        { new: true }
      );
      res.status(200).json({
        success: true,
        message: {
          en: "Game updated successfully",
          zh: "游戏更新成功",
        },
        data: updatedGame,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: {
          en: "Error updating game",
          zh: "更新游戏时出错",
        },
        error: error.message,
      });
    }
  }
);

// Admin Delete Game
router.delete(
  "/admin/api/gamelist/:id",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const game = await Gamelist.findById(req.params.id);
      if (!game) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Game not found",
            zh: "找不到游戏",
          },
        });
      }
      if (game.imageUrlEN) {
        const imageENKey = game.imageUrlEN.split("/").slice(-2).join("/");
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: req.bucket,
            Key: imageENKey,
          })
        );
      }
      if (game.imageUrlCN) {
        const imageCNKey = game.imageUrlCN.split("/").slice(-2).join("/");
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: req.bucket,
            Key: imageCNKey,
          })
        );
      }
      await Gamelist.findByIdAndDelete(req.params.id);
      res.status(200).json({
        success: true,
        message: {
          en: "Game deleted successfully",
          zh: "游戏删除成功",
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: {
          en: "Internal server error",
          zh: "服务器内部错误",
        },
        error: error.message,
      });
    }
  }
);

// Admin Toggle Hot Status
router.patch(
  "/admin/api/gamelist/:id/toggle-hot",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const game = await Gamelist.findById(req.params.id);
      if (!game) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Game not found",
            zh: "找不到游戏",
          },
        });
      }
      game.hot = !game.hot;
      await game.save();
      res.status(200).json({
        success: true,
        message: {
          en: `Hot status ${
            game.hot ? "activated" : "deactivated"
          } successfully`,
          zh: `热门状态${game.hot ? "已激活" : "已停用"}`,
        },
        data: game,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: {
          en: "Failed to update hot status",
          zh: "更新热门状态失败",
        },
        error: error.message,
      });
    }
  }
);

// Admin Toggle Maintenance Status
router.patch(
  "/admin/api/gamelist/:id/toggle-maintenance",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const game = await Gamelist.findById(req.params.id);
      if (!game) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Game not found",
            zh: "找不到游戏",
          },
        });
      }
      game.maintenance = !game.maintenance;
      await game.save();
      res.status(200).json({
        success: true,
        message: {
          en: `Game is now ${
            game.maintenance ? "under maintenance" : "active"
          }`,
          zh: `游戏现在${game.maintenance ? "维护中" : "已激活"}`,
        },
        data: game,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: {
          en: "Failed to update maintenance status",
          zh: "更新维护状态失败",
        },
        error: error.message,
      });
    }
  }
);

// Admin Toggle Slot Game Status
router.patch(
  "/admin/api/gamelist/:id/toggle-slotgame",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const game = await Gamelist.findById(req.params.id);
      if (!game) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Game not found",
            zh: "找不到游戏",
          },
        });
      }
      game.isslotgame = !game.isslotgame;
      await game.save();
      res.status(200).json({
        success: true,
        message: {
          en: `Slot game status ${
            game.isslotgame ? "activated" : "deactivated"
          } successfully`,
          zh: `老虎机游戏状态${game.isslotgame ? "已激活" : "已停用"}`,
        },
        data: game,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: {
          en: "Failed to update slot game status",
          zh: "更新老虎机游戏状态失败",
        },
        error: error.message,
      });
    }
  }
);

// Admin Batch Update Games (批量操作)
router.patch(
  "/admin/api/gamelist/batch",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { gameIds, action, value } = req.body;
      if (!gameIds || !Array.isArray(gameIds) || gameIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: {
            en: "Please provide game IDs",
            zh: "请提供游戏ID",
          },
        });
      }
      let updateData = {};
      switch (action) {
        case "hot":
          updateData.hot = value;
          break;
        case "maintenance":
          updateData.maintenance = value;
          break;
        case "provider":
          updateData.provider = value;
          break;
        case "isslotgame":
          updateData.isslotgame = value;
          break;
        default:
          return res.status(400).json({
            success: false,
            message: {
              en: "Invalid action",
              zh: "无效的操作",
            },
          });
      }
      const result = await Gamelist.updateMany(
        { _id: { $in: gameIds } },
        { $set: updateData }
      );
      res.status(200).json({
        success: true,
        message: {
          en: `${result.modifiedCount} games updated successfully`,
          zh: `成功更新 ${result.modifiedCount} 个游戏`,
        },
        data: {
          matched: result.matchedCount,
          modified: result.modifiedCount,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: {
          en: "Failed to batch update games",
          zh: "批量更新游戏失败",
        },
        error: error.message,
      });
    }
  }
);

module.exports = router;
