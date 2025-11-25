const mongoose = require("mongoose");
const { makeModelProxy } = require("../lib/makeModelProxy");

const checkinSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    username: { type: String },
    currentStreak: {
      type: Number,
      default: 0,
    },
    lastCheckIn: {
      type: Date,
      default: null,
    },
    totalCheckins: {
      type: Number,
      default: 0,
    },
    monthlyCheckIns: {
      type: Object,
      default: () => ({}),
    },
    dailyRewards: [
      {
        date: {
          type: Date,
          default: Date.now,
        },
        spinCount: {
          type: Number,
          default: 1,
        },
      },
    ],
    checkInHistory: {
      type: [Number],
      default: [],
    },
  },

  { timestamps: true }
);

module.exports = makeModelProxy("Checkin", checkinSchema);
