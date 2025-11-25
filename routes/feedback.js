const express = require("express");
const router = express.Router();
const Feedback = require("../models/feedback.model");
const { User } = require("../models/users.model");
const { authenticateToken } = require("../auth/auth");
const { authenticateAdminToken } = require("../auth/adminAuth");
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });
const { setConnForRequest } = require("../lib/dbContext");
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});
async function uploadFileToS3(file) {
  const fileKey = `feedbacks/${Date.now()}_${file.originalname}`;
  const uploadParams = {
    Bucket: process.env.S3_MAINBUCKET,
    Key: fileKey,
    Body: file.buffer,
    ContentType: file.mimetype,
  };
  await s3Client.send(new PutObjectCommand(uploadParams));
  return `https://${process.env.S3_MAINBUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`;
}

router.use(async (req, res, next) => {
  try {
    setConnForRequest(req.db);
    const companyId = req.headers["x-company-id"];
    req.companyId = companyId;
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

// Get user's feedbacks
router.get("/api/user/feedbacks", authenticateToken, async (req, res) => {
  try {
    const feedbacks = await Feedback.find({ userId: req.user.userId }).sort({
      createdAt: -1,
    });
    res.json({ success: true, data: feedbacks });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// User Create Feedback
router.post(
  "/api/feedbacks",
  authenticateToken,
  upload.array("images", 5),
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
            zh_hk: "搵唔到用戶，請聯繫客服",
            ms: "Pengguna tidak dijumpai, sila hubungi khidmat pelanggan",
            id: "Pengguna tidak ditemukan, silakan hubungi layanan pelanggan",
          },
        });
      }
      if (!req.body.problemType || !req.body.description) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Problem type and description are required",
            zh: "问题类型和描述是必填项",
            zh_hk: "問題類型同描述係必填項",
            ms: "Jenis masalah dan keterangan diperlukan",
            id: "Jenis masalah dan deskripsi wajib diisi",
          },
        });
      }
      const imageUrls = [];
      if (req.files) {
        for (const file of req.files) {
          const url = await uploadFileToS3(file);
          imageUrls.push(url);
        }
      }
      const feedback = new Feedback({
        userId: userId,
        username: user.username,
        problemType: req.body.problemType,
        description: req.body.description,
        images: imageUrls,
      });
      await feedback.save();
      res.status(200).json({
        success: true,
        message: {
          en: "Feedback submitted successfully",
          zh: "反馈提交成功",
          zh_hk: "意見反饋提交成功",
          ms: "Maklum balas berjaya dihantar",
          id: "Umpan balik berhasil dikirim",
        },
        data: feedback,
      });
    } catch (error) {
      console.error("Feedback submission error:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Failed to submit feedback",
          zh: "反馈提交失败",
          zh_hk: "意見反饋提交失敗",
          ms: "Gagal menghantar maklum balas",
          id: "Gagal mengirim umpan balik",
        },
      });
    }
  }
);

// Admin Get Pending Feedbacks Count
router.get(
  "/admin/api/pending-feedbacks-count",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const pendingFeedbacks = await Feedback.find({ status: false });
      const truePendingFeedbacks = pendingFeedbacks.filter((feedback) => {
        if (!feedback.conversation || feedback.conversation.length === 0) {
          return true;
        }
        const lastMessage =
          feedback.conversation[feedback.conversation.length - 1];
        console.log(lastMessage);
        return lastMessage.sender !== "agent";
      });
      res.json({ success: true, count: truePendingFeedbacks.length });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// Admin Get All Feedbacks
router.get(
  "/admin/api/feedbacksadmin",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const feedbacks = await Feedback.find().sort({ createdAt: -1 });
      res.json({ success: true, data: feedbacks });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// Admin Update Feedback Status
router.patch(
  "/admin/api/feedbacks/:id/status",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const feedback = await Feedback.findByIdAndUpdate(
        req.params.id,
        { status: req.body.status },
        { new: true }
      );
      if (!feedback) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Feedback not found",
            zh: "未找到反馈",
          },
        });
      }
      res.status(200).json({
        success: true,
        message: {
          en: "Feedback status updated successfully",
          zh: "反馈状态更新成功",
        },
        data: feedback,
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

// Admin Delete Feedback
router.delete(
  "/admin/api/feedbacks/:id",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const feedback = await Feedback.findById(req.params.id);
      if (!feedback) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Feedback not found",
            zh: "未找到反馈",
          },
        });
      }
      if (feedback.images?.length) {
        for (const imageUrl of feedback.images) {
          const key = `feedbacks/${imageUrl.split("/").pop()}`;
          await s3Client.send(
            new DeleteObjectCommand({
              Bucket: process.env.S3_MAINBUCKET,
              Key: key,
            })
          );
        }
      }
      await Feedback.findByIdAndDelete(req.params.id);
      res.status(200).json({
        success: true,
        message: {
          en: "Feedback deleted successfully",
          zh: "反馈删除成功",
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

module.exports = router;
