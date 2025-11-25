const express = require("express");
const router = express.Router();
const LuckySpinSetting = require("../models/luckyspinsetting.model");
const { authenticateAdminToken } = require("../auth/adminAuth");

// Admin Create/Update Lucky Spin Deposit Amount
router.post(
  "/admin/api/updateLuckySpinDepositAmount",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { depositAmount } = req.body;
      if (depositAmount === undefined) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Missing deposit amount",
            zh: "缺少存款金额",
          },
        });
      }
      await LuckySpinSetting.deleteMany({});
      const newSetting = new LuckySpinSetting({ depositAmount });
      const savedSetting = await newSetting.save();
      res.status(200).json({
        success: true,
        message: {
          en: "Deposit amount updated successfully",
          zh: "存款金额更新成功",
        },
        data: savedSetting,
      });
    } catch (error) {
      console.error("Error updating deposit amount:", error);
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

// Admin Get Current Deposit Amount Setting
router.get("/admin/api/getLuckySpinDepositAmount", async (req, res) => {
  try {
    const setting = await LuckySpinSetting.findOne();
    res.json({
      success: true,
      depositAmount: setting ? setting.depositAmount : 0,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

module.exports = router;
