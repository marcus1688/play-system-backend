const express = require("express");
const popUp = require("../models/popup.model");
const { adminUser } = require("../models/adminuser.model");
const router = express.Router();
const { authenticateAdminToken } = require("../auth/adminAuth");
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const multer = require("multer");
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
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fieldSize: 100 * 1024 * 1024,
    fileSize: 100 * 1024 * 1024,
  },
});
const { setConnForRequest } = require("../lib/dbContext");
function getBucket(companyId) {
  const bucket = process.env[`S3_MAINBUCKET_${companyId}`];
  //   console.log(`[getBucket] companyId: ${companyId}, bucket: ${bucket}`);
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
async function uploadFileToR2(file, companyId) {
  const bucket = getR2Bucket(companyId);
  const publicId = getR2PublicId(companyId);
  if (!bucket) {
    throw new Error(`No R2 bucket configured for company: ${companyId}`);
  }
  if (!publicId) {
    throw new Error(`No R2 public ID configured for company: ${companyId}`);
  }
  const folderPath = "popup/";
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

async function handleBase64Media(base64String, companyId) {
  try {
    const matches = base64String.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      throw new Error("Invalid base64 string");
    }
    const mimeType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, "base64");
    const fileExt = mimeType.split("/")[1];
    const fileName = `${Date.now()}.${fileExt}`;

    const bucket = getR2Bucket(companyId);
    const publicId = getR2PublicId(companyId);

    if (!bucket) {
      throw new Error(`No R2 bucket configured for company: ${companyId}`);
    }
    if (!publicId) {
      throw new Error(`No R2 public ID configured for company: ${companyId}`);
    }

    const uploadParams = {
      Bucket: bucket,
      Key: `popup/${fileName}`,
      Body: buffer,
      ContentType: mimeType,
    };
    await r2Client.send(new PutObjectCommand(uploadParams));
    return `https://pub-${publicId}.r2.dev/popup/${fileName}`;
  } catch (error) {
    console.error("Error processing base64 media:", error);
    throw error;
  }
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
      if (!bucket) {
        throw new Error(`No R2 bucket configured for company: ${companyId}`);
      }

      const deleteParams = {
        Bucket: bucket,
        Key: fileKey,
      };
      await r2Client.send(new DeleteObjectCommand(deleteParams));
    } else {
      const key = fileUrl.split("/").slice(-2).join("/");
      const bucket = getBucket(companyId);
      if (bucket) {
        const deleteParams = {
          Bucket: bucket,
          Key: key,
        };
        await s3Client.send(new DeleteObjectCommand(deleteParams));
        console.log(
          `Successfully deleted S3 file: ${key} from bucket: ${bucket}`
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

// User Get Popup
router.get("/api/active-popup", async (req, res) => {
  try {
    const activePopup = await popUp
      .findOne({ status: true })
      .sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      data: activePopup,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching active popup",
      error: error.message,
    });
  }
});

// Admin Get Popup Data
router.get("/admin/api/popup", authenticateAdminToken, async (req, res) => {
  try {
    const popupData = await popUp.find().sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      data: popupData,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching popup data",
      error: error.message,
    });
  }
});

// Admnin Create Popup
router.post(
  "/admin/api/popup",
  authenticateAdminToken,
  upload.single("image"),
  async (req, res) => {
    try {
      setConnForRequest(req.db);
      const popupData = { ...req.body };
      if (req.file) {
        const imageUrl = await uploadFileToR2(req.file, req.companyId);
        popupData.image = imageUrl;
      }
      if (popupData.contentEN) {
        let contentENProcessed = popupData.contentEN;
        const base64Regex = /src="data:(image|video)\/[^;]+;base64[^"]+"/g;
        const base64Matches = popupData.contentEN.match(base64Regex);
        if (base64Matches) {
          for (const base64Match of base64Matches) {
            const base64String = base64Match.substring(
              5,
              base64Match.length - 1
            );
            try {
              const imageUrl = await handleBase64Media(
                base64String,
                req.companyId
              );
              contentENProcessed = contentENProcessed.replace(
                base64String,
                imageUrl
              );
            } catch (error) {
              console.error("Error processing image in contentEN:", error);
            }
          }
        }
        popupData.contentEN = contentENProcessed;
      }
      if (popupData.contentCN) {
        let contentCNProcessed = popupData.contentCN;
        const base64Regex = /src="data:(image|video)\/[^;]+;base64[^"]+"/g;
        const base64MatchesCN = popupData.contentCN.match(base64Regex);

        if (base64MatchesCN) {
          for (const base64Match of base64MatchesCN) {
            const base64String = base64Match.substring(
              5,
              base64Match.length - 1
            );
            try {
              const imageUrl = await handleBase64Media(
                base64String,
                req.companyId
              );
              contentCNProcessed = contentCNProcessed.replace(
                base64String,
                imageUrl
              );
            } catch (error) {
              console.error("Error processing image in contentCN:", error);
            }
          }
        }
        popupData.contentCN = contentCNProcessed;
      }
      if (popupData.status === undefined) {
        popupData.status = true;
      }
      const newPopup = new popUp(popupData);
      const savedPopup = await newPopup.save();
      res.status(200).json({
        success: true,
        message: {
          en: "Popup created successfully",
          zh: "弹窗创建成功",
        },
        data: savedPopup,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: {
          en: "Error creating popup",
          zh: "创建弹窗时出错",
        },
      });
    }
  }
);

