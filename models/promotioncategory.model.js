const mongoose = require("mongoose");
const { makeModelProxy } = require("../lib/makeModelProxy");

const promotionCategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
    },
  },
  { timestamps: true }
);

module.exports = makeModelProxy("PromotionCategory", promotionCategorySchema);
