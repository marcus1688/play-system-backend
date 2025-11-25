const express = require("express");
const router = express.Router();
const Mail = require("../models/mail.model");
const { User } = require("../models/users.model");
const { authenticateAdminToken } = require("../auth/adminAuth");
const { authenticateToken } = require("../auth/auth");
const WebSocket = require("ws");

// User Mails
router.get("/api/user/mails", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const mails = await Mail.find({ recipientId: userId }).sort({
      createdAt: -1,
    });
    res.status(200).json({
      success: true,
      data: mails,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching mails",
      error: error.message,
    });
  }
});

// Mark Mail to Read
router.patch("/api/mails/:id/read", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const mailId = req.params.id;
    const mail = await Mail.findOne({
      _id: mailId,
      recipientId: userId,
    });
    if (!mail) {
      return res.status(404).json({
        success: false,
        message: "Mail not found",
      });
    }
    mail.isRead = true;
    await mail.save();
    res.status(200).json({
      success: true,
      message: "Mail marked as read",
      data: mail,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error marking mail as read",
      error: error.message,
    });
  }
});

// Mark All Mail to Read
router.patch("/api/mails/allread", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const result = await Mail.updateMany(
      {
        recipientId: userId,
        isRead: false,
      },
      {
        $set: { isRead: true },
      }
    );

    res.status(200).json({
      success: true,
      message: {
        en: "All mails marked as read",
        zh: "所有邮件已标记为已读",
      },
      data: { modifiedCount: result.modifiedCount },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: {
        en: "Failed to mark all mails as read",
        zh: "标记所有邮件为已读失败",
      },
    });
  }
});

// Unread Mesage Count
router.get("/api/mails/unreadcount", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const count = await Mail.countDocuments({
      recipientId: userId,
      isRead: false,
    });
    res.status(200).json({
      success: true,
      data: { count },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error counting unread mails",
      error: error.message,
    });
  }
});

// Admin Get All Mails
router.get("/admin/api/mails", authenticateAdminToken, async (req, res) => {
  try {
    const mails = await Mail.find().sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      data: mails,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching mails",
      error: error.message,
    });
  }
});

// Admin Update Mails
router.put("/admin/api/mails/:id", authenticateAdminToken, async (req, res) => {
  try {
    const { titleEN, titleCN, titleMS, contentEN, contentCN, contentMS } =
      req.body;
    const mailExists = await Mail.findById(req.params.id);
    if (!mailExists) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Mail not found",
          zh: "找不到邮件",
        },
      });
    }
    const updates = {
      titleEN,
      titleCN,
      titleMS,
      contentEN,
      contentCN,
      contentMS,
    };
    const updatedMail = await Mail.findByIdAndUpdate(req.params.id, updates, {
      new: true,
    });
    res.status(200).json({
      success: true,
      message: {
        en: "Mail updated successfully",
        zh: "邮件更新成功",
      },
      data: updatedMail,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: {
        en: "Error updating mail",
        zh: "更新邮件时出错",
      },
    });
  }
});

// Admin Delete Mail
router.delete(
  "/admin/api/mails/:id",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const deletedMail = await Mail.findByIdAndDelete(req.params.id);
      if (!deletedMail) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Mail not found",
            zh: "找不到邮件",
          },
        });
      }
      res.status(200).json({
        success: true,
        message: {
          en: "Mail deleted successfully",
          zh: "邮件删除成功",
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: {
          en: "Error deleting mail",
          zh: "删除邮件时出错",
        },
      });
    }
  }
);

module.exports = router;
