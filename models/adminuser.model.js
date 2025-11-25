const mongoose = require("mongoose");
const moment = require("moment");
const { roles } = require("../constants/permissions");
const { makeModelProxy } = require("../lib/makeModelProxy");

const adminuserSchema = new mongoose.Schema(
  {
    username: String,
    password: String,
    fullname: String,
    role: {
      type: String,
      required: true,
      enum: ["superadmin", ...roles.map((role) => role.value)],
    },
    permissions: [
      {
        module: {
          type: String,
          required: true,
        },
        actions: [
          {
            type: String,
            required: true,
          },
        ],
      },
    ],
    status: Boolean,
    lastLogin: {
      type: Date,
      default: null,
    },
    lastLoginIp: {
      type: String,
    },
    onlineStatus: {
      type: Boolean,
      default: false,
    },
    totalDepositProcessingTime: { type: Number, default: 0 },
    totalWithdrawalProcessingTime: { type: Number, default: 0 },
    depositTransactionCount: { type: Number, default: 0 },
    withdrawalTransactionCount: { type: Number, default: 0 },
    averageDepositProcessingTime: { type: String, default: "00:00:00" },
    averageWithdrawalProcessingTime: { type: String, default: "00:00:00" },
    totalRevertedDeposits: { type: Number, default: 0 },
    totalRevertedWithdrawals: { type: Number, default: 0 },
  },
  {
    timestamps: {
      currentTime: () => moment().utc().toDate(),
    },
  }
);

const logSchema = new mongoose.Schema(
  {
    username: {
      type: String,
    },
    fullname: {
      type: String,
    },
    ip: {
      type: String,
    },
    remark: {
      type: String,
    },
  },
  {
    timestamps: {
      currentTime: () => moment().utc().toDate(),
    },
    capped: { max: 300, autoIndexId: true },
  }
);

logSchema.index({ createdAt: -1 }, { expireAfterSeconds: 5260000 });

const adminLog = mongoose.model("adminLog", logSchema);
const adminUser = mongoose.model("adminUser", adminuserSchema);

module.exports = {
  adminUser: makeModelProxy("adminUser", adminuserSchema),
  adminLog: makeModelProxy("adminLog", logSchema),
};
