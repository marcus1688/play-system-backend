const mongoose = require("mongoose");
const { makeModelProxy } = require("../lib/makeModelProxy");

const smsPricingSchema = new mongoose.Schema({
  pricing: Number,
});

module.exports = makeModelProxy("smspricing", smsPricingSchema);
