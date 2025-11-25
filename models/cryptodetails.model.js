const mongoose = require("mongoose");
const { makeModelProxy } = require("../lib/makeModelProxy");

const cryptodetailsSchema = new mongoose.Schema(
  {
    username: String,
    user_id: String,
    index: String,
    crypto_currency: String,
    crypto_active: Boolean,
    crypto_address: String,
    crypto_qrimage: String,
    crypto_customerid: String,
    crypto_accountid: String,
    private_key: String,
    usdt_balance: { type: Number, default: 0 },
    trx_balance: { type: Number, default: 0 },
  },
  {
    timestamps: {
      currentTime: () => Date.now() + 8 * 60 * 60 * 1000,
    },
  }
);

module.exports = makeModelProxy("cryptodetails", cryptodetailsSchema);
