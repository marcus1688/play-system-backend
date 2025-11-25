const mongoose = require("mongoose");
const { makeModelProxy } = require("../lib/makeModelProxy");

const messageSchema = new mongoose.Schema(
  {
    sender: {
      type: String,
      enum: ["customer", "agent"],
      required: true,
    },
    senderName: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    attachments: [
      {
        type: String,
      },
    ],
  },
  { timestamps: true }
);

const feedbackSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    username: {
      type: String,
      required: true,
    },
    problemType: {
      type: String,
      required: true,
    },
    conversation: [messageSchema],
    description: {
      type: String,
      required: true,
    },
    images: [
      {
        type: String,
      },
    ],
    status: {
      type: Boolean,
      default: false,
    },
    lastSeenByUser: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = makeModelProxy("feedback", feedbackSchema);
