const mongoose = require("mongoose");
const { makeModelProxy } = require("../lib/makeModelProxy");

const kioskSchema = new mongoose.Schema(
  {
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "KioskCategory",
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    logo: String,
    icon: String,
    banner: String,
    apiLink: String,
    downloadUrl: String,
    iosDownloadUrl: String,
    androidDownloadUrl: String,
    changePasswordApi: String,
    transferInAPI: String,
    transferOutAPI: String,
    balanceAPI: String,
    adminCheckUserBalanceAPI: String,
    lockTransferInAPI: String,
    lockTransferOutAPI: String,
    lockGameAPI: String,
    yesterdayTurnoverWinlossAPI: String,
    todayTurnoverWinlossAPI: String,
    todayKioskReportAPI: String,
    yesterdayKioskReportAPI: String,
    transferAllBalanceAPI: String,
    transferBalanceAPI: String,
    registerGameAPI: String,
    databaseName: String,
    databaseGameID: String,
    databaseGamePassword: String,
    databasePastGameID: String,
    databasePastGamePassword: String,
    setAsMainAPI: String,
    gameListLink: String,
    backendLink: String,
    isActive: {
      type: Boolean,
      default: true,
    },
    isManualGame: {
      type: Boolean,
      default: false,
    },
    isHTMLGame: {
      type: Boolean,
      default: false,
    },
    isHotGame: {
      type: Boolean,
      default: false,
    },
    maintenance: {
      deactivateAt: Date,
      activateAt: Date,
      isMaintenanceActive: {
        type: Boolean,
        default: false,
      },
    },
  },
  { timestamps: true }
);

module.exports = makeModelProxy("Kiosk", kioskSchema);
