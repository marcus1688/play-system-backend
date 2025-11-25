const express = require("express");
const router = express.Router();
const LuckySpin = require("../models/luckyspin.model");
const { authenticateAdminToken } = require("../auth/adminAuth");
const { authenticateToken } = require("../auth/auth");
const { adminUser } = require("../models/adminuser.model");
const LuckySpinLog = require("../models/luckyspinlog.model");
const { User } = require("../models/users.model");
const { updateKioskBalance } = require("../services/kioskBalanceService");
const kioskbalance = require("../models/kioskbalance.model");
const moment = require("moment");
const UserWalletLog = require("../models/userwalletlog.model");

// Start Spin
// router.post("/api/luckySpinStartGame", authenticateToken, async (req, res) => {
//   try {
//     const userId = req.user.userId;
//     const user = await User.findById(userId);
//     if (!user) {
//       return res.status(200).json({
//         success: false,
//         message: {
//           en: "User not found, please contact customer service",
//           zh: "找不到用户，请联系客服",
//           ms: "Pengguna tidak dijumpai, sila hubungi khidmat pelanggan",
//         },
//       });
//     }
//     if (user.luckySpinCount <= 0) {
//       return res.status(200).json({
//         success: false,
//         message: {
//           en: "No spins remaining",
//           zh: "没有剩余次数",
//           ms: "Tiada putaran yang tinggal",
//         },
//       });
//     }
//     const defaultPrizes = await LuckySpin.find();
//     let allProbabilitySlots = [];
//     let selectedPrizes;
//     if (
//       user.luckySpinSetting?.settings &&
//       user.luckySpinSetting.remainingCount > 0
//     ) {
//       selectedPrizes = user.luckySpinSetting.settings;
//       selectedPrizes.forEach((prize) => {
//         for (let i = 0; i < prize.probability; i++) {
//           allProbabilitySlots.push(prize);
//         }
//       });
//       await User.findByIdAndUpdate(userId, {
//         $inc: {
//           "luckySpinSetting.remainingCount": -1,
//         },
//       });
//     } else {
//       defaultPrizes.forEach((prize) => {
//         for (let i = 0; i < prize.probability; i++) {
//           allProbabilitySlots.push(prize);
//         }
//       });
//     }
//     for (let i = allProbabilitySlots.length - 1; i > 0; i--) {
//       const j = Math.floor(Math.random() * (i + 1));
//       [allProbabilitySlots[i], allProbabilitySlots[j]] = [
//         allProbabilitySlots[j],
//         allProbabilitySlots[i],
//       ];
//     }
//     const randomIndex = Math.floor(Math.random() * allProbabilitySlots.length);
//     const selectedPrize = allProbabilitySlots[randomIndex];
//     const spinLog = new LuckySpinLog({
//       playerusername: user.username,
//       playerfullname: user.fullname,
//       winning: selectedPrize.value,
//       beforefreespin: user.luckySpinCount,
//       afterfreespin: user.luckySpinCount - 1,
//     });
//     const kioskSettings = await kioskbalance.findOne({});
//     if (kioskSettings && kioskSettings.status && selectedPrize.value > 0) {
//       const kioskResult = await updateKioskBalance(
//         "subtract",
//         selectedPrize.value,
//         {
//           username: user.username,
//           transactionType: "lucky spin",
//           remark: `Lucky Spin Prize`,
//           processBy: "system",
//         }
//       );
//       if (!kioskResult.success) {
//         return res.status(200).json({
//           success: false,
//           message: kioskResult.message || "Failed to update kiosk balance",
//         });
//       }
//     }
//     await Promise.all([
//       User.findByIdAndUpdate(userId, {
//         $inc: {
//           luckySpinCount: -1,
//           wallet: selectedPrize.value,
//         },
//       }),
//       spinLog.save(),
//     ]);
//     const walletLog = new UserWalletLog({
//       userId: userId,
//       transactiontime: new Date(),
//       transactiontype: "others",
//       amount: selectedPrize.value,
//       status: "approved",
//       promotionnameEN: "Lucky Spin",
//     });
//     await walletLog.save();
//     res.status(200).json({
//       success: true,
//       prize: selectedPrize,
//       message: {
//         en: "Spin successful",
//         zh: "转盘成功",
//         ms: "Putaran berjaya",
//       },
//     });
//   } catch (error) {
//     console.error("Lucky Spin Error:", error);
//     res.status(500).json({
//       success: false,
//       message: {
//         en: "Failed to spin the wheel",
//         zh: "转盘失败",
//         ms: "Gagal untuk memutar roda",
//       },
//     });
//   }
// });
router.post("/api/luckySpinStartGame", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(200).json({
        success: false,
        message: {
          en: "User not found, please contact customer service",
          zh: "找不到用户，请联系客服",
          ms: "Pengguna tidak dijumpai, sila hubungi khidmat pelanggan",
          zh_hk: "搵唔到用戶，請聯絡客戶服務",
        },
      });
    }
    if (user.luckySpinAmount > 0) {
      return res.status(200).json({
        success: false,
        message: {
          en: "You have already claimed spin",
          zh: "您已经领取了幸运转盘机会",
          ms: "Anda telah menuntut putaran",
          zh_hk: "您已經領取咗幸運轉盤機會",
        },
      });
    }
    const defaultPrizes = await LuckySpin.find();
    let allProbabilitySlots = [];
    defaultPrizes.forEach((prize) => {
      for (let i = 0; i < prize.probability; i++) {
        allProbabilitySlots.push(prize);
      }
    });
    for (let i = allProbabilitySlots.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allProbabilitySlots[i], allProbabilitySlots[j]] = [
        allProbabilitySlots[j],
        allProbabilitySlots[i],
      ];
    }
    const randomIndex = Math.floor(Math.random() * allProbabilitySlots.length);
    const selectedPrize = allProbabilitySlots[randomIndex];
    const spinLog = new LuckySpinLog({
      playerusername: user.username,
      playerfullname: user.fullname,
      winning: selectedPrize.value,
      beforefreespin: 1,
      afterfreespin: 0,
    });
    await Promise.all([
      User.findByIdAndUpdate(userId, {
        $set: {
          luckySpinAmount: selectedPrize.value,
        },
      }),
      spinLog.save(),
    ]);
    res.status(200).json({
      success: true,
      prize: selectedPrize,
      message: {
        en: "Spin successful",
        zh: "转盘成功",
        ms: "Putaran berjaya",
        zh_hk: "轉盤成功",
      },
    });
  } catch (error) {
    console.error("Lucky Spin Error:", error);
    res.status(500).json({
      success: false,
      message: {
        en: "Failed to spin the wheel",
        zh: "转盘失败",
        ms: "Gagal untuk memutar roda",
        zh_hk: "轉盤失敗",
      },
    });
  }
});