// Admin Update Popup Data
router.put(
  "/admin/api/popup/:id",
  authenticateAdminToken,
  upload.single("image"),
  async (req, res) => {
    try {
      setConnForRequest(req.db);
      const updates = { ...req.body };
      const oldPopup = await popUp.findById(req.params.id);
      if (!oldPopup) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Popup not found",
            zh: "找不到弹窗",
          },
        });
      }
      if (req.file) {
        const imageUrl = await uploadFileToR2(req.file, req.companyId);
        updates.image = imageUrl;
        if (oldPopup?.image) {
          await smartDeleteFile(oldPopup.image, req.companyId);
        }
      }
      const mediaRegex = /<(img|video)[^>]+src="([^">]+)"/g;
      const oldImages = new Set();
      let match;
      if (oldPopup.contentEN) {
        while ((match = mediaRegex.exec(oldPopup.contentEN)) !== null) {
          const mediaUrl = match[2];
          if (
            mediaUrl.includes(req.bucket) ||
            mediaUrl.includes("r2.dev") ||
            mediaUrl.includes("r2.cloudflarestorage.com")
          ) {
            oldImages.add(mediaUrl);
          }
        }
      }
      if (oldPopup.contentCN) {
        while ((match = mediaRegex.exec(oldPopup.contentCN)) !== null) {
          const mediaUrl = match[2];
          if (
            mediaUrl.includes(req.bucket) ||
            mediaUrl.includes("r2.dev") ||
            mediaUrl.includes("r2.cloudflarestorage.com")
          ) {
            oldImages.add(mediaUrl);
          }
        }
      }
      const newImages = new Set();
      if (updates.contentEN) {
        let contentENProcessed = updates.contentEN;
        const base64Regex = /src="data:(image|video)\/[^;]+;base64[^"]+"/g;
        const base64Matches = updates.contentEN.match(base64Regex);

        if (base64Matches) {
          for (const base64Match of base64Matches) {
            const base64String = base64Match.substring(
              5,
              base64Match.length - 1
            );
            try {
              const imageUrl = await handleBase64Media(
                base64String,
                req.companyId
              );
              contentENProcessed = contentENProcessed.replace(
                base64String,
                imageUrl
              );
              newImages.add(imageUrl);
            } catch (error) {
              console.error("Error processing image in contentEN:", error);
            }
          }
        }
        updates.contentEN = contentENProcessed;
        while ((match = mediaRegex.exec(contentENProcessed)) !== null) {
          const mediaUrl = match[2];
          if (
            mediaUrl.includes(req.bucket) ||
            mediaUrl.includes("r2.dev") ||
            mediaUrl.includes("r2.cloudflarestorage.com")
          ) {
            newImages.add(mediaUrl);
          }
        }
      }
      if (updates.contentCN) {
        let contentCNProcessed = updates.contentCN;
        const base64Regex = /src="data:(image|video)\/[^;]+;base64[^"]+"/g;
        const base64MatchesCN = updates.contentCN.match(base64Regex);

        if (base64MatchesCN) {
          for (const base64Match of base64MatchesCN) {
            const base64String = base64Match.substring(
              5,
              base64Match.length - 1
            );
            try {
              const imageUrl = await handleBase64Media(
                base64String,
                req.companyId
              );
              contentCNProcessed = contentCNProcessed.replace(
                base64String,
                imageUrl
              );
              newImages.add(imageUrl);
            } catch (error) {
              console.error("Error processing image in contentCN:", error);
            }
          }
        }
        updates.contentCN = contentCNProcessed;
        while ((match = mediaRegex.exec(contentCNProcessed)) !== null) {
          const mediaUrl = match[2];
          if (
            mediaUrl.includes(req.bucket) ||
            mediaUrl.includes("r2.dev") ||
            mediaUrl.includes("r2.cloudflarestorage.com")
          ) {
            newImages.add(mediaUrl);
          }
        }
      }
      const urlsToDelete = Array.from(oldImages).filter(
        (url) => !newImages.has(url)
      );
      for (const url of urlsToDelete) {
        await smartDeleteFile(url, req.companyId);
      }
      const updatedPopup = await popUp.findByIdAndUpdate(
        req.params.id,
        updates,
        { new: true }
      );
      res.status(200).json({
        success: true,
        message: {
          en: "Popup updated successfully",
          zh: "弹窗更新成功",
        },
        data: updatedPopup,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: {
          en: "Error updating popup",
          zh: "更新弹窗时出错",
        },
      });
    }
  }
);

// Admin Delete Popup Image
router.delete(
  "/admin/api/popup/:id/delete-image",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const popup = await popUp.findById(req.params.id);
      if (!popup) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Popup not found",
            zh: "找不到弹窗",
          },
        });
      }
      if (!popup.image) {
        return res.status(200).json({
          success: false,
          message: {
            en: "No media to delete",
            zh: "没有媒体文件可删除",
          },
        });
      }
      const imageUrl = popup.image;
      await smartDeleteFile(imageUrl, req.companyId);
      popup.image = null;
      await popup.save();
      res.status(200).json({
        success: true,
        message: {
          en: "Popup media deleted successfully",
          zh: "弹窗媒体文件删除成功",
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: {
          en: "Error deleting popup media",
          zh: "删除弹窗媒体文件时出错",
        },
        error: error.message,
      });
    }
  }
);

module.exports = router;
