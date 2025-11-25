const mongoose = require("mongoose");
const { makeModelProxy } = require("../lib/makeModelProxy");

const helpSchema = new mongoose.Schema(
  {
    questionEN: { type: String },
    questionCN: { type: String },
    questionMS: { type: String },
    answerEN: { type: String },
    answerCN: { type: String },
    answerMS: { type: String },
    isVisible: { type: Boolean },
  },
  { timestamps: true }
);

module.exports = makeModelProxy("Help", helpSchema);
