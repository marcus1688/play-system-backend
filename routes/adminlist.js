const express = require("express");
const adminList = require("../models/adminlist.model");
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
const upload = multer({ storage: multer.memoryStorage() });
async function uploadFileToS3(file) {
  const folderPath = "admin/";
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

// Create New Admin List Data
router.post(
  "/api/adminlist",
  authenticateAdminToken,
  upload.fields([
    { name: "logoimage", maxCount: 1 },
    { name: "logogif", maxCount: 1 },
    { name: "video", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const {
        company,
        country,
        website,
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
      } = req.body;
      let uploadedFiles = {
        logoimage: null,
        logogif: null,
        video: null,
      };
      if (req.files.logoimage && req.files.logoimage[0]) {
        try {
          uploadedFiles.logoimage = await uploadFileToS3(
            req.files.logoimage[0],
            "image"
          );
        } catch (error) {
          console.error("Error uploading logo to S3:", error);
          return res.status(400).json({
            success: false,
            message: "Failed to upload logo image. Please try again.",
          });
        }
      }
      if (req.files.logogif && req.files.logogif[0]) {
        try {
          uploadedFiles.logogif = await uploadFileToS3(
            req.files.logogif[0],
            "gif"
          );
        } catch (error) {
          console.error("Error uploading logo gif to S3:", error);
          return res.status(400).json({
            success: false,
            message: "Failed to upload logo animation. Please try again.",
          });
        }
      }
      if (req.files.video && req.files.video[0]) {
        try {
          uploadedFiles.video = await uploadFileToS3(
            req.files.video[0],
            "video"
          );
        } catch (error) {
          console.error("Error uploading video to S3:", error);
          return res.status(400).json({
            success: false,
            message: "Failed to upload video. Please try again.",
          });
        }
      }
      const adminListData = new adminList({
        company,
        logoimage: uploadedFiles.logoimage,
        logogif: uploadedFiles.logogif,
        video: uploadedFiles.video,
        country,
        website,
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
      });

      const savedData = await adminListData.save();
      res.status(201).json({
        success: true,
        message: "Admin list created successfully",
        data: savedData,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error creating admin list",
        error: error.message,
      });
    }
  }
);

// Get all Admin List Data
router.get("/api/adminlist", async (req, res) => {
  try {
    const adminListData = await adminList.find().sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      data: adminListData,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching admin list",
      error: error.message,
    });
  }
});

// Update Admin List Data
router.put(
  "/api/adminlist/:id",
  authenticateAdminToken,
  upload.fields([
    { name: "logoimage", maxCount: 1 },
    { name: "logogif", maxCount: 1 },
    { name: "video", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const {
        company,
        country,
        website,
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
      } = req.body;
      const adminToUpdate = await adminList.findById(req.params.id);
      if (!adminToUpdate) {
        return res.status(404).json({
          success: false,
          message: "Admin list not found",
        });
      }
      const updates = {
        company,
        country,
        website,
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
      };
      if (req.files.logoimage && req.files.logoimage[0]) {
        if (adminToUpdate.logoimage) {
          const oldImageUrl = adminToUpdate.logoimage;
          const oldKey = oldImageUrl.split("/").slice(-2).join("/");
          const deleteParams = {
            Bucket: process.env.S3_MAINBUCKET,
            Key: oldKey,
          };
          try {
            await s3Client.send(new DeleteObjectCommand(deleteParams));
          } catch (error) {
            console.error("Error deleting old logo image from S3:", error);
          }
        }
        try {
          updates.logoimage = await uploadFileToS3(
            req.files.logoimage[0],
            "image"
          );
        } catch (error) {
          console.error("Error uploading new logo image to S3:", error);
          return res.status(400).json({
            success: false,
            message: "Failed to upload new logo image. Please try again.",
          });
        }
      }
      if (req.files.logogif && req.files.logogif[0]) {
        if (adminToUpdate.logogif) {
          const oldGifUrl = adminToUpdate.logogif;
          const oldKey = oldGifUrl.split("/").slice(-2).join("/");
          const deleteParams = {
            Bucket: process.env.S3_MAINBUCKET,
            Key: oldKey,
          };
          try {
            await s3Client.send(new DeleteObjectCommand(deleteParams));
          } catch (error) {
            console.error("Error deleting old logo gif from S3:", error);
          }
        }
        try {
          updates.logogif = await uploadFileToS3(req.files.logogif[0], "gif");
        } catch (error) {
          console.error("Error uploading new logo gif to S3:", error);
          return res.status(400).json({
            success: false,
            message: "Failed to upload new logo gif. Please try again.",
          });
        }
      }
      if (req.files.video && req.files.video[0]) {
        if (adminToUpdate.video) {
          const oldVideoUrl = adminToUpdate.video;
          const oldKey = oldVideoUrl.split("/").slice(-2).join("/");
          const deleteParams = {
            Bucket: process.env.S3_MAINBUCKET,
            Key: oldKey,
          };
          try {
            await s3Client.send(new DeleteObjectCommand(deleteParams));
          } catch (error) {
            console.error("Error deleting old video from S3:", error);
          }
        }
        try {
          updates.video = await uploadFileToS3(req.files.video[0], "video");
        } catch (error) {
          console.error("Error uploading new video to S3:", error);
          return res.status(400).json({
            success: false,
            message: "Failed to upload new video. Please try again.",
          });
        }
      }
      const updatedAdminList = await adminList.findByIdAndUpdate(
        req.params.id,
        updates,
        { new: true }
      );
      res.status(200).json({
        success: true,
        message: "Admin list updated successfully",
        data: updatedAdminList,
      });
    } catch (error) {
      console.error("Error updating admin list:", error);
      res.status(500).json({
        success: false,
        message: "Error updating admin list",
        error: error.message,
      });
    }
  }
);

module.exports = router;
