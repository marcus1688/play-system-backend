const mongoose = require("mongoose");
const { makeModelProxy } = require("../lib/makeModelProxy");

const BlogSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    titleCN: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    descriptionCN: {
      type: String,
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    contentCN: {
      type: String,
    },
    metaTitle: {
      type: String,
    },
    metaTitleCN: {
      type: String,
    },
    metaDescription: {
      type: String,
    },
    metaDescriptionCN: {
      type: String,
    },
    image: {
      type: String,
      required: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
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

module.exports = makeModelProxy("blog", BlogSchema);
