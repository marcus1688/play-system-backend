const express = require("express");
const router = express.Router();
const UserWalletLog = require("../models/userwalletlog.model");
const { authenticateToken } = require("../auth/auth");

//用来获取用户的WalletLog资料
router.get("/api/userwalletlog", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const userwalletlog = await UserWalletLog.find(
      { userId: userId },
      "amount createdAt status promotionnameCN promotionnameEN transactiontype"
    )
      .sort({ createdAt: -1 })
      .limit(100);
    res.status(200).json({
      success: true,
      message: "User Wallet Log retrieved successfully",
      data: userwalletlog,
    });
  } catch (error) {
    console.error("Error occurred while retrieving User Wallet Log:", error);
    res
      .status(200)
      .json({ message: "Internal server error", error: error.message });
  }
});

module.exports = router;
