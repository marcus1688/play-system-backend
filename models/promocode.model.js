const mongoose = require("mongoose");
const { makeModelProxy } = require("../lib/makeModelProxy");

const promoCodeSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true },
    amount: { type: Number, required: true },
    claimLimit: { type: Number, required: true },
    claimedCount: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = makeModelProxy("PromoCode", promoCodeSchema);
