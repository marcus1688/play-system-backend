const mongoose = require("mongoose");
const moment = require("moment");
const { makeModelProxy } = require("../lib/makeModelProxy");

const withdrawSchema = new mongoose.Schema(
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
    bankid: {
      type: String,
      required: true,
    },
    bankname: {
      type: String,
      required: true,
    },
    ownername: {
      type: String,
      required: true,
    },
    transfernumber: {
      type: String,
      required: true,
    },
    transactionType: {
      type: String,
      required: true,
    },
    walletType: {
      type: String,
      required: true,
      default: "Main",
    },
    processBy: {
      type: String,
      required: true,
      default: "Admin",
    },
    amount: {
      type: Number,
      required: true,
    },
    walletamount: {
      type: Number,
    },
    method: {
      type: String,
    },
    withdrawbankid: {
      type: String,
    },
    status: {
      type: String,
      default: "pending",
    },
    remark: {
      type: String,
    },
    reverted: {
      type: Boolean,
      default: false,
    },
    duplicateIP: {
      type: Boolean,
      default: false,
    },
    revertedProcessBy: {
      type: String,
    },
    processtime: {
      type: String,
      default: "PENDING",
    },
  },
  {
    timestamps: {
      currentTime: () => moment().utc().toDate(),
    },
  }
);

withdrawSchema.index({ createdAt: -1 });
withdrawSchema.index(
  { userId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "pending" },
  }
);
module.exports = makeModelProxy("withdraw", withdrawSchema);
