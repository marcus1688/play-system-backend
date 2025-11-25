const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../auth/auth");
const Withdraw = require("../models/withdraw.model");
const { User } = require("../models/users.model");
const { authenticateAdminToken } = require("../auth/adminAuth");
const { adminUser } = require("../models/adminuser.model");
const { v4: uuidv4 } = require("uuid");
const UserWalletLog = require("../models/userwalletlog.model");
const vip = require("../models/vip.model");
const moment = require("moment");
const Deposit = require("../models/deposit.model");
const Bonus = require("../models/bonus.model");
const promotion = require("../models/promotion.model");
const axios = require("axios");

// Check Turnover Requirement
const checkTurnoverRequirements = async (userId, authToken) => {
  try {
    const DEFAULT_TURNOVER_MULTIPLIER = 1;
    const DEFAULT_WINOVER_MULTIPLIER = 3;
    const latestWithdraw = await Withdraw.findOne({
      userId,
      status: "approved",
    }).sort({ createdAt: -1 });
    const latestDeposit = await Deposit.findOne({
      userId,
      status: "approved",
    }).sort({ createdAt: -1 });

    let latestBonus = await Bonus.findOne({
      userId,
      status: "approved",
    }).sort({ createdAt: -1 });
    if (
      latestWithdraw &&
      (!latestDeposit || latestWithdraw.createdAt > latestDeposit.createdAt) &&
      (!latestBonus || latestWithdraw.createdAt > latestBonus.createdAt)
    ) {
      return {
        success: true,
        message: "No turnover requirements to check",
      };
    }
    let isDepositLatest =
      latestDeposit &&
      (!latestBonus || latestDeposit.createdAt > latestBonus.createdAt);
    let isBonusLatest =
      latestBonus &&
      (!latestDeposit || latestBonus.createdAt > latestDeposit.createdAt);
    let requirementType = "none";
    let turnoverRequirement = 0;
    let withdrawType = "turnover";
    if (isDepositLatest) {
      const relatedBonus = await Bonus.findOne({
        depositId: latestDeposit._id,
        status: "approved",
      });
      if (!relatedBonus) {
        turnoverRequirement =
          latestDeposit.amount * DEFAULT_TURNOVER_MULTIPLIER;
        requirementType = "turnover";
      } else {
        const promotionData = await promotion.findById(
          relatedBonus.promotionId
        );
        if (!promotionData) {
          turnoverRequirement =
            (parseFloat(latestDeposit.amount) +
              parseFloat(relatedBonus.amount)) *
            DEFAULT_TURNOVER_MULTIPLIER;
          requirementType = "turnover";
        } else {
          withdrawType = promotionData.withdrawtype || "turnover";
          if (withdrawType === "winover") {
            const user = await User.findById(userId);
            if (!user) {
              return {
                success: false,
                message: "User not found",
              };
            }
            const multiplier =
              promotionData.winloserequirement || DEFAULT_WINOVER_MULTIPLIER;
            const totalAmount =
              parseFloat(latestDeposit.amount) +
              parseFloat(relatedBonus.amount);
            const winoverRequirement = totalAmount * multiplier;
            if (user.wallet >= winoverRequirement) {
              return {
                success: true,
                message: "Winover requirement met",
              };
            } else {
              return {
                success: false,
                message: "Winover requirement not met",
                requiredAmount: winoverRequirement,
                currentBalance: user.wallet,
                remainingAmount: winoverRequirement - user.wallet,
              };
            }
          } else {
            const multiplier =
              promotionData.turnoverrequiremnt || DEFAULT_TURNOVER_MULTIPLIER;
            const totalAmount =
              parseFloat(latestDeposit.amount) +
              parseFloat(relatedBonus.amount);
            turnoverRequirement = totalAmount * multiplier;
            requirementType = "turnover";
          }
        }
      }
    } else if (isBonusLatest) {
      if (!latestBonus.depositId) {
        const promotionData = await promotion.findById(latestBonus.promotionId);
        if (!promotionData) {
          return {
            success: true,
            message: "No turnover requirements for this bonus",
          };
        }
        withdrawType = promotionData.withdrawtype || "turnover";
        if (withdrawType === "winover") {
          const user = await User.findById(userId);
          if (!user) {
            return {
              success: false,
              message: "User not found",
            };
          }
          const multiplier =
            promotionData.winloserequirement || DEFAULT_WINOVER_MULTIPLIER;
          const winoverRequirement = latestBonus.amount * multiplier;
          if (user.wallet >= winoverRequirement) {
            return {
              success: true,
              message: "Winover requirement met",
            };
          } else {
            return {
              success: false,
              message: "Winover requirement not met",
              requiredAmount: winoverRequirement,
              currentBalance: user.wallet,
              remainingAmount: winoverRequirement - user.wallet,
            };
          }
        } else {
          const multiplier =
            promotionData.turnoverrequiremnt || DEFAULT_TURNOVER_MULTIPLIER;
          turnoverRequirement = latestBonus.amount * multiplier;
          requirementType = "turnover";
        }
      } else {
        const relatedDeposit = await Deposit.findById(latestBonus.depositId);
        const promotionData = await promotion.findById(latestBonus.promotionId);
        if (!promotionData) {
          if (relatedDeposit) {
            turnoverRequirement =
              (parseFloat(relatedDeposit.amount) +
                parseFloat(latestBonus.amount)) *
              DEFAULT_TURNOVER_MULTIPLIER;
          } else {
            turnoverRequirement =
              latestBonus.amount * DEFAULT_TURNOVER_MULTIPLIER;
          }
          requirementType = "turnover";
        } else {
          withdrawType = promotionData.withdrawtype || "turnover";
          if (withdrawType === "winover") {
            const user = await User.findById(userId);
            if (!user) {
              return {
                success: false,
                message: "User not found",
              };
            }
            let totalAmount = latestBonus.amount;
            if (relatedDeposit) {
              totalAmount += parseFloat(relatedDeposit.amount);
            }
            const multiplier =
              promotionData.winloserequirement || DEFAULT_WINOVER_MULTIPLIER;
            const winoverRequirement = totalAmount * multiplier;
            if (user.wallet >= winoverRequirement) {
              return {
                success: true,
                message: "Winover requirement met",
              };
            } else {
              return {
                success: false,
                message: "Winover requirement not met",
                requiredAmount: winoverRequirement,
                currentBalance: user.wallet,
                remainingAmount: winoverRequirement - user.wallet,
              };
            }
          } else {
            let totalAmount = latestBonus.amount;
            if (relatedDeposit) {
              totalAmount += parseFloat(relatedDeposit.amount);
            }
            const multiplier =
              promotionData.turnoverrequiremnt || DEFAULT_TURNOVER_MULTIPLIER;
            turnoverRequirement = totalAmount * multiplier;
            requirementType = "turnover";
          }
        }
      }
    } else {
      return {
        success: true,
        message: "No transactions found",
      };
    }
    if (requirementType === "turnover" && turnoverRequirement > 0) {
      try {
        let transactionDate;
        if (isBonusLatest) {
          transactionDate = moment(latestBonus.createdAt).format(
            "YYYY-MM-DD HH:mm:ss"
          );
        } else if (isDepositLatest) {
          transactionDate = moment(latestDeposit.createdAt).format(
            "YYYY-MM-DD HH:mm:ss"
          );
        }
        const startDate = transactionDate;
        const response = await axios.get(
          `${process.env.BASE_URL}api/all/dailygamedata`,
          {
            params: { startDate },
            headers: {
              Authorization: `Bearer ${authToken}`,
              "Content-Type": "application/json",
            },
          }
        );
        const data = response.data;
        if (!data || !data.success) {
          return {
            success: false,
            message: "Failed to fetch turnover data",
          };
        }
        const userTotalTurnover = data.summary.totalTurnover || 0;
        if (userTotalTurnover >= turnoverRequirement) {
          return {
            success: true,
            message: "Turnover requirement met",
          };
        } else {
          return {
            success: false,
            message: "Turnover requirement not met",
            requiredTurnover: turnoverRequirement,
            currentTurnover: userTotalTurnover,
            remainingTurnover: turnoverRequirement - userTotalTurnover,
          };
        }
      } catch (error) {
        console.error("Error fetching turnover data:", error);
        return {
          success: false,
          message: "Error checking turnover requirements",
          error: error.message,
        };
      }
    }
    return {
      success: true,
      message: "No turnover requirements",
    };
  } catch (error) {
    console.error("Error checking turnover requirements:", error);
    return {
      success: false,
      message: "Error checking turnover requirements",
      error: error.message,
    };
  }
};

