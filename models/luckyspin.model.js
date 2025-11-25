const mongoose = require("mongoose");
const { makeModelProxy } = require("../lib/makeModelProxy");

const LuckySpinSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    angle: {
      type: Number,
      required: true,
    },
    probability: {
      type: Number,
      required: true,
    },
    value: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = makeModelProxy("luckyspin", LuckySpinSchema);
