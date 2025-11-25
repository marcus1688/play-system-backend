const express = require("express");
const general = require("../models/general.model");
const router = express.Router();
const { authenticateAdminToken } = require("../auth/adminAuth");
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const multer = require("multer");
const QRCode = require("qrcode");
const { createCanvas, loadImage } = require("canvas");
const path = require("path");
const { setConnForRequest } = require("../lib/dbContext");
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
const upload = multer({ storage: multer.memoryStorage() });
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

async function smartUploadFile(file, companyId, fileType = "general") {
  const isVideo = file.mimetype.startsWith("video/");
  const isApk =
    file.mimetype === "application/vnd.android.package-archive" ||
    file.originalname.toLowerCase().endsWith(".apk");
  if (isVideo || isApk) {
    return await uploadFileToR2(file, companyId);
  } else {
    return await uploadFileToS3(file, companyId);
  }
}

async function uploadFileToS3(file, companyId) {
  const bucket = getBucket(companyId);
  if (!bucket) {
    throw new Error(`No S3 bucket configured for company: ${companyId}`);
  }
  const folderPath = "general/";
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

  if (!bucket) {
    throw new Error(`No R2 bucket configured for company: ${companyId}`);
  }
  if (!publicId) {
    throw new Error(`No R2 public ID configured for company: ${companyId}`);
  }

  const folderPath = "general/";
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

async function uploadVideoToR2(file, companyId) {
  const bucket = getR2Bucket(companyId);
  const publicId = getR2PublicId(companyId);
  if (!bucket) {
    throw new Error(`No R2 bucket configured for company: ${companyId}`);
  }
  if (!publicId) {
    throw new Error(`No R2 public ID configured for company: ${companyId}`);
  }
  const folderPath = "general/";
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
      if (!bucket) {
        throw new Error(`No R2 bucket configured for company: ${companyId}`);
      }
      const deleteParams = {
        Bucket: bucket,
        Key: fileKey,
      };
      await r2Client.send(new DeleteObjectCommand(deleteParams));
      console.log(
        `Successfully deleted R2 file: ${fileKey} from bucket: ${bucket}`
      );
    } else {
      const key = fileUrl.split("/").slice(-2).join("/");
      const bucket = getBucket(companyId);
      if (bucket) {
        const deleteParams = {
          Bucket: bucket,
          Key: key,
        };
        await s3Client.send(new DeleteObjectCommand(deleteParams));
      }
    }
  } catch (error) {
    console.error("Error deleting file:", error);
  }
}

async function generateQRWithLogo(
  text,
  logoData = null,
  companyId,
  maxLogoWidth = 80,
  maxLogoHeight = 80
) {
  try {
    const canvas = createCanvas(400, 400);
    const ctx = canvas.getContext("2d");

    await QRCode.toCanvas(canvas, text, {
      width: 400,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
      errorCorrectionLevel: "H",
    });
    const logoToUse =
      logoData || path.join(__dirname, `../public/${companyId}_favicon.png`);
    if (logoToUse) {
      const logo = await loadImage(logoToUse);
      const logoAspectRatio = logo.width / logo.height;
      let logoWidth = maxLogoWidth;
      let logoHeight = maxLogoHeight;

      if (logoAspectRatio > 1) {
        logoWidth = maxLogoWidth;
        logoHeight = logoWidth / logoAspectRatio;
      } else {
        logoHeight = maxLogoHeight;
        logoWidth = logoHeight * logoAspectRatio;
      }
      if (logoWidth > maxLogoWidth) {
        logoWidth = maxLogoWidth;
        logoHeight = logoWidth / logoAspectRatio;
      }
      if (logoHeight > maxLogoHeight) {
        logoHeight = maxLogoHeight;
        logoWidth = logoHeight * logoAspectRatio;
      }
      const clearSize = Math.max(logoWidth, logoHeight) + 24;
      const x = (400 - logoWidth) / 2;
      const y = (400 - logoHeight) / 2;
      const clearX = (400 - clearSize) / 2;
      const clearY = (400 - clearSize) / 2;
      ctx.fillStyle = "white";
      ctx.fillRect(clearX, clearY, clearSize, clearSize);
      ctx.fillStyle = "#1a1a1a";
      ctx.beginPath();
      ctx.roundRect(clearX, clearY, clearSize, clearSize, 12);
      ctx.fill();
      ctx.strokeStyle = "#333333";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.drawImage(logo, x, y, logoWidth, logoHeight);
    }
    return canvas.toDataURL();
  } catch (error) {
    console.error("Error generating QR with logo:", error);
    return await QRCode.toDataURL(text);
  }
}

