const kioskbalance = require("../models/kioskbalance.model");
const KioskTransactionLog = require("../models/kioskTransactionLog.model");

async function logKioskTransaction(
  operation,
  amount,
  username,
  previousBalance,
  newBalance,
  transactionType,
  remark,
  processBy
) {
  try {
    const transactionLog = new KioskTransactionLog({
      date: new Date(),
      operation,
      amount,
      username,
      previousBalance,
      newBalance,
      transactionType,
      remark,
      processBy,
    });

    return await transactionLog.save();
  } catch (error) {
    console.error("Error logging kiosk transaction:", error);
  }
}

async function updateKioskBalance(operation, amount, options = {}) {
  try {
    if (!["add", "subtract"].includes(operation)) {
      return {
        success: false,
        message: 'Invalid operation type. Must be "add" or "subtract"',
      };
    }
    if (typeof amount !== "number" || amount <= 0) {
      return {
        success: false,
        message: "Amount must be a positive number",
      };
    }
    const kioskSettings = await kioskbalance.findOne({});
    if (!kioskSettings) {
      return {
        success: false,
        message: "Kiosk balance not initialized",
      };
    }
    const currentBalance = kioskSettings.balance;
    if (!kioskSettings.status) {
      return {
        success: false,
        message: "Kiosk service is currently inactive",
      };
    }
    if (operation === "subtract") {
      if (amount > currentBalance) {
        return {
          success: false,
          message: "Insufficient kiosk balance",
          requiredAmount: amount,
          availableBalance: currentBalance,
        };
      }
    }

    const newBalance =
      operation === "add" ? currentBalance + amount : currentBalance - amount;
    const updatedBalance = await kioskbalance.findOneAndUpdate(
      {},
      { balance: newBalance },
      { upsert: true, new: true }
    );
    const isLowBalance = updatedBalance.balance < kioskSettings.minBalance;
    const {
      username = null,
      transactionType = "system",
      remark = null,
      processBy = "system",
    } = options;
    await logKioskTransaction(
      operation,
      amount,
      username,
      currentBalance,
      newBalance,
      transactionType,
      remark,
      processBy
    );
    return {
      success: true,
      previousBalance: currentBalance,
      currentBalance: updatedBalance.balance,
      operation,
      amount,
      ...options,
      isLowBalance,
      message: `Kiosk balance ${
        operation === "add" ? "increased" : "decreased"
      } successfully`,
    };
  } catch (error) {
    console.error(
      `Error updating kiosk balance (${operation} ${amount}):`,
      error
    );
    return {
      success: false,
      message: "Internal server error while updating kiosk balance",
      error: error.message,
    };
  }
}

async function getKioskBalanceInfo() {
  try {
    const kioskSettings = await kioskbalance.findOne({});
    if (!kioskSettings) {
      return {
        balance: 0,
        status: false,
        minBalance: 0,
      };
    }
    return {
      balance: kioskSettings.balance,
      status: kioskSettings.status,
      minBalance: kioskSettings.minBalance,
      isLowBalance: kioskSettings.balance < kioskSettings.minBalance,
    };
  } catch (error) {
    console.error("Error fetching kiosk balance info:", error);
    throw error;
  }
}

module.exports = {
  updateKioskBalance,
  getKioskBalanceInfo,
};
