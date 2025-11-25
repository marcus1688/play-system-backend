const mongoose = require("mongoose");
const { makeModelProxy } = require("../lib/makeModelProxy");

const promoCodeClaimSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    username: { type: String, required: true },
    promoCodeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PromoCode",
      required: true,
    },
    code: { type: String, required: true },
    amount: { type: Number, required: true },
  },
  { timestamps: true }
);

module.exports = makeModelProxy("PromoCodeClaim", promoCodeClaimSchema);
