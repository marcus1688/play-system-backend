const mongoose = require("mongoose");
const { makeModelProxy } = require("../lib/makeModelProxy");

const memoSchema = new mongoose.Schema(
  {
    memoText: {
      type: String,
      required: true,
    },
    photos: [
      {
        type: String,
      },
    ],
    lastUpdatedBy: {
      type: String,
      required: true,
    },
    createdBy: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = makeModelProxy("Memo", memoSchema);