// Customer Submit Withdraw
router.post("/api/withdraw", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(200).json({
        success: false,
        message: {
          en: "User not found, please contact customer service",
          zh: "找不到用户，请联系客服",
          zh_hk: "搵唔到用戶，請聯繫客服",
          ms: "Pengguna tidak dijumpai, sila hubungi khidmat pelanggan",
          id: "Pengguna tidak ditemukan, silakan hubungi layanan pelanggan",
        },
      });
    }

    if (user.withdrawlock) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Your withdrawals are currently locked. Please contact support for assistance",
          zh: "您的提现功能已被锁定，请联系客服获取帮助",
          zh_hk: "你嘅提款功能已被鎖定，請聯繫客服獲取幫助",
          ms: "Pengeluaran anda kini dikunci. Sila hubungi khidmat sokongan untuk bantuan",
          id: "Penarikan Anda saat ini dikunci. Silakan hubungi dukungan untuk bantuan",
        },
      });
    }

    const { withdrawAmount, userbankid } = req.body;
    if (!withdrawAmount || withdrawAmount <= 0) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Please enter a valid withdraw amount",
          zh: "请输入有效的提现金额",
          zh_hk: "請輸入有效嘅提款金額",
          ms: "Sila masukkan jumlah pengeluaran yang sah",
          id: "Silakan masukkan jumlah penarikan yang valid",
        },
      });
    }

    if (withdrawAmount < 50) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Minimum withdrawal amount is HKD 50",
          zh: "最低提款金额为HKD 50",
          zh_hk: "最低提款金額為HKD 50",
          ms: "Jumlah pengeluaran minimum adalah HKD 50",
          id: "Jumlah penarikan minimum adalah HKD 50",
        },
      });
    }

    if (withdrawAmount > user.wallet) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Withdraw amount exceeds wallet balance",
          zh: "提现金额超过钱包余额",
          zh_hk: "提款金額超過錢包餘額",
          ms: "Jumlah pengeluaran melebihi baki dompet",
          id: "Jumlah penarikan melebihi saldo dompet",
        },
      });
    }

    if (!userbankid) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Please select a bank account",
          zh: "请选择银行账户",
          zh_hk: "請選擇銀行賬戶",
          ms: "Sila pilih akaun bank",
          id: "Silakan pilih rekening bank",
        },
      });
    }

    const existingPendingWithdrawal = await Withdraw.findOne({
      userId: userId,
      status: "pending",
    });

    if (existingPendingWithdrawal) {
      return res.status(200).json({
        success: false,
        message: {
          en: "You already have a pending withdrawal request. Please wait for it to be processed",
          zh: "您已有一笔待处理的提现申请，请等待处理完成",
          zh_hk: "你已經有一筆待處理嘅提款申請，請等待處理完成",
          ms: "Anda sudah mempunyai permintaan pengeluaran yang belum selesai. Sila tunggu sehingga ia diproses",
          id: "Anda sudah memiliki permintaan penarikan yang tertunda. Silakan tunggu hingga diproses",
        },
      });
    }
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];
    const turnoverCheck = await checkTurnoverRequirements(userId, token);
    if (!turnoverCheck.success) {
      let message = {
        en: "Turnover requirement not met",
        zh: "未满足流水要求",
        zh_hk: "未滿足流水要求",
        ms: "Keperluan turnover tidak dipenuhi",
        id: "Persyaratan turnover tidak terpenuhi",
      };

      if (turnoverCheck.requiredTurnover) {
        message = {
          en: `Turnover requirement not met. You need ${turnoverCheck.requiredTurnover.toFixed(
            2
          )} turnover, current: ${turnoverCheck.currentTurnover.toFixed(
            2
          )}, remaining: ${turnoverCheck.remainingTurnover.toFixed(2)}`,
          zh: `未满足流水要求。您需要 ${turnoverCheck.requiredTurnover.toFixed(
            2
          )} 的流水，当前: ${turnoverCheck.currentTurnover.toFixed(
            2
          )}，还差: ${turnoverCheck.remainingTurnover.toFixed(2)}`,
          zh_hk: `未滿足流水要求。你需要 ${turnoverCheck.requiredTurnover.toFixed(
            2
          )} 嘅流水，當前: ${turnoverCheck.currentTurnover.toFixed(
            2
          )}，仲差: ${turnoverCheck.remainingTurnover.toFixed(2)}`,
          ms: `Keperluan turnover tidak dipenuhi. Anda memerlukan ${turnoverCheck.requiredTurnover.toFixed(
            2
          )} turnover, semasa: ${turnoverCheck.currentTurnover.toFixed(
            2
          )}, baki: ${turnoverCheck.remainingTurnover.toFixed(2)}`,
          id: `Persyaratan turnover tidak terpenuhi. Anda membutuhkan ${turnoverCheck.requiredTurnover.toFixed(
            2
          )} turnover, saat ini: ${turnoverCheck.currentTurnover.toFixed(
            2
          )}, tersisa: ${turnoverCheck.remainingTurnover.toFixed(2)}`,
        };
      } else if (turnoverCheck.requiredAmount) {
        message = {
          en: `Wallet balance requirement not met. Your wallet balance needs to reach ${turnoverCheck.requiredAmount.toFixed(
            2
          )}, current: ${turnoverCheck.currentBalance.toFixed(
            2
          )}, remaining: ${turnoverCheck.remainingAmount.toFixed(2)}`,
          zh: `未满足余额要求。您的钱包余额需要达到 ${turnoverCheck.requiredAmount.toFixed(
            2
          )}，当前: ${turnoverCheck.currentBalance.toFixed(
            2
          )}，还差: ${turnoverCheck.remainingAmount.toFixed(2)}`,
          zh_hk: `未滿足餘額要求。你嘅錢包餘額需要達到 ${turnoverCheck.requiredAmount.toFixed(
            2
          )}，當前: ${turnoverCheck.currentBalance.toFixed(
            2
          )}，仲差: ${turnoverCheck.remainingAmount.toFixed(2)}`,
          ms: `Keperluan baki dompet tidak dipenuhi. Baki dompet anda perlu mencapai ${turnoverCheck.requiredAmount.toFixed(
            2
          )}, semasa: ${turnoverCheck.currentBalance.toFixed(
            2
          )}, baki: ${turnoverCheck.remainingAmount.toFixed(2)}`,
          id: `Persyaratan saldo dompet tidak terpenuhi. Saldo dompet Anda harus mencapai ${turnoverCheck.requiredAmount.toFixed(
            2
          )}, saat ini: ${turnoverCheck.currentBalance.toFixed(
            2
          )}, tersisa: ${turnoverCheck.remainingAmount.toFixed(2)}`,
        };
      }

      return res.status(200).json({
        success: false,
        message: message,
        turnoverDetails: turnoverCheck,
      });
    }

    const userVipLevel = user.viplevel;
    const vipSettings = await vip.findOne();
    let withdrawCountLimit = 3;

    if (!vipSettings) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Unable to process withdrawal at this time. Please try again later",
          zh: "目前无法处理提款，请稍后再试",
          zh_hk: "目前無法處理提款，請稍後再試",
          ms: "Tidak dapat memproses pengeluaran pada masa ini. Sila cuba lagi kemudian",
          id: "Tidak dapat memproses penarikan saat ini. Silakan coba lagi nanti",
        },
      });
    }

    if (!userVipLevel || userVipLevel.toLowerCase() === "member") {
    } else if (vipSettings) {
      const vipLevelData = vipSettings.vipLevels.find(
        (level) => level.name === userVipLevel.toString()
      );
      if (vipLevelData && vipLevelData.benefits.has("Withdraw Limit")) {
        const countLimit = vipLevelData.benefits.get("Withdraw Limit");
        withdrawCountLimit = parseInt(countLimit) || 3;
      }
    }
    const malaysiaTimezone = "Asia/Kuala_Lumpur";
    const todayStart = moment().tz(malaysiaTimezone).startOf("day").utc();
    const todayEnd = moment().tz(malaysiaTimezone).endOf("day").utc();
    const todayWithdrawals = await Withdraw.find({
      userId: userId,
      status: { $in: ["approved"] },
      createdAt: {
        $gte: todayStart.toDate(),
        $lte: todayEnd.toDate(),
      },
    });
    const todayWithdrawalCount = todayWithdrawals.length;
    if (todayWithdrawalCount >= withdrawCountLimit) {
      return res.status(200).json({
        success: false,
        message: {
          en: `Daily withdrawal limit reached. Your VIP level allows max ${withdrawCountLimit} withdrawals per day, you've already made ${todayWithdrawalCount} withdrawal(s) today.`,
          zh: `达到每日提款次数限制。您的VIP等级每日最多允许提款${withdrawCountLimit}次，您今日已提款${todayWithdrawalCount}次。`,
          zh_hk: `達到每日提款次數限制。你嘅VIP等級每日最多允許提款${withdrawCountLimit}次，你今日已提款${todayWithdrawalCount}次。`,
          ms: `Had pengeluaran harian dicapai. Tahap VIP anda membenarkan maksimum ${withdrawCountLimit} pengeluaran sehari, anda telah membuat ${todayWithdrawalCount} pengeluaran hari ini.`,
          id: `Batas penarikan harian tercapai. Level VIP Anda memungkinkan maksimal ${withdrawCountLimit} penarikan per hari, Anda sudah melakukan ${todayWithdrawalCount} penarikan hari ini.`,
        },
      });
    }

    const userBank = user.bankAccounts.find(
      (bank) => bank._id.toString() === userbankid
    );
    if (!userBank) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Bank account not found",
          zh: "找不到银行账户",
          zh_hk: "搵唔到銀行賬戶",
          ms: "Akaun bank tidak dijumpai",
          id: "Rekening bank tidak ditemukan",
        },
      });
    }

    user.wallet -= withdrawAmount;
    await user.save();

    const transactionId = uuidv4();
    const newWithdrawal = new Withdraw({
      transactionId: transactionId,
      userId,
      username: user.username,
      fullname: user.fullname,
      amount: withdrawAmount,
      walletamount: user.wallet,
      bankname: userBank.bankname,
      ownername: userBank.name,
      transfernumber: userBank.banknumber,
      bankid: userBank._id,
      transactionType: "withdraw",
      method: "manual",
      processBy: "admin",
      status: "pending",
      remark: "-",
      duplicateIP: user.duplicateIP,
    });
    const savedWithdrawal = await newWithdrawal.save();
    const walletLog = new UserWalletLog({
      userId: userId,
      transactionid: newWithdrawal.transactionId,
      transactiontime: new Date(),
      transactiontype: "withdraw",
      amount: withdrawAmount,
      status: "pending",
    });
    await walletLog.save();
    res.status(200).json({
      success: true,
      message: {
        en: "Withdrawal submitted successfully",
        zh: "提现申请提交成功",
        zh_hk: "提款申請提交成功",
        ms: "Pengeluaran berjaya dihantar",
        id: "Penarikan berhasil dikirim",
      },
      withdrawal: savedWithdrawal,
    });
  } catch (error) {
    console.error("Error during submit withdraw:", error);
    res.status(500).json({
      success: false,
      message: {
        en: "Failed to submit withdrawal",
        zh: "提现申请提交失败",
        zh_hk: "提款申請提交失敗",
        ms: "Gagal menghantar pengeluaran",
        id: "Gagal mengirim penarikan",
      },
    });
  }
});

