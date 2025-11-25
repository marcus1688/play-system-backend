const mongoose = require("mongoose");
const { makeModelProxy } = require("../lib/makeModelProxy");

const promotionSchema = new mongoose.Schema(
  {
    maintitle: String,
    maintitleEN: String,
    maintitleMS: String,
    description: String,
    descriptionEN: String,
    promotionimage: String,
    promotionimage2: String,
    promotionimage3: String,
    categories: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "PromotionCategory",
      },
    ],
    content: String,
    contentEN: String,
    contentMS: String,
    status: Boolean,
    highlight: Boolean,
    highlightAfterLogin: Boolean,
    claimfrequency: String,
    claimcount: Number,
    mindeposit: {
      type: Number,
      default: 0,
    },
    maxwithdraw: {
      type: Number,
      default: 0,
    },
    claimtype: {
      type: String,
      enum: {
        values: ["claimtype", "Percentage", "Exact"],
      },
      default: "claimtype",
    },
    bonuspercentage: {
      type: Number,
      default: 0,
    },
    bonusexact: {
      type: Number,
      default: 0,
    },
    maxbonus: {
      type: Number,
      default: 0,
    },
    TnC: {
      type: [String],
      default: [],
    },
    TnCEN: {
      type: [String],
      default: [],
    },
    exampleTitle: String,
    exampleTitleEN: String,
    exampleDescription: {
      type: [String],
      default: [],
    },
    isDeposit: {
      type: Boolean,
      default: false,
    },
    withdrawtype: String,
    turnoverrequiremnt: Number,
    winloserequirement: Number,
    exampleDescriptionEN: {
      type: [String],
      default: [],
    },
    withdrawConditionTitle: String,
    withdrawConditionTitleEN: String,
    withdrawConditionDescription: {
      type: [String],
      default: [],
    },
    withdrawConditionDescriptionEN: {
      type: [String],
      default: [],
    },
    allowedGameDatabaseNames: {
      type: [String],
      default: [],
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

module.exports = makeModelProxy("promotion", promotionSchema);
