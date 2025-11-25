const express = require("express");
const router = express.Router();
const multer = require("multer");
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const UserBankList = require("../models/userbanklist.model");
const { authenticateAdminToken } = require("../auth/adminAuth");
const { User } = require("../models/users.model");

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const upload = multer({ storage: multer.memoryStorage() });

//User Get Active Bank List
router.get("/api/client/activebanknames", async (req, res) => {
  try {
    const activeBanks = await UserBankList.find({ isActive: true }, "bankname");
    res.json({
      success: true,
      data: activeBanks,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Admin Create User Bank List
router.post(
  "/admin/api/createuserbanklist",
  authenticateAdminToken,
  upload.single("logo"),
  async (req, res) => {
    try {
      const { bankname, bankcode, remark } = req.body;
      if (req.file) {
        const folderPath = "userbanklists/";
        const fileKey = `${folderPath}${Date.now()}_${req.file.originalname}`;
        const putObjectCommand = new PutObjectCommand({
          Bucket: process.env.S3_MAINBUCKET,
          Key: fileKey,
          Body: req.file.buffer,
          ContentType: req.file.mimetype,
        });
        await s3Client.send(putObjectCommand);
        logo = `https://${process.env.S3_MAINBUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`;
      }
      const newBankList = await UserBankList.create({
        bankname,
        bankcode,
        remark,
        logo,
      });
      res.status(200).json({
        success: true,
        message: {
          en: "User Bank List created successfully",
          zh: "用户银行列表创建成功",
        },
        data: newBankList,
      });
    } catch (error) {
      console.error("Error occurred while creating bank list:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error creating bank list",
          zh: "创建银行列表时出错",
        },
      });
    }
  }
);

// Admin Get User Bank List
router.get(
  "/admin/api/userbanklist",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const bankLists = await UserBankList.find({});
      res.status(200).json({
        success: true,
        message: "User Bank lists retrieved successfully",
        data: bankLists,
      });
    } catch (error) {
      console.error("Error occurred while retrieving bank lists:", error);
      res
        .status(200)
        .json({ message: "Internal server error", error: error.toString() });
    }
  }
);

// Admin Update User Bank List Status
router.patch(
  "/admin/api/updateactiveuserbank",
  authenticateAdminToken,
  async (req, res) => {
    const { id, isActive } = req.body;
    try {
      const updatedBank = await UserBankList.findByIdAndUpdate(
        id,
        { isActive },
        { new: true }
      );
      if (!updatedBank) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User Bank not found",
            zh: "未找到用户银行",
          },
        });
      }
      res.status(200).json({
        success: true,
        message: {
          en: "Bank status updated successfully",
          zh: "银行状态更新成功",
        },
        data: updatedBank,
      });
    } catch (error) {
      console.error("Error updating bank's active status:", error);
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

// Admin Delete User Bank List
router.delete(
  "/admin/api/deleteuserbanklist/:id",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const bank = await UserBankList.findById(req.params.id);
      if (!bank) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Bank list not found",
            zh: "未找到银行列表",
          },
        });
      }
      if (bank.logo) {
        const url = new URL(bank.logo);
        const key = decodeURIComponent(url.pathname.substring(1));
        const deleteObjectCommand = new DeleteObjectCommand({
          Bucket: process.env.S3_MAINBUCKET,
          Key: key,
        });
        await s3Client.send(deleteObjectCommand);
      }
      const deletedBank = await UserBankList.findOneAndDelete({
        _id: req.params.id,
      });
      if (!deletedBank) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Bank list not found",
            zh: "未找到银行列表",
          },
        });
      }
      await User.updateMany(
        { "bankAccounts.bankname": deletedBank.bankname },
        { $pull: { bankAccounts: { bankname: deletedBank.bankname } } }
      );
      res.status(200).json({
        success: true,
        message: {
          en: "Bank list deleted successfully",
          zh: "银行列表删除成功",
        },
        data: deletedBank,
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

// Admin Update User Bank
router.patch(
  "/admin/api/updateuserbank/:id",
  authenticateAdminToken,
  upload.single("logo"),
  async (req, res) => {
    const { id } = req.params;
    try {
      const existingBank = await UserBankList.findById(id);
      if (!existingBank) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Bank list not found",
            zh: "找不到银行列表",
          },
        });
      }
      let logo = existingBank.logo;
      if (req.file && logo) {
        const url = new URL(logo);
        const key = url.pathname.substring(1);
        const deleteObjectCommand = new DeleteObjectCommand({
          Bucket: process.env.S3_MAINBUCKET,
          Key: key,
        });
        await s3Client.send(deleteObjectCommand);
      }

      if (req.file) {
        const folderPath = "userbanklists/";
        const fileKey = `${folderPath}${Date.now()}_${req.file.originalname}`;
        const putObjectCommand = new PutObjectCommand({
          Bucket: process.env.S3_MAINBUCKET,
          Key: fileKey,
          Body: req.file.buffer,
          ContentType: req.file.mimetype,
        });
        try {
          await s3Client.send(putObjectCommand);
          logo = `https://${process.env.S3_MAINBUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`;
        } catch (uploadError) {
          return res.status(200).json({
            success: false,
            message: {
              en: "Error uploading image to S3",
              zh: "上传图片到S3时出错",
            },
          });
        }
      }
      const updateData = {
        bankname: req.body.bankname,
        bankcode: req.body.bankcode,
        remark: req.body.remark,
        logo,
      };
      const updatedBank = await UserBankList.findByIdAndUpdate(id, updateData, {
        new: true,
      });
      res.status(200).json({
        success: true,
        message: {
          en: "User Bank list updated successfully",
          zh: "用户银行列表更新成功",
        },
        data: updatedBank,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: {
          en: "Error updating bank list",
          zh: "更新银行列表时出错",
        },
      });
    }
  }
);

module.exports = router;
