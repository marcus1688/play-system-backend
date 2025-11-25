const mongoose = require("mongoose");
const moment = require("moment");
const { makeModelProxy } = require("../lib/makeModelProxy");

const userwalletcashoutschema = new mongoose.Schema(
  {
    transactionId: {
      type: String,
      required: true,
      unique: true,
    },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    username: {
      type: String,
      required: true,
    },
    fullname: {
      type: String,
      required: true,
    },
    walletType: {
      type: String,
      default: "Main",
    },
    transactionType: {
      type: String,
      required: true,
    },
    processBy: {
      type: String,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
    },
    remark: {
      type: String,
      default: "-",
    },
    method: {
      type: String,
    },
    reverted: {
      type: Boolean,
      default: false,
    },
    revertedProcessBy: {
      type: String,
    },
  },
  {
    timestamps: {
      currentTime: () => moment().utc().toDate(), // Ensure timestamps are stored in UTC
    },
  }
);

userwalletcashoutschema.index(
  { createdAt: -1 },
  { expireAfterSeconds: 5260000 }
);

module.exports = makeModelProxy("UserWalletCashOut", userwalletcashoutschema);
