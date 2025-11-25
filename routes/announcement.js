const express = require("express");
const router = express.Router();
const Announcement = require("../models/announcement.model");
const { authenticateAdminToken } = require("../auth/adminAuth");

// User Get all announcements
router.get("/api/announcements", async (req, res) => {
  try {
    const announcements = await Announcement.find().sort({ createdAt: -1 });
    res.json({ success: true, data: announcements });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Admin Get all announcements
router.get("/admin/api/announcements", async (req, res) => {
  try {
    const announcements = await Announcement.find().sort({ createdAt: -1 });
    res.json({ success: true, data: announcements });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Admin Create announcement
router.post(
  "/admin/api/announcements",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const announcement = new Announcement(req.body);
      await announcement.save();
      res.status(200).json({
        success: true,
        message: {
          en: "Announcement created successfully",
          zh: "公告创建成功",
        },
        data: announcement,
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

// Admin Update announcement
router.put(
  "/admin/api/announcements/:id",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const announcement = await Announcement.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true }
      );
      if (!announcement) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Announcement not found",
            zh: "找不到公告",
          },
        });
      }
      res.status(200).json({
        success: true,
        message: {
          en: "Announcement updated successfully",
          zh: "公告更新成功",
        },
        data: announcement,
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

// Admin Delete announcement
router.delete(
  "/admin/api/announcements/:id",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const announcement = await Announcement.findByIdAndDelete(req.params.id);
      if (!announcement) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Announcement not found",
            zh: "找不到公告",
          },
        });
      }
      res.status(200).json({
        success: true,
        message: {
          en: "Announcement deleted successfully",
          zh: "公告删除成功",
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

// Admin Toggle visibility
router.patch(
  "/admin/api/announcements/:id/visibility",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const announcement = await Announcement.findById(req.params.id);
      if (!announcement) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Announcement not found",
            zh: "找不到公告",
          },
        });
      }
      announcement.isVisible = !announcement.isVisible;
      await announcement.save();
      res.status(200).json({
        success: true,
        message: {
          en: `Announcement visibility ${
            announcement.isVisible ? "enabled" : "disabled"
          }`,
          zh: `公告已${announcement.isVisible ? "启用" : "禁用"}`,
        },
        data: announcement,
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
