const mongoose = require("mongoose");
const moment = require("moment");
const { makeModelProxy } = require("../lib/makeModelProxy");

const UserWalletLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    transactionid: String,
    transactiontime: { type: Date, default: Date.now },
    transactiontype: String,
    amount: String,
    status: String,
    promotionnameCN: String,
    promotionnameEN: String,
  },
  {
    timestamps: {
      currentTime: () => moment().utc().toDate(), // Ensure timestamps are stored in UTC
    },
  }
);

UserWalletLogSchema.index({ createdAt: -1 }, { expireAfterSeconds: 5260000 });

module.exports = makeModelProxy("Walletlog", UserWalletLogSchema);
