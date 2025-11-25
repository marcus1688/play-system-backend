const mongoose = require("mongoose");
const { makeModelProxy } = require("../lib/makeModelProxy");

const popUpSchema = new mongoose.Schema({
  company: String,
  titleCN: String,
  titleEN: String,
  titleMS: String,
  contentCN: String,
  contentEN: String,
  contentMS: String,
  status: Boolean,
  image: String,
});

module.exports = makeModelProxy("popUp", popUpSchema);