// Admin Submit Withdraw
router.post("/admin/api/withdraw", authenticateAdminToken, async (req, res) => {
  try {
    const adminId = req.user.userId;
    const adminuser = await adminUser.findById(adminId);
    if (!adminuser) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Admin User not found, please contact customer service",
          zh: "找不到管理员用户，请联系客服",
        },
      });
    }
    const { userid, username, bankid, amount } = req.body;
    if (!userid || !username || !bankid || !amount) {
      return res.status(200).json({
        success: false,
        message: {
          en: "All fields are required",
          zh: "所有字段都是必填的",
        },
      });
    }
    const user = await User.findById(userid);
    if (!user) {
      return res.status(200).json({
        success: false,
        message: {
          en: "User not found",
          zh: "找不到用户",
        },
      });
    }
    const userBank = user.bankAccounts.find(
      (bank) => bank._id.toString() === bankid
    );
    if (!userBank) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Bank account not found for this user",
          zh: "找不到该用户的银行账户",
        },
      });
    }
    const transactionId = uuidv4();

    user.wallet -= amount;
    await user.save();

    const newWithdrawal = new Withdraw({
      transactionId: transactionId,
      userId: userid,
      username: user.username,
      fullname: user.fullname,
      amount: amount,
      walletamount: user.wallet,
      bankname: userBank.bankname,
      ownername: userBank.name,
      transfernumber: userBank.banknumber,
      bankid: userBank._id,
      transactionType: "withdraw",
      method: "manual",
      processBy: "admin",
      status: "pending",
      remark: "CS",
      duplicateIP: user.duplicateIP,
    });
    const savedWithdrawal = await newWithdrawal.save();

    const walletLog = new UserWalletLog({
      userId: userid,
      transactionid: newWithdrawal.transactionId,
      transactiontime: new Date(),
      transactiontype: "withdraw",
      amount: amount,
      status: "pending",
    });
    await walletLog.save();

    res.status(200).json({
      success: true,
      message: {
        en: "Withdrawal submitted successfully",
        zh: "提款提交成功",
      },
      data: savedWithdrawal,
    });
  } catch (error) {
    console.error("Error during withdraw:", error);
    res.status(200).json({
      success: false,
      message: {
        en: "Error processing withdrawal",
        zh: "处理提款时出错",
      },
      error: error.toString(),
    });
  }
});

