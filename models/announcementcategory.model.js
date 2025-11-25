const mongoose = require("mongoose");
const { makeModelProxy } = require("../lib/makeModelProxy");

const AnnouncementCategorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
  },
});

module.exports = makeModelProxy(
  "announcementcategory",
  AnnouncementCategorySchema
);
