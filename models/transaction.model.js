const mongoose = require("mongoose");
const moment = require("moment");
const { makeModelProxy } = require("../lib/makeModelProxy");

const transactionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["deposit", "withdraw"],
      required: true,
    },
    username: {
      type: String,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    time: {
      type: Date,
      default: () => moment().utc().toDate(),
    },
    status: {
      type: String,
      enum: ["pending", "completed", "rejected"],
      default: "pending",
    },
    remark: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: {
      currentTime: () => moment().utc().toDate(),
    },
  }
);

transactionSchema.index({ createdAt: -1 });
transactionSchema.index({ username: 1 });
transactionSchema.index({ type: 1 });
transactionSchema.index({ status: 1 });

module.exports = makeModelProxy("transaction", transactionSchema);
