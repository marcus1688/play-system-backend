const mongoose = require("mongoose");
const { makeModelProxy } = require("../lib/makeModelProxy");

const announcementSchema = new mongoose.Schema(
  {
    titleEN: {
      type: String,
    },
    titleCN: {
      type: String,
    },
    titleMS: {
      type: String,
    },
    contentEN: {
      type: String,
    },
    contentCN: {
      type: String,
    },
    contentMS: {
      type: String,
    },
    category: {
      type: String,
      required: true,
    },
    isVisible: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = makeModelProxy("Announcement", announcementSchema);
