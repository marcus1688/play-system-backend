const mongoose = require("mongoose");
const moment = require("moment");
const { makeModelProxy } = require("../lib/makeModelProxy");

const depositschema = new mongoose.Schema(
  {
    transactionId: {
      type: String,
      unique: true,
    },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    username: {
      type: String,
    },
    fullname: {
      type: String,
    },
    bankid: {
      type: String,
    },
    bankname: {
      type: String,
    },
    ownername: {
      type: String,
    },
    transfernumber: {
      type: String,
    },
    walletType: {
      type: String,
      required: true,
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
    walletamount: {
      type: Number,
    },
    imageUrl: {
      type: String,
    },
    method: {
      type: String,
    },
    status: {
      type: String,
      default: "pending",
    },
    remark: {
      type: String,
    },
    newDeposit: {
      type: Boolean,
      default: false,
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

depositschema.index({ createdAt: -1 });
depositschema.index(
  { userId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "pending" },
  }
);

module.exports = makeModelProxy("deposit", depositschema);
