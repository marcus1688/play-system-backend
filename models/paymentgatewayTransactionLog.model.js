const mongoose = require("mongoose");
const moment = require("moment");
const { makeModelProxy } = require("../lib/makeModelProxy");

const paymentGatewayTransactionLogSchema = new mongoose.Schema(
  {
    gatewayId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "paymentgateway",
    },
    gatewayName: String,
    transactiontype: String,
    amount: Number,
    lastBalance: Number,
    currentBalance: Number,
    remark: {
      type: String,
      default: "-",
    },
    playerusername: String,
    processby: String,
    depositId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Deposit",
    },
    withdrawalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Withdrawal",
    },
  },
  {
    timestamps: {
      currentTime: () => moment().utc().toDate(),
    },
  }
);

paymentGatewayTransactionLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 5260000 }
);

module.exports = makeModelProxy(
  "PaymentGatewayTransactionLog",
  paymentGatewayTransactionLogSchema
);
