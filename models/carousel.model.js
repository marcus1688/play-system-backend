const mongoose = require("mongoose");
const moment = require("moment");
const { makeModelProxy } = require("../lib/makeModelProxy");

const carouselSchema = new mongoose.Schema({
  name: String,
  link: String,
  link2: String,
  link3: String,
  link4: String,
  link5: String,
  link6: String,
  status: Boolean,
  order: Number,
});

module.exports = makeModelProxy("carousel", carouselSchema);
