const COMPANY_CONFIGS = {
  hkwin88: {
    id: "hkwin88",
    name: "HKWIN88",
    mongoUri: process.env.HKWIN88_MONGODB_URI,
    s3Config: {
      bucket: process.env.HKWIN88_S3_MAINBUCKET,
      accessKey: process.env.HKWIN88_S3_ACCESS_KEY,
      secretKey: process.env.HKWIN88_S3_SECRET_KEY,
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