async function generateAndUploadQRCode(apkUrl, companyId) {
  const qrDataURL = await generateQRWithLogo(apkUrl, null, companyId);
  const base64Data = qrDataURL.replace(/^data:image\/png;base64,/, "");
  const qrBuffer = Buffer.from(base64Data, "base64");
  const bucket = getBucket(companyId);
  if (!bucket) {
    throw new Error(`No S3 bucket configured for company: ${companyId}`);
  }
  const folderPath = "general/";
  const fileKey = `${folderPath}${Date.now()}_apk_qrcode.png`;
  const uploadParams = {
    Bucket: bucket,
    Key: fileKey,
    Body: qrBuffer,
    ContentType: "image/png",
  };
  await s3Client.send(new PutObjectCommand(uploadParams));
  return `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`;
}

async function generateAndUploadQRCodeToR2(apkUrl, companyId) {
  const qrDataURL = await generateQRWithLogo(apkUrl, null, companyId);
  const base64Data = qrDataURL.replace(/^data:image\/png;base64,/, "");
  const qrBuffer = Buffer.from(base64Data, "base64");

  const bucket = getR2Bucket(companyId);
  const publicId = getR2PublicId(companyId);

  if (!bucket || !publicId) {
    throw new Error(`No R2 bucket configured for company: ${companyId}`);
  }

  const folderPath = "general/";
  const fileKey = `${folderPath}${Date.now()}_apk_qrcode.png`;

  const uploadParams = {
    Bucket: bucket,
    Key: fileKey,
    Body: qrBuffer,
    ContentType: "image/png",
  };

  await r2Client.send(new PutObjectCommand(uploadParams));
  return `https://pub-${publicId}.r2.dev/${fileKey}`;
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

// Admin Create General Setting Data
router.post(
  "/admin/api/generalsetting",
  authenticateAdminToken,
  upload.fields([
    { name: "logoimage", maxCount: 1 },
    { name: "logogif", maxCount: 1 },
    { name: "video", maxCount: 2 },
    { name: "apkfile", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      setConnForRequest(req.db);
      const {
        company,
        country,
        website,
        welcomemessageCN,
        welcomemessageEN,
        announcementCN,
        announcementEN,
        referralCN,
        referralEN,
        telegram,
        wechat,
        videotitleCN,
        videotitleEN,
        videodescriptionCN,
        videodescriptionEN,
        facebook,
        instagram,
        livechat,
        gmail,
        youtube,
        whatsapp,
        minDeposit,
        maxDeposit,
        minWithdraw,
        maxWithdraw,
      } = req.body;
      let uploadedFiles = {
        logoimage: null,
        logogif: null,
        video: [],
        apkfile: null,
      };
      let apkVersion = null;
      let apkQrCode = null;
      if (req.files.logoimage && req.files.logoimage[0]) {
        try {
          uploadedFiles.logoimage = await uploadFileToS3(
            req.files.logoimage[0],
            req.companyId
          );
        } catch (error) {
          console.error("Error uploading logo to S3:", error);
          return res.status(200).json({
            success: false,
            message: {
              en: "Failed to upload logo image. Please try again.",
              zh: "上传徽标图像失败，请重试。",
            },
          });
        }
      }
      if (req.files.logogif && req.files.logogif[0]) {
        try {
          uploadedFiles.logogif = await uploadFileToS3(
            req.files.logogif[0],
            req.companyId
          );
        } catch (error) {
          console.error("Error uploading logo gif to S3:", error);
          return res.status(200).json({
            success: false,
            message: {
              en: "Failed to upload logo animation. Please try again.",
              zh: "上传徽标动画失败，请重试。",
            },
          });
        }
      }
      if (req.files.video && req.files.video.length > 0) {
        try {
          for (const videoFile of req.files.video) {
            const videoUrl = await uploadVideoToR2(videoFile, req.companyId);
            uploadedFiles.video.push(videoUrl);
          }
        } catch (error) {
          console.error("Error uploading videos to R2:", error);
          return res.status(200).json({
            success: false,
            message: {
              en: "Failed to upload videos. Please try again.",
              zh: "上传视频失败，请重试。",
            },
          });
        }
      }
      if (req.files.apkfile && req.files.apkfile[0]) {
        try {
          uploadedFiles.apkfile = await uploadFileToR2(
            req.files.apkfile[0],
            req.companyId
          );
          const originalName = req.files.apkfile[0].originalname;
          apkVersion = originalName.replace(/\.apk$/i, "");
          apkQrCode = await generateAndUploadQRCodeToR2(
            uploadedFiles.apkfile,
            req.companyId
          );
        } catch (error) {
          console.error("Error uploading APK to S3:", error);
          return res.status(200).json({
            success: false,
            message: {
              en: "Failed to upload APK file. Please try again.",
              zh: "上传APK文件失败，请重试。",
              ms: "Gagal memuat naik fail APK. Sila cuba lagi.",
            },
          });
        }
      }
      const generalSetting = new general({
        company,
        logoimage: uploadedFiles.logoimage,
        logogif: uploadedFiles.logogif,
        video: uploadedFiles.video,
        apkfile: uploadedFiles.apkfile,
        apkversion: apkVersion,
        apkqrcode: apkQrCode,
        country,
        website,
        welcomemessageCN,
        welcomemessageEN,
        announcementCN,
        announcementEN,
        referralCN,
        referralEN,
        telegram,
        wechat,
        videotitleCN,
        videotitleEN,
        videodescriptionCN,
        videodescriptionEN,
        facebook,
        instagram,
        livechat,
        gmail,
        youtube,
        whatsapp,
        minDeposit: minDeposit || 0,
        maxDeposit: maxDeposit || 0,
        minWithdraw: minWithdraw || 0,
        maxWithdraw: maxWithdraw || 0,
      });
      const savedData = await generalSetting.save();
      res.status(200).json({
        success: true,
        message: {
          en: "General setting created successfully",
          zh: "常规设置创建成功",
        },
        data: savedData,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: {
          en: "Error creating general setting",
          zh: "创建常规设置时出错",
        },
      });
    }
  }
);

// Admin Get All General Setting Data
router.get(
  "/admin/api/generalsetting",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const generalData = await general.find().sort({ createdAt: -1 });
      res.status(200).json({
        success: true,
        data: generalData,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error fetching general setting",
        error: error.message,
      });
    }
  }
);