// Get Big Winner List
router.get("/api/UserLuckySpinLog", async (req, res) => {
  try {
    const luckyspinlog = await LuckySpinLog.find()
      .select("playerusername createdAt")
      .sort({ createdAt: -1 })
      .limit(20);
    const processedData = luckyspinlog.map((log) => {
      let username = log.playerusername;
      if (username.startsWith("6")) {
        username = username.substring(1);
      }
      if (username.length > 3) {
        username = username.substring(0, 3) + "***";
      }
      return {
        playerusername: username,
        createdAt: log.createdAt,
      };
    });

    res.json({ success: true, data: processedData });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Admin Get Lucky Spin Log
router.get(
  "/admin/api/getLuckySpinLog",
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
      const luckyspinlog = await LuckySpinLog.find({
        ...dateFilter,
      }).sort({ createdAt: -1 });
      res.json({ success: true, luckyspinlog });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// Admin Create Lucky Spin
router.post(
  "/admin/api/createLuckySpin",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { name, angle, probability, value } = req.body;
      if (
        !name ||
        angle === undefined ||
        probability === undefined ||
        value === undefined
      ) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Missing required fields",
            zh: "缺少必填字段",
          },
        });
      }
      const newLuckySpin = new LuckySpin({
        name,
        angle,
        probability,
        value,
      });
      const savedLuckySpin = await newLuckySpin.save();
      res.status(200).json({
        success: true,
        message: {
          en: "Lucky spin prize created successfully",
          zh: "幸运转盘奖品创建成功",
        },
        data: savedLuckySpin,
      });
    } catch (error) {
      console.error("Error creating LuckySpin:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error creating lucky spin prize",
          zh: "创建幸运转盘奖品时出错",
        },
      });
    }
  }
);

// Admin Update Lucky Spin Data
router.put(
  "/admin/api/updateLuckySpin/:id",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { name, angle, probability, value } = req.body;
      if (
        !name ||
        angle === undefined ||
        probability === undefined ||
        value === undefined
      ) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Missing required fields",
            zh: "缺少必填字段",
          },
        });
      }
      const updatedPrize = await LuckySpin.findByIdAndUpdate(
        id,
        { name, angle, probability, value },
        { new: true }
      );
      if (!updatedPrize) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Prize not found",
            zh: "找不到奖品",
          },
        });
      }
      res.status(200).json({
        success: true,
        message: {
          en: "Prize updated successfully",
          zh: "奖品更新成功",
        },
        data: updatedPrize,
      });
    } catch (error) {
      console.error("Error updating LuckySpin:", error);
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

// Admin Update User Lucky Spin Count
router.put(
  "/admin/api/updateUserLuckySpinCount/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { count } = req.body;
      const updatedUser = await User.findByIdAndUpdate(userId, {
        luckySpinCount: count,
      });
      if (!updatedUser) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }
      res.json({
        success: true,
      });
    } catch (error) {
      console.error("Error updating lucky spin count:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
);

// Admin Get Lucky Spin Data
router.get(
  "/admin/api/getLuckySpin",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const prizes = await LuckySpin.find().sort({ angle: 1 });
      res.json({ success: true, prizes });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// Admin Update Specific User Lucky Spin Probability
router.post(
  "/admin/api/setUserLuckySpinSetting/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { settings, remainingCount } = req.body;
      const { userId } = req.params;
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        {
          $set: {
            luckySpinSetting: {
              settings: settings,
              remainingCount: remainingCount,
            },
          },
        },
        { new: true }
      );
      if (!updatedUser) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "找不到用户",
          },
        });
      }
      res.status(200).json({
        success: true,
        message: {
          en: "Lucky spin settings updated successfully",
          zh: "幸运转盘设置更新成功",
        },
        data: updatedUser.luckySpinSetting,
      });
    } catch (error) {
      console.error("Error updating lucky spin settings:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error updating lucky spin settings",
          zh: "更新幸运转盘设置时出错",
        },
      });
    }
  }
);

// Admin Get Specific User Lucky Spin Setting
router.get(
  "/admin/api/getUserLuckySpinSetting/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }
      res.json({
        success: true,
        data: user.luckySpinSetting || [],
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

// Admin Delete Lucky Spin
router.delete(
  "/admin/api/luckySpin/:id",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const deletedLuckySpin = await LuckySpin.findByIdAndDelete(req.params.id);
      if (!deletedLuckySpin) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Prize not found",
            zh: "找不到奖品",
          },
        });
      }
      res.status(200).json({
        success: true,
        message: {
          en: "Prize deleted successfully",
          zh: "奖品删除成功",
        },
      });
    } catch (error) {
      console.error("Error deleting LuckySpin:", error);
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
