const mongoose = require("mongoose");
const { makeModelProxy } = require("../lib/makeModelProxy");

const smsSchema = new mongoose.Schema({
  balance: {
    type: mongoose.Schema.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString("0"),
    set: function (v) {
      const formatted = parseFloat(v).toFixed(4);
      return mongoose.Types.Decimal128.fromString(formatted);
    },
    get: function (v) {
      if (v) return parseFloat(v.toString());
      return 0;
    },
  },
  status: {
    type: Boolean,
  },
  minBalance: {
    type: Number,
    default: 0,
  },
});

module.exports = makeModelProxy("sms", smsSchema);
