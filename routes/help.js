const express = require("express");
const router = express.Router();
const Help = require("../models/help.model");
const { authenticateAdminToken } = require("../auth/adminAuth");

// User Get Helps
router.get("/api/helps", async (req, res) => {
  try {
    const helps = await Help.find({ isVisible: true }).sort({ createdAt: 1 });
    res.json({ success: true, data: helps });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Admin  Get All Helps
router.get(
  "/admin/api/helpsadminpanel",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const helps = await Help.find().sort({ createdAt: 1 });
      res.json({ success: true, data: helps });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// Admin Create New Help
router.post("/admin/api/helps", authenticateAdminToken, async (req, res) => {
  try {
    const help = new Help(req.body);
    await help.save();
    res.status(200).json({
      success: true,
      message: {
        en: "Help created successfully",
        zh: "常见问题内容创建成功",
      },
      data: help,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: {
        en: "Error creating help content",
        zh: "常见问题内容时出错",
      },
    });
  }
});

// Admin Update Help
router.put("/admin/api/helps/:id", authenticateAdminToken, async (req, res) => {
  try {
    const help = await Help.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    if (!help) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Help content not found",
          zh: "找不到常见问题内容",
        },
      });
    }
    res.status(200).json({
      success: true,
      message: {
        en: "Help content updated successfully",
        zh: "常见问题内容更新成功",
      },
      data: help,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: {
        en: "Error updating help content",
        zh: "更新常见问题内容时出错",
      },
    });
  }
});

// Admin Delete Help
router.delete(
  "/admin/api/helps/:id",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const help = await Help.findByIdAndDelete(req.params.id);
      if (!help) {
        return res.status(200).json({
          success: false,
          message: {
            en: "FAQ not found",
            zh: "找不到常见问题内容",
          },
        });
      }
      res.status(200).json({
        success: true,
        message: {
          en: "FAQ deleted successfully",
          zh: "常见问题内容已删除",
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

// Admin Update Help Visibility
router.patch(
  "/admin/api/helps/:id/visibility",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const help = await Help.findById(req.params.id);
      if (!help) {
        return res.status(200).json({
          success: false,
          message: {
            en: "FAQ not found",
            zh: "找不到常见问题",
          },
        });
      }
      help.isVisible = !help.isVisible;
      await help.save();
      res.status(200).json({
        success: true,
        message: {
          en: `FAQ visibility ${help.isVisible ? "enabled" : "disabled"}`,
          zh: `常见问题内容已${help.isVisible ? "启用" : "禁用"}`,
        },
        data: help,
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