// Admin Get User Withdraw Logs
router.get(
  "/admin/api/user/:userId/withdraw",
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

      const { startDate, endDate } = req.query;

      const dateFilter = {
        username: user.username,
      };
      if (startDate && endDate) {
        dateFilter.createdAt = {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        };
      }

      const withdrawals = await Withdraw.find(dateFilter)
        .sort({ createdAt: -1 })
        .lean();

      res.status(200).json({
        success: true,
        message: "Withdrawals retrieved successfully",
        data: withdrawals,
      });
    } catch (error) {
      console.error("Error retrieving user withdrawals:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve withdrawals",
        error: error.message,
      });
    }
  }
);

// 只是獲取APPROVED OR REJECTED的提款數據而已
router.get("/api/filterwithdraw", async (req, res) => {
  try {
    const withdraws = await Withdraw.find({
      $and: [
        { $or: [{ status: "APPROVED" }, { status: "REJECTED" }] },
        { transactionType: { $ne: "TRANSACTION FEES" } },
      ],
    });
    res.status(200).json({
      authorized: true,
      message: "Withdraw fetched successfully",
      data: withdraws,
    });
  } catch (error) {
    console.error("Error fetching withdraw", error);
    res
      .status(200)
      .json({ message: "Error fetching withdraw", error: error.toString() });
  }
});

