const mongoose = require("mongoose");
const moment = require("moment");
const { makeModelProxy } = require("../lib/makeModelProxy");

const agentCommissionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["weekly", "monthly"],
      default: "weekly",
    },
    weekDay: {
      type: String,
      default: "1",
    },
    monthDay: {
      type: String,
      min: 1,
      max: 31,
      default: 1,
    },
    hour: {
      type: String,
      default: "03",
    },
    minute: {
      type: String,
      default: "00",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    calculationType: {
      type: String,
      enum: ["turnover", "winlose"],
      default: "turnover",
    },
    maxDownline: {
      type: String,
      default: "1",
    },
    commissionPercentages: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    winLoseCommission: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    lastRunTime: {
      type: Date,
    },
  },
  {
    timestamps: {
      currentTime: () => moment().utc().toDate(),
    },
  }
);

const agentCommissionReportSchema = new mongoose.Schema(
  {
    agentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    bonusTransactionId: {
      type: String,
      default: null,
    },
    agentUsername: {
      type: String,
    },
    agentFullname: {
      type: String,
    },
    downlineUsername: {
      type: String,
    },
    downlineFullname: {
      type: String,
    },
    downlineId: {
      type: String,
    },
    downlineDetailTurnover: [
      {
        level: Number,
        username: String,
        totalTurnover: Number,
      },
    ],
    downlineDetailWinLoss: [
      {
        level: Number,
        username: String,
        totalDeposit: Number,
        totalWithdraw: Number,
        netAmount: Number,
      },
    ],
    calculationType: {
      type: String,
      enum: ["turnover", "winlose"],
      required: true,
    },
    categoryTurnover: {
      type: Map,
      of: Number,
      default: new Map(),
    },
    totalWinLoss: {
      type: Number,
      default: 0,
    },
    totalDeposit: {
      type: Number,
      default: 0,
    },
    totalWithdraw: {
      type: Number,
      default: 0,
    },
    totalBonus: {
      type: Number,
      default: 0,
    },
    commissionAmount: {
      type: Number,
      required: true,
    },
    totalTurnover: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "cancel"],
      default: "pending",
    },
    formula: {
      type: String,
    },
    formulazh: {
      type: String,
    },
    remark: {
      type: String,
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

module.exports = {
  AgentCommission: makeModelProxy("AgentCommission", agentCommissionSchema),
  AgentCommissionReport: makeModelProxy(
    "AgentCommissionReport",
    agentCommissionReportSchema
  ),
};
