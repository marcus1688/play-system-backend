const mongoose = require("mongoose");
const { makeModelProxy } = require("../lib/makeModelProxy");

const LuckySpinSettingSchema = new mongoose.Schema(
  {
    depositAmount: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = makeModelProxy("luckyspinsetting", LuckySpinSettingSchema);