// 检查用户是否有PENDING提款
router.get("/api/checkPendingWithdrawal/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    const userExists = await User.findById(userId);
    if (!userExists) {
      return res.status(200).json({ message: "用户不存在。" });
    }

    const pendingWithdrawal = await Withdraw.find({
      userid: userId,
      status: "pending",
    });

    const hasPendingWithdrawal = pendingWithdrawal.length > 0;

    res.status(200).json({
      authorized: true,
      message: "未决提款检查完成。",
      hasPendingWithdrawal: hasPendingWithdrawal,
    });
  } catch (error) {
    console.error("检查未决提款时发生错误：", error);
    res.status(200).json({
      message: "检查未决提款时发生内部服务器错误。",
      error: error.toString(),
    });
  }
});

router.get("/api/withdrawlogs", async (req, res) => {
  try {
    const withdraws = await Withdraw.find({ status: "approved" })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("amount username");
    const processedWithdraws = withdraws.map((withdraw) => {
      let username = withdraw.username;
      if (username.startsWith("6")) {
        username = username.substring(1);
      }
      if (username.length > 6) {
        username =
          username.substring(0, 3) +
          "****" +
          username.substring(username.length - 3);
      }
      return {
        amount: withdraw.amount,
        username: username,
      };
    });
    res.status(200).json({
      success: true,
      message: "Withdraws fetched successfully",
      data: processedWithdraws,
    });
  } catch (error) {
    console.error("Error fetching Withdraws", error);
    res.status(500).json({
      success: false,
      message: "Error fetching Withdraws",
    });
  }
});

module.exports = router;
