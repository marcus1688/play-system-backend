const mongoose = require("mongoose");
const moment = require("moment");
const { makeModelProxy } = require("../lib/makeModelProxy");

const bankSchema = new mongoose.Schema({
  bankname: String,
  bankcode: String,
  bankimage: String,
  minlimit: {
    type: Number,
    default: 0,
  },
  maxlimit: {
    type: Number,
    default: 0,
  },
  active: {
    type: Boolean,
    default: true,
  },
});

const availableBankCodeSchema = new mongoose.Schema({
  bankname: {
    type: String,
    required: true,
  },
  bankcode: {
    type: String,
    required: true,
  },
  active: {
    type: Boolean,
    default: true,
  },
});

const paymentGatewaySchema = new mongoose.Schema(
  {
    name: String,
    logo: String,
    paymentAPI: String,
    withdrawAPI: String,
    reportAPI: String,
    minDeposit: Number,
    maxDeposit: Number,
    minWithdraw: Number,
    maxWithdraw: Number,
    balance: Number,
    remark: String,
    status: Boolean,
    autowithdraw: {
      type: Boolean,
      default: false,
    },
    banks: [bankSchema],
    availableBankCodes: [availableBankCodeSchema],
  },
  {
    timestamps: {
      currentTime: () => moment().utc().toDate(),
    },
  }
);

module.exports = makeModelProxy("paymentgateway", paymentGatewaySchema);
