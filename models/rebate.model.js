const mongoose = require("mongoose");
const moment = require("moment");
const { makeModelProxy } = require("../lib/makeModelProxy");

const rebateLogSchema = new mongoose.Schema(
  {
    username: {
      type: String,
    },
    totaldeposit: {
      type: Number,
    },
    totalwithdraw: {
      type: Number,
    },
    totalbonus: {
      type: Number,
    },
    totalwinlose: {
      type: Number,
    },
    totalRebate: {
      type: Number,
    },
    rebateissuesdate: {
      type: Date,
    },
    type: {
      type: String,
    },
    formula: {
      type: String,
    },
    remark: {
      type: String,
    },
    totalturnover: {
      type: Number,
      default: 0,
    },
    slot: {
      type: Number,
      default: 0,
    },
    livecasino: {
      type: Number,
      default: 0,
    },
    sports: {
      type: Number,
      default: 0,
    },
    fishing: {
      type: Number,
      default: 0,
    },
    poker: {
      type: Number,
      default: 0,
    },
    mahjong: {
      type: Number,
      default: 0,
    },
    esports: {
      type: Number,
      default: 0,
    },
    horse: {
      type: Number,
      default: 0,
    },
    lottery: {
      type: Number,
      default: 0,
    },
    claimed: {
      type: Boolean,
      default: false,
    },
    claimedBy: {
      type: String,
      default: null,
    },
    claimedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: {
      currentTime: () => moment().utc().toDate(),
    },
  }
);

module.exports = makeModelProxy("rebateLog", rebateLogSchema);
