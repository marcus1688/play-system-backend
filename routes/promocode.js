const express = require("express");
const router = express.Router();
const PromoCode = require("../models/promocode.model");
const PromoClaim = require("../models/promocodeclaim.model");
const { User } = require("../models/users.model");
const { authenticateToken } = require("../auth/auth");
const { authenticateAdminToken } = require("../auth/adminAuth");
const moment = require("moment");

// Generate random code
function generatePromoCode(length = 8) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// User Claim Promo Code
router.post("/api/promocodes/claim", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(200).json({
        success: false,
        message: {
          en: "User not found, please contact customer service",
          zh: "找不到用户，请联系客服",
        },
      });
    }
    const promoCode = await PromoCode.findOne({
      code: req.body.code,
      isActive: true,
    });
    if (!promoCode) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Invalid promo code",
          zh: "无效的优惠码",
        },
      });
    }
    if (promoCode.claimedCount >= promoCode.claimLimit) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Promo code has reached claim limit",
          zh: "优惠码已达到使用上限",
        },
      });
    }

    const existingClaim = await PromoClaim.findOne({
      userId: req.user.userId,
      promoCodeId: promoCode._id,
    });

    if (existingClaim) {
      return res.status(200).json({
        success: false,
        message: {
          en: "You have already claimed this code",
          zh: "您已经使用过此优惠码",
        },
      });
    }

    // Create claim record
    const claim = new PromoClaim({
      userId: req.user.userId,
      username: user.username,
      promoCodeId: promoCode._id,
      code: promoCode.code,
      amount: promoCode.amount,
    });
    await claim.save();

    // Update promo code claimed count
    promoCode.claimedCount += 1;
    if (promoCode.claimedCount >= promoCode.claimLimit) {
      promoCode.isActive = false;
    }
    await promoCode.save();

    // Update user wallet
    await User.findByIdAndUpdate(req.user.userId, {
      $inc: { wallet: promoCode.amount },
    });

    res.status(200).json({
      success: true,
      data: { amount: promoCode.amount },
      message: {
        en: `Successfully claimed$${promoCode.amount} credits!`,
        zh: `成功领取$${promoCode.amount}！`,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: {
        en: "Failed to claim promo code",
        zh: "领取优惠码失败",
      },
    });
  }
});

// User Promo Code Claim History
router.get("/api/user/promoclaims", authenticateToken, async (req, res) => {
  try {
    const claims = await PromoClaim.find({ userId: req.user.userId }).sort({
      createdAt: -1,
    });
    res.json({ success: true, data: claims });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Admin Create Promo Code
router.post(
  "/admin/api/promocodes",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const code = generatePromoCode();
      const promoCode = new PromoCode({
        code,
        amount: req.body.amount,
        claimLimit: req.body.claimLimit,
      });
      await promoCode.save();
      res.status(200).json({
        success: true,
        message: {
          en: "Promo code generated successfully",
          zh: "促销码生成成功",
        },
        data: promoCode,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: {
          en: "Error generating promo code",
          zh: "生成促销码时出错",
        },
      });
    }
  }
);

// Admin Get All Promo Code
router.get(
  "/admin/api/promocodesadmin",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const promoCodes = await PromoCode.find().sort({ createdAt: -1 });
      res.json({ success: true, data: promoCodes });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// Admin Get Claim Promo Code Logs
router.get(
  "/admin/api/promoclaimsadmin",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const dateFilter = {};
      if (startDate && endDate) {
        dateFilter.createdAt = {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        };
      }
      const claims = await PromoClaim.find({
        ...dateFilter,
      }).sort({ createdAt: -1 });
      res.json({ success: true, data: claims });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// Admin Update Promo Code Amount & Limit
router.put(
  "/admin/api/promocodes/:id",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { amount, claimLimit } = req.body;
      const promoCode = await PromoCode.findByIdAndUpdate(
        req.params.id,
        { amount, claimLimit },
        { new: true }
      );
      if (!promoCode) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Promo code not found",
            zh: "找不到促销码",
          },
        });
      }
      res.status(200).json({
        success: true,
        message: {
          en: "Promo code updated successfully",
          zh: "促销码更新成功",
        },
        data: promoCode,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: {
          en: "Error updating promo code",
          zh: "更新促销码时出错",
        },
      });
    }
  }
);

// Admin Update Promo Code Status
router.patch(
  "/admin/api/promocodes/:id/toggle",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const promoCode = await PromoCode.findById(req.params.id);
      if (!promoCode) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Promo code not found",
            zh: "找不到促销代码",
          },
        });
      }
      promoCode.isActive = !promoCode.isActive;
      await promoCode.save();
      res.status(200).json({
        success: true,
        message: {
          en: `Promo code is now ${promoCode.isActive ? "active" : "inactive"}`,
          zh: `促销代码${promoCode.isActive ? "已激活" : "已停用"}`,
        },
        data: promoCode,
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
