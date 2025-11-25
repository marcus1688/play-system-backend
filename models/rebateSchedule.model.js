const mongoose = require("mongoose");
const { makeModelProxy } = require("../lib/makeModelProxy");

const rebateScheduleSchema = new mongoose.Schema(
  {
    hour: {
      type: Number,
      required: true,
      min: 0,
      max: 23,
    },
    minute: {
      type: Number,
      required: true,
      min: 0,
      max: 59,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastRunTime: {
      type: Date,
    },
    calculationType: {
      type: String,
      enum: ["turnover", "winlose"],
      required: true,
      default: "turnover",
    },
    winLosePercentage: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    categoryPercentages: {
      type: Map,
      of: Number,
      default: {},
    },
  },
  { timestamps: true }
);

module.exports = makeModelProxy("RebateSchedule", rebateScheduleSchema);
