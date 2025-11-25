// routes/leaderboard.route.js
const express = require("express");
const router = express.Router();
const Leaderboard = require("../models/leaderboard.model");
const { authenticateAdminToken } = require("../auth/adminAuth");

// User Get Leaderboard
router.get("/api/leaderboard", async (req, res) => {
  try {
    const entries = await Leaderboard.find({ isVisible: true }).sort({
      category: 1,
      rank: 1,
    });
    const formattedData = entries.reduce((acc, entry) => {
      if (!acc[entry.category]) {
        acc[entry.category] = [];
      }
      acc[entry.category].push({
        account: entry.account,
        validBet: entry.validBet,
      });
      return acc;
    }, {});

    res.status(200).json({
      success: true,
      data: formattedData,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching leaderboard data",
      error: error.message,
    });
  }
});

// Admin Get All Leaderboard
router.get(
  "/admin/api/allleaderboard",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const entries = await Leaderboard.find().sort({ category: 1, rank: 1 });
      res.status(200).json({
        success: true,
        data: entries,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error fetching leaderboard data",
        error: error.message,
      });
    }
  }
);

// Admin Create Leaderboard
router.post(
  "/admin/api/leaderboard",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { entries } = req.body;
      if (!Array.isArray(entries)) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Entries must be an array",
            zh: "排行榜必须是数组",
          },
        });
      }
      const isValidEntry = (entry) => {
        return (
          entry.account &&
          typeof entry.validBet === "number" &&
          entry.category &&
          typeof entry.rank === "number"
        );
      };
      if (!entries.every(isValidEntry)) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Invalid entry format",
            zh: "无效的排行榜格式",
          },
        });
      }
      const savedEntries = await Leaderboard.insertMany(entries);
      res.status(200).json({
        success: true,
        message: {
          en: "Entries added successfully",
          zh: "排行榜添加成功",
        },
        data: savedEntries,
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

// Admin Update Leaderboard
router.put(
  "/admin/api/leaderboard/:id",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { id } = req.params;
      const updateData = req.body;
      const validFields = [
        "account",
        "validBet",
        "category",
        "rank",
        "isVisible",
      ];
      const validUpdates = {};
      Object.keys(updateData).forEach((key) => {
        if (validFields.includes(key)) {
          validUpdates[key] = updateData[key];
        }
      });
      const updatedEntry = await Leaderboard.findByIdAndUpdate(
        id,
        validUpdates,
        {
          new: true,
          runValidators: true,
        }
      );
      if (!updatedEntry) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Entry not found",
            zh: "未找到排行榜",
          },
        });
      }
      res.status(200).json({
        success: true,
        message: {
          en: "Entry updated successfully",
          zh: "排行榜更新成功",
        },
        data: updatedEntry,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: {
          en: "Error updating entry",
          zh: "更新排行榜时出错",
        },
      });
    }
  }
);

// Admin Delete Leaderboard
router.delete(
  "/admin/api/leaderboard/:id",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { id } = req.params;
      const deletedEntry = await Leaderboard.findByIdAndDelete(id);
      if (!deletedEntry) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Entry not found",
            zh: "未找到排行榜",
          },
        });
      }
      res.status(200).json({
        success: true,
        message: {
          en: "Entry deleted successfully",
          zh: "排行榜删除成功",
        },
        data: deletedEntry,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: {
          en: "Error deleting entry",
          zh: "删除排行榜时出错",
        },
      });
    }
  }
);

module.exports = router;
