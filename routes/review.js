const express = require("express");
const router = express.Router();
const Review = require("../models/review.model");
const { authenticateAdminToken } = require("../auth/adminAuth");
const { authenticateToken } = require("../auth/auth");
const { User } = require("../models/users.model");

// Get Reviews for User
router.get("/api/reviews", async (req, res) => {
  try {
    const reviews = await Review.find({ isVisible: true }).sort({
      createdAt: -1,
    });

    res.status(200).json({
      success: true,
      data: reviews,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching reviews",
      error: error.message,
    });
  }
});

// Admin Add New Review
router.post(
  "/admin/api/reviews/batch",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const reviews = req.body.reviews;

      if (!Array.isArray(reviews)) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Reviews must be an array",
            zh: "评论必须是一个数组",
          },
        });
      }

      const savedReviews = await Review.insertMany(reviews);

      res.status(200).json({
        success: true,
        message: {
          en: "Reviews created successfully",
          zh: "评论创建成功",
        },
        data: savedReviews,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: {
          en: "Error creating reviews",
          zh: "创建评论时出错",
        },
      });
    }
  }
);

// Admnin Get All Review
router.get(
  "/admin/api/allreviews",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const reviews = await Review.find().sort({ createdAt: -1 });
      const stats = {
        total: reviews.length,
        visible: reviews.filter((review) => review.isVisible).length,
        hidden: reviews.filter((review) => !review.isVisible).length,
      };
      res.status(200).json({
        success: true,
        data: reviews,
        stats: stats,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error fetching all reviews",
        error: error.message,
      });
    }
  }
);

// Admin Update Data
router.put(
  "/admin/api/reviews/:id",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const reviewId = req.params.id;
      const updateData = req.body;

      const validFields = [
        "titleEN",
        "titleCN",
        "titleMS",
        "descriptionEN",
        "descriptionCN",
        "descriptionMS",
        "rating",
        "author",
        "isVisible",
      ];

      const validUpdates = {};
      Object.keys(updateData).forEach((key) => {
        if (validFields.includes(key)) {
          validUpdates[key] = updateData[key];
        }
      });

      if (
        "rating" in validUpdates &&
        (validUpdates.rating < 1 || validUpdates.rating > 5)
      ) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Rating must be between 1 and 5",
            zh: "评分必须在1到5之间",
          },
        });
      }

      const updatedReview = await Review.findByIdAndUpdate(
        reviewId,
        validUpdates,
        {
          new: true,
          runValidators: true,
        }
      );

      if (!updatedReview) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Review not found",
            zh: "找不到评论",
          },
        });
      }

      res.status(200).json({
        success: true,
        message: {
          en: "Review updated successfully",
          zh: "评论更新成功",
        },
        data: updatedReview,
      });
    } catch (error) {
      console.error("Error updating review:", error);

      if (error.name === "ValidationError") {
        return res.status(500).json({
          success: false,
          message: {
            en: "Validation error",
            zh: "验证错误",
          },
        });
      }

      res.status(500).json({
        success: false,
        message: {
          en: "Error updating review",
          zh: "更新评论时出错",
        },
      });
    }
  }
);

// Admin Delete Data
router.delete(
  "/admin/api/reviews/:id",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const reviewId = req.params.id;

      const deletedReview = await Review.findByIdAndDelete(reviewId);

      if (!deletedReview) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Review not found",
            zh: "找不到评论",
          },
        });
      }

      res.status(200).json({
        success: true,
        message: {
          en: "Review deleted successfully",
          zh: "评论删除成功",
        },
        data: deletedReview,
      });
    } catch (error) {
      console.error("Error deleting review:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error deleting review",
          zh: "删除评论时出错",
        },
      });
    }
  }
);

module.exports = router;
