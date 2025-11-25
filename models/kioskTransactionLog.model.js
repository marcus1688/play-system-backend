const mongoose = require("mongoose");
const { makeModelProxy } = require("../lib/makeModelProxy");

const kioskTransactionLogSchema = new mongoose.Schema({
  date: {
    type: Date,
    default: Date.now,
  },
  operation: {
    type: String,
    enum: ["add", "subtract"],
    required: true,
  },
  amount: {
    type: mongoose.Schema.Types.Decimal128,
    required: true,
    set: function (v) {
      const formatted = parseFloat(v).toFixed(2);
      return mongoose.Types.Decimal128.fromString(formatted);
    },
    get: function (v) {
      if (v) return parseFloat(v.toString());
      return 0;
    },
  },
  username: {
    type: String,
  },
  previousBalance: {
    type: mongoose.Schema.Types.Decimal128,
    required: true,
    set: function (v) {
      const formatted = parseFloat(v).toFixed(2);
      return mongoose.Types.Decimal128.fromString(formatted);
    },
    get: function (v) {
      if (v) return parseFloat(v.toString());
      return 0;
    },
  },
  newBalance: {
    type: mongoose.Schema.Types.Decimal128,
    required: true,
    set: function (v) {
      const formatted = parseFloat(v).toFixed(2);
      return mongoose.Types.Decimal128.fromString(formatted);
    },
    get: function (v) {
      if (v) return parseFloat(v.toString());
      return 0;
    },
  },
  transactionType: {
    type: String,
    required: true,
  },
  remark: {
    type: String,
  },
  processBy: {
    type: String,
    required: true,
  },
});

kioskTransactionLogSchema.virtual("formattedAmount").get(function () {
  return `$${this.amount.toFixed(2)}`;
});

kioskTransactionLogSchema.virtual("formattedPreviousBalance").get(function () {
  return `$${this.previousBalance.toFixed(2)}`;
});

kioskTransactionLogSchema.virtual("formattedNewBalance").get(function () {
  return `$${this.newBalance.toFixed(2)}`;
});

kioskTransactionLogSchema.set("toJSON", {
  virtuals: true,
  getters: true,
});

kioskTransactionLogSchema.set("toObject", {
  virtuals: true,
  getters: true,
});

module.exports = makeModelProxy(
  "KioskTransactionLog",
  kioskTransactionLogSchema
);
