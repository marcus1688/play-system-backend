const express = require("express");
const router = express.Router();
const Memo = require("../models/memo.model");
const { authenticateAdminToken } = require("../auth/adminAuth");
const { adminUser } = require("../models/adminuser.model");
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

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 10 },
});

async function uploadFileToS3(file) {
  const folderPath = "memos/";
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

// Create Memo
router.post(
  "/admin/api/memo",
  authenticateAdminToken,
  upload.array("photos", 10),
  async (req, res) => {
    try {
      const userId = req.user.userId;
      const adminuser = await adminUser.findById(userId);
      if (!adminuser) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Admin user not found, please contact customer service",
            zh: "未找到管理员用户，请联系客户服务",
          },
        });
      }
      const { memoText } = req.body;
      if (!memoText || !memoText.trim()) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Memo text cannot be empty",
            zh: "备忘录内容不能为空",
          },
        });
      }

      const photoUrls = [];
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          const photoUrl = await uploadFileToS3(file);
          photoUrls.push(photoUrl);
        }
      }

      const newMemo = new Memo({
        memoText,
        photos: photoUrls,
        lastUpdatedBy: adminuser.username,
        createdBy: adminuser.username,
      });
      await newMemo.save();
      res.status(200).json({
        success: true,
        message: {
          en: "Memo created successfully",
          zh: "备忘录创建成功",
        },
        memo: newMemo,
      });
    } catch (error) {
      console.error("Error creating memo:", error);
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

// Get All Memos
router.get("/admin/api/memos", authenticateAdminToken, async (req, res) => {
  try {
    const memos = await Memo.find().sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      memos,
    });
  } catch (error) {
    console.error("Error fetching memos:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Update Memo
router.put(
  "/admin/api/memo/:id",
  authenticateAdminToken,
  upload.array("photos", 10),
  async (req, res) => {
    try {
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

      const { memoText, photos: updatedPhotos } = req.body;
      const { id } = req.params;

      const existingMemo = await Memo.findById(id);
      if (!existingMemo) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Memo not found",
            zh: "找不到备忘录",
          },
        });
      }

      if (!memoText || !memoText.trim()) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Memo text cannot be empty",
            zh: "备忘录内容不能为空",
          },
        });
      }

      let photoUrls = [];

      if (updatedPhotos) {
        try {
          const newPhotosList = JSON.parse(updatedPhotos);
          const existingPhotos = existingMemo.photos || [];
          const photosToDelete = existingPhotos.filter(
            (photo) => !newPhotosList.includes(photo)
          );
          for (const photoUrl of photosToDelete) {
            const oldKey = photoUrl.split("/").slice(-2).join("/");
            try {
              await s3Client.send(
                new DeleteObjectCommand({
                  Bucket: process.env.S3_MAINBUCKET,
                  Key: oldKey,
                })
              );
            } catch (error) {
              console.error("Error deleting old photo:", error);
            }
          }

          photoUrls = newPhotosList;
        } catch (error) {
          console.error("Error parsing updated photos:", error);
          return res.status(200).json({
            success: false,
            message: {
              en: "Invalid photos data",
              zh: "无效的照片数据",
            },
          });
        }
      } else {
        photoUrls = existingMemo.photos || [];
      }
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          const photoUrl = await uploadFileToS3(file);
          photoUrls.push(photoUrl);
        }
      }
      if (photoUrls.length > 10) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Maximum 10 photos allowed",
            zh: "最多只能上传 10 张照片",
          },
        });
      }

      const updatedMemo = await Memo.findByIdAndUpdate(
        id,
        {
          memoText,
          photos: photoUrls,
          lastUpdatedBy: adminuser.username,
        },
        { new: true }
      );

      res.status(200).json({
        success: true,
        message: {
          en: "Memo updated successfully",
          zh: "备忘录更新成功",
        },
        memo: updatedMemo,
      });
    } catch (error) {
      console.error("Error updating memo:", error);
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

// Delete Memo
router.delete(
  "/admin/api/memo/:id",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { id } = req.params;
      const memo = await Memo.findById(id);

      if (!memo) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Memo not found",
            zh: "找不到备忘录",
          },
        });
      }

      if (memo.photos && memo.photos.length > 0) {
        for (const photoUrl of memo.photos) {
          const photoKey = photoUrl.split("/").slice(-2).join("/");
          try {
            await s3Client.send(
              new DeleteObjectCommand({
                Bucket: process.env.S3_MAINBUCKET,
                Key: photoKey,
              })
            );
          } catch (error) {
            console.error("Error deleting photo:", error);
          }
        }
      }

      await Memo.findByIdAndDelete(id);
      res.status(200).json({
        success: true,
        message: {
          en: "Memo deleted successfully",
          zh: "备忘录删除成功",
        },
      });
    } catch (error) {
      console.error("Error deleting memo:", error);
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

module.exports = router;
