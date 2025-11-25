const mongoose = require("mongoose");
const { makeModelProxy } = require("../lib/makeModelProxy");

const indexSchema = new mongoose.Schema({
  name: { type: String, unique: true },
  currentIndex: { type: Number, default: 0 },
});

module.exports = makeModelProxy("Index", indexSchema);
