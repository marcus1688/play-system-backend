const express = require("express");
const router = express.Router();
const KioskCategory = require("../models/kioskcategory.model");
const Kiosk = require("../models/kiosk.model");
const RebateSchedule = require("../models/rebateSchedule.model");
const { AgentCommission } = require("../models/agent.model");
const { authenticateAdminToken } = require("../auth/adminAuth");
const { setConnForRequest } = require("../lib/dbContext");

router.use(async (req, res, next) => {
  try {
    setConnForRequest(req.db);
    const companyId = req.headers["x-company-id"];
    req.companyId = companyId;
    await Promise.all([
      KioskCategory.findOne().limit(1),
      Kiosk.findOne().limit(1),
      RebateSchedule.findOne().limit(1),
      AgentCommission.findOne().limit(1),
    ]).catch(() => {});
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

// Admin Create New Kiosk Categories
router.post(
  "/admin/api/kioskcategories",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { name } = req.body;
      const existingCategory = await KioskCategory.findOne({ name });
      if (existingCategory) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Category with this name already exists",
            zh: "该名称的分类已存在",
          },
        });
      }
      const category = new KioskCategory({ name });
      await category.save();
      res.status(200).json({
        success: true,
        message: {
          en: "Kiosk Category created successfully",
          zh: "游戏类别创建成功",
        },
        data: category,
      });
    } catch (error) {
      console.error("Error creating kiosk category:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error creating kiosk category",
          zh: "创建游戏类别时出错",
        },
      });
    }
  }
);

// Admin Get All Kiosk Categories
router.get(
  "/admin/api/kioskcategories",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const categories = await KioskCategory.find().sort({ createdAt: -1 });
      res.json({ success: true, data: categories });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// Admin Update Kiosk Categories
router.put(
  "/admin/api/kioskcategories/:id",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { name } = req.body;
      const existingCategory = await KioskCategory.findOne({
        name,
        _id: { $ne: req.params.id },
      });
      if (existingCategory) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Category with this name already exists",
            zh: "该名称的分类已存在",
          },
        });
      }
      const oldCategory = await KioskCategory.findById(req.params.id);
      if (!oldCategory) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Kiosk Category not found",
            zh: "找不到游戏类别",
          },
        });
      }
      const oldName = oldCategory.name;
      const category = await KioskCategory.findByIdAndUpdate(
        req.params.id,
        { name },
        { new: true }
      );
      if (oldName !== name) {
        const schedule = await RebateSchedule.findOne();
        if (schedule && schedule.categoryPercentages) {
          if (schedule.categoryPercentages.get(oldName)) {
            const oldValue = schedule.categoryPercentages.get(oldName);
            schedule.categoryPercentages.delete(oldName);
            schedule.categoryPercentages.set(name, oldValue);
            await schedule.save();
          }
        }
        const agentCommission = await AgentCommission.findOne();
        if (agentCommission && agentCommission.commissionPercentages) {
          for (const level in agentCommission.commissionPercentages) {
            const currentLevel = agentCommission.commissionPercentages[level];
            if (currentLevel[oldName] !== undefined) {
              currentLevel[name] = currentLevel[oldName];
              delete currentLevel[oldName];
            }
          }
          agentCommission.markModified("commissionPercentages");
          await agentCommission.save();
        }
      }
      res.status(200).json({
        success: true,
        message: {
          en: "Kiosk Category updated successfully",
          zh: "游戏类别更新成功",
        },
        data: category,
      });
    } catch (error) {
      console.error("Error updating kiosk category:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error updating kiosk category",
          zh: "更新游戏类别时出错",
        },
      });
    }
  }
);

// Admin Delete Kiosk Categories
router.delete(
  "/admin/api/kioskcategories/:id",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const kioskExists = await Kiosk.exists({
        categoryId: req.params.id,
      });
      if (kioskExists) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Cannot delete category that has kiosks",
            zh: "无法删除含有游戏终端的分类",
          },
        });
      }
      const categoryToDelete = await KioskCategory.findById(req.params.id);
      if (!categoryToDelete) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Category not found",
            zh: "找不到游戏类别",
          },
        });
      }
      const categoryName = categoryToDelete.name;
      await KioskCategory.findByIdAndDelete(req.params.id);
      const schedule = await RebateSchedule.findOne();
      if (schedule && schedule.categoryPercentages) {
        if (schedule.categoryPercentages.get(categoryName)) {
          schedule.categoryPercentages.delete(categoryName);
          await schedule.save();
        }
      }
      const agentCommission = await AgentCommission.findOne();
      if (agentCommission && agentCommission.commissionPercentages) {
        for (const level in agentCommission.commissionPercentages) {
          const currentLevel = agentCommission.commissionPercentages[level];
          for (const key in currentLevel) {
            if (key === categoryName) {
              delete agentCommission.commissionPercentages[level][key];
            }
          }
        }
        agentCommission.markModified("commissionPercentages");
        await agentCommission.save();
      }
      res.status(200).json({
        success: true,
        message: {
          en: "Category deleted successfully",
          zh: "游戏类别删除成功",
        },
      });
    } catch (error) {
      console.error("Error deleting kiosk category:", error);
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
