const mongoose = require("mongoose");
const { makeModelProxy } = require("../lib/makeModelProxy");

const contactSchema = new mongoose.Schema(
  {
    username: String,
    name: String,
    phonenumber: String,
    email: String,
  },
  {
    timestamps: true,
  }
);

module.exports = makeModelProxy("Contact", contactSchema);
