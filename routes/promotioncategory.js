const express = require("express");
const router = express.Router();
const PromotionCategory = require("../models/promotioncategory.model");
const { authenticateAdminToken } = require("../auth/adminAuth");

// Admin Create New Promotion Categories
router.post(
  "/admin/api/promotioncategories",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { name } = req.body;
      const category = new PromotionCategory({ name });
      await category.save();
      res.status(200).json({
        success: true,
        message: {
          en: "Promotion Category created successfully",
          zh: "优惠类别创建成功",
        },
        data: category,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: {
          en: "Error creating promotion category",
          zh: "创建优惠类别时出错",
        },
      });
    }
  }
);

// Admin Get All Promotion Categories
router.get(
  "/admin/api/promotioncategories",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const categories = await PromotionCategory.find().sort({ createdAt: -1 });
      res.json({ success: true, data: categories });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// Admin Update Promotion Categories
router.put(
  "/admin/api/promotioncategories/:id",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { name } = req.body;
      const category = await PromotionCategory.findByIdAndUpdate(
        req.params.id,
        { name },
        { new: true }
      );
      if (!category) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Promotion Category not found",
            zh: "未找到优惠类别",
          },
        });
      }
      res.status(200).json({
        success: true,
        message: {
          en: "Promotion Category updated successfully",
          zh: "优惠类别更新成功",
        },
        data: category,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: {
          en: "Error updating promotion category",
          zh: "更新优惠类别时出错",
        },
      });
    }
  }
);

// Admin Delete Promotion Categories
router.delete(
  "/admin/api/promotioncategories/:id",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const promotionCategoriesExists = await PromotionCategory.exists({
        categoryId: req.params.id,
      });
      if (promotionCategoriesExists) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Cannot delete category that has kiosks",
            zh: "无法删除已有优惠的类别",
          },
        });
      }
      const category = await PromotionCategory.findByIdAndDelete(req.params.id);
      if (!category) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Category not found",
            zh: "找不到优惠类别",
          },
        });
      }
      res.status(200).json({
        success: true,
        message: {
          en: "Category deleted successfully",
          zh: "优惠类别删除成功",
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
