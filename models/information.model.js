const mongoose = require("mongoose");
const { makeModelProxy } = require("../lib/makeModelProxy");

const SectionSchema = new mongoose.Schema({
  title: {
    type: String,
    default: "",
  },
  description: {
    type: String,
    default: "",
  },
});

const InformationSchema = new mongoose.Schema(
  {
    companyprofileEN: [SectionSchema],
    companyprofileCN: [SectionSchema],
    enterprisespiritEN: [SectionSchema],
    enterprisespiritCN: [SectionSchema],
    termsofserviceEN: [SectionSchema],
    termsofserviceCN: [SectionSchema],
    pw66gamesEN: [SectionSchema],
    pw66gamesCN: [SectionSchema],
    sportslotteryinformationEN: [SectionSchema],
    sportslotteryinformationCN: [SectionSchema],
    gamesintroductionEN: [SectionSchema],
    gamesintroductionCN: [SectionSchema],
    lotteryintroductionEN: [SectionSchema],
    lotteryintroductionCN: [SectionSchema],
  },
  {
    timestamps: true,
  }
);

module.exports = makeModelProxy("information", InformationSchema);
