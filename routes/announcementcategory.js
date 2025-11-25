const express = require("express");
const router = express.Router();
const Category = require("../models/announcementcategory.model");
const { authenticateAdminToken } = require("../auth/adminAuth");

// User Get All Announcement Categories
router.get("/api/categories", async (req, res) => {
  try {
    const categories = await Category.find();
    res.json({ success: true, data: categories });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Admin Get All Announcement Categories
router.get("/admin/api/categories", async (req, res) => {
  try {
    const categories = await Category.find();
    res.json({ success: true, data: categories });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Admin Create New Announcement Categories
router.post(
  "/admin/api/categories",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const category = new Category({ name: req.body.name });
      await category.save();
      res.status(200).json({
        success: true,
        message: {
          en: "Category created successfully",
          zh: "分类创建成功",
        },
        data: category,
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

// Admin Delete Categories
router.delete(
  "/admin/api/categories/:id",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const category = await Category.findById(req.params.id);
      if (!category) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Category not found",
            zh: "找不到公告分类",
          },
        });
      }
      await Category.findByIdAndDelete(req.params.id);
      res.status(200).json({
        success: true,
        message: {
          en: "Category deleted successfully",
          zh: "公告分类删除成功",
        },
      });
    } catch (error) {
      console.log("Error deleting category:", error);
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
