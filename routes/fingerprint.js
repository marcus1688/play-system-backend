const express = require("express");
const router = express.Router();
const Fingerprint = require("../models/fingerprint.model");
const { authenticateAdminToken } = require("../auth/adminAuth");
const { setConnForRequest } = require("../lib/dbContext");
const { User } = require("../models/users.model");

// Run SetConnForRequest Before Every Route
router.use(async (req, res, next) => {
  try {
    setConnForRequest(req.db);
    const testCount = await Fingerprint.countDocuments();
    const testUser = await User.countDocuments();
    req.testCounts = {
      fingerprints: testCount,
      users: testUser,
    };
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

// Admin Get All Fingerprints
router.get(
  "/admin/api/fingerprints",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const search = req.query.search || "";
      const sortBy = req.query.sortBy || "createdAt";
      const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;
      const skip = (page - 1) * limit;
      let query = {};
      if (search) {
        query = {
          $or: [
            { username: new RegExp(search, "i") },
            { visitorId: new RegExp(search, "i") },
            { ip: new RegExp(search, "i") },
            { browserName: new RegExp(search, "i") },
            { os: new RegExp(search, "i") },
            { device: new RegExp(search, "i") },
          ],
        };
      }
      const [fingerprints, totalFingerprints] = await Promise.all([
        Fingerprint.find(query)
          .populate("userId", "username fullname email status")
          .sort({ [sortBy]: sortOrder })
          .skip(skip)
          .limit(limit)
          .lean(),
        Fingerprint.countDocuments(query),
      ]);
      const totalPages = Math.ceil(totalFingerprints / limit);
      res.status(200).json({
        success: true,
        message: "Fingerprints retrieved successfully",
        data: {
          fingerprints,
          pagination: {
            page,
            totalPages,
            totalFingerprints,
            limit,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
          },
        },
      });
    } catch (error) {
      console.error("Error fetching fingerprints:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error fetching fingerprints",
          zh: "获取指纹数据时出错",
        },
        error: error.message,
      });
    }
  }
);

// Admin Get Single Fingerprint
router.get(
  "/admin/api/fingerprints/:id",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const fingerprint = await Fingerprint.findById(req.params.id)
        .populate("userId", "username fullname email phonenumber status")
        .lean();
      if (!fingerprint) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Fingerprint not found",
            zh: "未找到指纹记录",
          },
        });
      }
      res.status(200).json({
        success: true,
        message: "Fingerprint retrieved successfully",
        data: fingerprint,
      });
    } catch (error) {
      console.error("Error fetching fingerprint:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error fetching fingerprint",
          zh: "获取指纹记录时出错",
        },
        error: error.message,
      });
    }
  }
);

module.exports = router;
