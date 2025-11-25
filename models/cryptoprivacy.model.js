const mongoose = require("mongoose");
const { makeModelProxy } = require("../lib/makeModelProxy");

const cryptoprivacySchema = new mongoose.Schema({
  xpub: { type: String },
});

module.exports = makeModelProxy("cryptoprivacy", cryptoprivacySchema);