// Admin Update General Setting Data
router.put(
  "/admin/api/generalsetting/:id",
  authenticateAdminToken,
  upload.fields([
    { name: "logoimage", maxCount: 1 },
    { name: "logogif", maxCount: 1 },
    { name: "video", maxCount: 2 },
    { name: "apkfile", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      setConnForRequest(req.db);
      const {
        company,
        country,
        website,
        welcomemessageCN,
        welcomemessageEN,
        announcementCN,
        announcementEN,
        referralCN,
        referralEN,
        telegram,
        wechat,
        videotitleCN,
        videotitleEN,
        videodescriptionCN,
        videodescriptionEN,
        facebook,
        instagram,
        livechat,
        gmail,
        youtube,
        whatsapp,
        videosToDelete,
        minDeposit,
        maxDeposit,
        minWithdraw,
        maxWithdraw,
      } = req.body;
      const generalUpdate = await general.findById(req.params.id);
      if (!generalUpdate) {
        return res.status(200).json({
          success: false,
          message: {
            en: "General Setting not found",
            zh: "找不到常规设置",
          },
        });
      }
      const updates = {
        company: company || "",
        country: country || "",
        website: website || "",
        welcomemessageCN: welcomemessageCN || "",
        welcomemessageEN: welcomemessageEN || "",
        announcementCN: announcementCN || "",
        announcementEN: announcementEN || "",
        referralCN: referralCN || "",
        referralEN: referralEN || "",
        telegram: telegram || "",
        wechat: wechat || "",
        videotitleCN: videotitleCN || "",
        videotitleEN: videotitleEN || "",
        videodescriptionCN: videodescriptionCN || "",
        videodescriptionEN: videodescriptionEN || "",
        facebook: facebook || "",
        instagram: instagram || "",
        livechat: livechat || "",
        gmail: gmail || "",
        youtube: youtube || "",
        whatsapp: whatsapp || "",
        minDeposit: minDeposit !== undefined ? minDeposit : 0,
        maxDeposit: maxDeposit !== undefined ? maxDeposit : 0,
        minWithdraw: minWithdraw !== undefined ? minWithdraw : 0,
        maxWithdraw: maxWithdraw !== undefined ? maxWithdraw : 0,
      };
      if (req.files.logoimage && req.files.logoimage[0]) {
        if (generalUpdate.logoimage) {
          await smartDeleteFile(generalUpdate.logoimage, req.companyId);
        }
        try {
          updates.logoimage = await uploadFileToS3(
            req.files.logoimage[0],
            req.companyId
          );
        } catch (error) {
          console.error("Error uploading new logo image:", error);
          return res.status(200).json({
            success: false,
            message: {
              en: "Failed to upload new logo image. Please try again.",
              zh: "上传新徽标图像失败，请重试。",
            },
          });
        }
      }
      if (req.files.logogif && req.files.logogif[0]) {
        if (generalUpdate.logogif) {
          await smartDeleteFile(generalUpdate.logogif, req.companyId);
        }
        try {
          updates.logogif = await uploadFileToS3(
            req.files.logogif[0],
            req.companyId
          );
        } catch (error) {
          console.error("Error uploading new logo gif:", error);
          return res.status(200).json({
            success: false,
            message: {
              en: "Failed to upload new logo gif. Please try again.",
              zh: "上传新徽标动画失败，请重试。",
            },
          });
        }
      }
      let currentVideos = generalUpdate.video || [];
      if (videosToDelete) {
        try {
          const indicesToDelete = JSON.parse(videosToDelete);
          for (const index of indicesToDelete) {
            if (currentVideos[index]) {
              await smartDeleteFile(currentVideos[index], req.companyId);
            }
          }
          currentVideos = currentVideos.filter(
            (_, index) => !indicesToDelete.includes(index)
          );
        } catch (error) {
          console.error("Error parsing videosToDelete:", error);
        }
      }
      if (req.files.video && req.files.video.length > 0) {
        try {
          for (const videoFile of req.files.video) {
            if (currentVideos.length >= 2) {
              return res.status(200).json({
                success: false,
                message: {
                  en: "Cannot upload more than 2 videos",
                  zh: "不能上传超过2个视频",
                },
              });
            }
            const videoUrl = await uploadVideoToR2(videoFile, req.companyId);
            currentVideos.push(videoUrl);
          }
        } catch (error) {
          console.error("Error uploading new videos to R2:", error);
          return res.status(200).json({
            success: false,
            message: {
              en: "Failed to upload new videos. Please try again.",
              zh: "上传新视频失败，请重试。",
            },
          });
        }
      }
      updates.video = currentVideos;
      if (req.files.apkfile && req.files.apkfile[0]) {
        if (generalUpdate.apkfile) {
          await smartDeleteFile(generalUpdate.apkfile, req.companyId);
        }
        if (generalUpdate.apkqrcode) {
          await smartDeleteFile(generalUpdate.apkqrcode, req.companyId);
        }
        try {
          updates.apkfile = await uploadFileToR2(
            req.files.apkfile[0],
            req.companyId
          );
          const originalName = req.files.apkfile[0].originalname;
          updates.apkversion = originalName.replace(/\.apk$/i, "");
          updates.apkqrcode = await generateAndUploadQRCodeToR2(
            updates.apkfile,
            req.companyId
          );
        } catch (error) {
          console.error("Error uploading new APK:", error);
          return res.status(200).json({
            success: false,
            message: {
              en: "Failed to upload new APK. Please try again.",
              zh: "上传新APK失败，请重试。",
              ms: "Gagal memuat naik APK baru. Sila cuba lagi.",
            },
          });
        }
      }
      const updateGeneralSetting = await general.findByIdAndUpdate(
        req.params.id,
        updates,
        { new: true }
      );
      res.status(200).json({
        success: true,
        message: {
          en: "General setting updated successfully",
          zh: "常规设置更新成功",
        },
        data: updateGeneralSetting,
      });
    } catch (error) {
      console.error("Error updating general setting:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error updating general setting",
          zh: "更新常规设置时出错",
        },
      });
    }
  }
);

module.exports = router;
