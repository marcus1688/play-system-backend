const express = require("express");
const router = express.Router();
const Information = require("../models/information.model");
const { authenticateAdminToken } = require("../auth/adminAuth");

// User Get Information
router.get("/api/information", async (req, res) => {
  try {
    const info = await Information.findOne();
    if (!info) {
      return res.status(200).json({
        success: true,
        data: {
          details: {},
        },
      });
    }
    return res.status(200).json({
      success: true,
      data: {
        details: info,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });
  }
});

// Admin Get ALl Information
router.get(
  "/admin/api/information",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const info = await Information.findOne();
      if (!info) {
        return res.status(200).json({
          success: true,
          data: {
            details: {},
          },
        });
      }
      return res.status(200).json({
        success: true,
        data: {
          details: info,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Internal server error.",
        error: error.message,
      });
    }
  }
);

// Admin Create New Information
router.post(
  "/admin/api/information",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { details } = req.body;
      if (!details || typeof details !== "object") {
        return res.status(200).json({
          success: false,
          message: {
            en: "Invalid data format. Expected details object.",
            zh: "数据格式无效。应为 details 对象。",
          },
        });
      }
      for (const key in details) {
        if (!Array.isArray(details[key])) {
          return res.status(200).json({
            success: false,
            message: {
              en: `Invalid format for ${key}. Expected an array.`,
              zh: `${key} 的格式无效，应为数组。`,
            },
          });
        }
        const isValidSection = details[key].every(
          (section) =>
            section &&
            typeof section === "object" &&
            "title" in section &&
            "description" in section
        );
        if (!isValidSection) {
          return res.status(200).json({
            success: false,
            message: {
              en: `Invalid section format in ${key}. Each section must have title and description.`,
              zh: `${key} 的部分格式无效。每个部分必须包含标题和描述。`,
            },
          });
        }
      }
      const existingInfo = await Information.findOne();
      if (existingInfo) {
        for (const key in details) {
          existingInfo[key] = details[key];
        }
        const updatedInfo = await existingInfo.save();
        return res.status(200).json({
          success: true,
          message: {
            en: "Information updated successfully.",
            zh: "信息更新成功。",
          },
          data: updatedInfo,
        });
      } else {
        const newInfo = new Information({ ...details });
        const savedInfo = await newInfo.save();
        return res.status(200).json({
          success: true,
          message: {
            en: "Information created successfully.",
            zh: "信息创建成功。",
          },
          data: savedInfo,
        });
      }
    } catch (error) {
      if (error.name === "ValidationError") {
        return res.status(200).json({
          success: false,
          message: {
            en: "Validation error.",
            zh: "验证错误。",
          },
          errors: error.errors,
        });
      }
      res.status(500).json({
        success: false,
        message: {
          en: "Internal server error.",
          zh: "服务器内部错误。",
        },
      });
    }
  }
);

module.exports = router;
