const mongoose = require("mongoose");
const { makeModelProxy } = require("../lib/makeModelProxy");

const kioskCategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
    },
  },
  { timestamps: true }
);

module.exports = makeModelProxy("KioskCategory", kioskCategorySchema);
