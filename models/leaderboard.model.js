const mongoose = require("mongoose");
const { makeModelProxy } = require("../lib/makeModelProxy");

const LeaderboardEntrySchema = new mongoose.Schema(
  {
    account: {
      type: String,
      required: true,
    },
    validBet: {
      type: Number,
      required: true,
      min: 0,
    },
    category: {
      type: String,
      required: true,
      enum: ["Sports", "Live Casino", "Slot Games", "Other"],
    },
    rank: {
      type: Number,
      required: true,
      min: 1,
    },
    isVisible: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = makeModelProxy("leaderboard", LeaderboardEntrySchema);
