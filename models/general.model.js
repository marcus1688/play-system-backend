const mongoose = require("mongoose");
const moment = require("moment");
const { makeModelProxy } = require("../lib/makeModelProxy");

const generalSchema = new mongoose.Schema(
  {
    company: String,
    logoimage: String,
    logogif: String,
    apkfile: String,
    apkversion: String,
    apkqrcode: String,
    country: String,
    website: String,
    welcomemessageCN: String,
    welcomemessageEN: String,
    announcementCN: String,
    announcementEN: String,
    announcementMS: String,
    referralCN: String,
    referralEN: String,
    telegram: String,
    wechat: String,
    video: [String],
    videotitleCN: String,
    videotitleEN: String,
    videodescriptionCN: String,
    videodescriptionEN: String,
    facebook: String,
    instagram: String,
    livechat: String,
    gmail: String,
    youtube: String,
    whatsapp: String,
    minDeposit: {
      type: Number,
      default: 0,
    },
    maxDeposit: {
      type: Number,
      default: 0,
    },
    minWithdraw: {
      type: Number,
      default: 0,
    },
    maxWithdraw: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: {
      currentTime: () => moment().utc().toDate(),
    },
  }
);

module.exports = makeModelProxy("general", generalSchema);
