const mongoose = require("mongoose");
const moment = require("moment");
const { makeModelProxy } = require("../lib/makeModelProxy");

const userbanklistScehma = new mongoose.Schema(
  {
    bankname: String,
    bankcode: String,
    remark: {
      type: String,
      default: "-",
    },
    logo: String,
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: {
      currentTime: () => moment().utc().toDate(),
    },
  }
);

module.exports = makeModelProxy("UserBankList", userbanklistScehma);
