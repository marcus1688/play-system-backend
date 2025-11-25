const COMPANY_CONFIGS = {
  ae96: {
    id: "ae96",
    name: "AE96",
    mongoUri: process.env.AE96_MONGODB_URI,
    s3Config: {
      bucket: process.env.AE96_S3_MAINBUCKET,
      accessKey: process.env.AE96_S3_ACCESS_KEY,
      secretKey: process.env.AE96_S3_SECRET_KEY,
    },
  },
  stash88: {
    id: "stash88",
    name: "Stash88",
    mongoUri: process.env.STASH88_MONGODB_URI,
    s3Config: {
      bucket: process.env.STASH88_S3_MAINBUCKET,
      accessKey: process.env.STASH88_S3_ACCESS_KEY,
      secretKey: process.env.STASH88_S3_SECRET_KEY,
    },
  },
  oc7: {
    id: "oc7",
    name: "OC7",
    mongoUri: process.env.OC7_MONGODB_URI,
    s3Config: {
      bucket: process.env.OC7_S3_MAINBUCKET,
      accessKey: process.env.OC7_S3_ACCESS_KEY,
      secretKey: process.env.OC7_S3_SECRET_KEY,
    },
  },
  ezwin9: {
    id: "ezwin9",
    name: "EzWin9",
    mongoUri: process.env.EZWIN9_MONGODB_URI,
    s3Config: {
      bucket: process.env.EZWIN9_S3_MAINBUCKET,
      accessKey: process.env.EZWIN9_S3_ACCESS_KEY,
      secretKey: process.env.EZWIN9_S3_SECRET_KEY,
    },
  },
  jinlihui: {
    id: "jinlihui",
    name: "Jinlihui",
    mongoUri: process.env.JINLIHUI_MONGODB_URI,
    s3Config: {
      bucket: process.env.JINLIHUI_S3_MAINBUCKET,
      accessKey: process.env.JINLIHUI_S3_ACCESS_KEY,
      secretKey: process.env.JINLIHUI_S3_SECRET_KEY,
    },
  },
  wantokplay: {
    id: "wantokplay",
    name: "WantokPlay",
    mongoUri: process.env.WANTOKPLAY_MONGODB_URI,
    s3Config: {
      bucket: process.env.WANTOKPLAY_S3_MAINBUCKET,
      accessKey: process.env.WANTOKPLAY_S3_ACCESS_KEY,
      secretKey: process.env.WANTOKPLAY_S3_SECRET_KEY,
    },
  },
  bm8my: {
    id: "bm8my",
    name: "bm8my",
    mongoUri: process.env.BM8MY_MONGODB_URI,
    s3Config: {
      bucket: process.env.BM8MY_S3_MAINBUCKET,
      accessKey: process.env.BM8MY_S3_ACCESS_KEY,
      secretKey: process.env.BM8MY_S3_SECRET_KEY,
    },
  },
  bm8sg: {
    id: "bm8sg",
    name: "bm8sg",
    mongoUri: process.env.BM8SG_MONGODB_URI,
    s3Config: {
      bucket: process.env.BM8SG_S3_MAINBUCKET,
      accessKey: process.env.BM8SG_S3_ACCESS_KEY,
      secretKey: process.env.BM8SG_S3_SECRET_KEY,
    },
  },
  demo: {
    id: "demo",
    name: "Demo",
    mongoUri: process.env.DEMO_MONGODB_URI,
    s3Config: {
      bucket: process.env.DEMO_S3_MAINBUCKET,
      accessKey: process.env.DEMO_S3_ACCESS_KEY,
      secretKey: process.env.DEMO_S3_SECRET_KEY,
    },
  },
  localhost: {
    id: "localhost",
    name: "Localhost",
    mongoUri:
      process.env.LOCALHOST_MONGODB_URI ||
      "mongodb://localhost:27017/localhost",
    s3Config: {
      bucket: process.env.LOCALHOST_S3_MAINBUCKET || "localhost-bucket",
      accessKey: process.env.LOCALHOST_S3_ACCESS_KEY,
      secretKey: process.env.LOCALHOST_S3_SECRET_KEY,
    },
  },
};

module.exports = COMPANY_CONFIGS;
