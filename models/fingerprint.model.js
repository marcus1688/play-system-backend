const mongoose = require("mongoose");
const { makeModelProxy } = require("../lib/makeModelProxy");
const moment = require("moment");

const fingerprintSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    username: {
      type: String,
      required: true,
    },
    visitorId: {
      type: String,
      required: true,
      index: true,
    },
    requestId: String,
    browserName: String,
    browserVersion: String,
    confidence: {
      revision: String,
      score: Number,
    },
    device: String,
    firstSeenAt: {
      global: Date,
      subscription: Date,
    },
    incognito: Boolean,
    ip: String,
    lastSeenAt: {
      global: Date,
      subscription: Date,
    },
    meta: {
      version: String,
    },
    os: String,
    osVersion: String,
    visitorFound: Boolean,
    cacheHit: Boolean,
    isDuplicateAttempt: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: {
      currentTime: () => moment().utc().toDate(),
    },
  }
);

module.exports = makeModelProxy("Fingerprint", fingerprintSchema);
