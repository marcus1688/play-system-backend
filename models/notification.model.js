const mongoose = require("mongoose");
const moment = require("moment");
const { makeModelProxy } = require("../lib/makeModelProxy");

const notificationSchema = new mongoose.Schema(
  {
    company: String,
    adminUsernames: [
      {
        type: String,
      },
    ],
    title: {
      type: String,
    },
    text: {
      type: String,
    },
    status: {
      type: String,
      enum: ["Active", "Inactive"],
      default: "Active",
    },
    lastPushBy: {
      type: String,
    },
    lastPushDate: {
      type: Date,
      default: Date.now,
    },
    lastPushLog: {
      type: String,
    },
    remarks: [
      {
        username: String,
        remark: String,
      },
    ],
    viewedBy: [
      {
        type: String,
      },
    ],
  },
  {
    timestamps: {
      currentTime: () => moment().utc().toDate(), // Ensure timestamps are stored in UTC
    },
  }
);

module.exports = makeModelProxy("notification", notificationSchema);
