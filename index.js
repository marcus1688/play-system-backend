const express = require("express");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const http = require("http");
const crypto = require("crypto");
const { Server } = require("socket.io");
const WebSocket = require("ws");
const {
  clearCookie,
  authenticateToken,
  generateToken: userGenerateToken,
} = require("./auth/auth");

const {
  authenticateAdminToken,
  generateToken: adminGenerateToken,
} = require("./auth/adminAuth");
const COMPANY_CONFIGS = require("./config/companies");
const usersRouter = require("./routes/users");
const depositRouter = require("./routes/deposit");
const adminUserRouter = require("./routes/adminuser");
const myPromotionRouter = require("./routes/mypromotion");
const withdrawRouter = require("./routes/withdraw");
const banklistRouter = require("./routes/banklist");
const userbanklistRouter = require("./routes/userbanklist");
const carouselRouter = require("./routes/carousel");
const BankTransactionLogRouter = require("./routes/banktransactionlog");
const UserWalletLogRouter = require("./routes/userwalletlog");
const promotionRouter = require("./routes/promotion");
const vipRouter = require("./routes/vip");
const popUpRouter = require("./routes/popup");
const BonusRouter = require("./routes/bonus");
const LuckySpinRouter = require("./routes/luckyspin");
const InformationRouter = require("./routes/information");
const ReviewRouter = require("./routes/review");
const LeaderboardRouter = require("./routes/leaderboard");
const BlogRouter = require("./routes/blog");
const MailRouter = require("./routes/mail");
const AnnouncementRouter = require("./routes/announcement");
const AnnouncementCategoryRouter = require("./routes/announcementcategory");
const HelpRouter = require("./routes/help");
const FeedbackRouter = require("./routes/feedback");
const PromoCodeRouter = require("./routes/promocode");
const MemoRouter = require("./routes/memo");
const GeneralRouter = require("./routes/general");
const KioskCategoryRouter = require("./routes/kioskcategory");
const Kiosk = require("./routes/kiosk");
const PromotionCategoryRouter = require("./routes/promotioncategory");
const RebateScheduleRouter = require("./routes/rebateschedule");
const AgentRouter = require("./routes/agent");
const AgentLevelSystemRouter = require("./routes/agentlevelsystem");
const CheckInRouter = require("./routes/checkin");
const smsRouter = require("./routes/sms");
const emailRouter = require("./routes/email");
const LuckySpinSettingRouter = require("./routes/luckyspinsetting");
const SEORouter = require("./routes/seo");
const PaymentGatewayRouter = require("./routes/paymentgateway");
const WhitelistIPRouter = require("./routes/whitelistip");
const KioskBalanceRouter = require("./routes/kioskbalance");
const CryptoRouter = require("./routes/cryptowallet");
const VultrRouter = require("./routes/vultr");
const AgentPTRouter = require("./routes/agentpt");
const FreeCreditRouter = require("./routes/freecredit");
const FacebookRouter = require("./routes/facebook");
const adminListRouter = require("./routes/adminlist");
const notificationRouter = require("./routes/notification");
const fingerprintRouter = require("./routes/fingerprint");
const gamelistRouter = require("./routes/gamelist");
const liveTransactionRouter = require("./routes/transaction");
const { setConnForRequest, withConn } = require("./lib/dbContext");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const cookie = require("cookie");
const Deposits = require("./models/deposit.model");
const Withdraw = require("./models/withdraw.model");
const { User } = require("./models/users.model");
const { adminUser, adminLog } = require("./models/adminuser.model");
const Mail = require("./models/mail.model");
const email = require("./models/email.model");
const { updateKioskBalance } = require("./services/kioskBalanceService");
const kioskbalance = require("./models/kioskbalance.model");
const UserWalletLog = require("./models/userwalletlog.model");
const BankList = require("./models/banklist.model");
const BankTransactionLog = require("./models/banktransactionlog.model");
const { v4: uuidv4 } = require("uuid");
const jwt = require("jsonwebtoken");
const Bonus = require("./models/bonus.model");
const app = express();
const cron = require("node-cron");
const moment = require("moment");
const ipRangeCheck = require("ip-range-check");
const server = http.createServer(app);
const axios = require("axios");
const wss = new WebSocket.Server({ noServer: true });

let connectedUsers = [];
let connectedAdmins = [];
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");
const xss = require("xss-clean");
dotenv.config();

const COMPANY_DBS = {
  ae96: process.env.AE96_MONGODB_URI,
  demo: process.env.DEMO_MONGODB_URI,
  stash88: process.env.STASH88_MONGODB_URI,
  oc7: process.env.OC7_MONGODB_URI,
  ezwin9: process.env.EZWIN9_MONGODB_URI,
  jinlihui: process.env.JINLIHUI_MONGODB_URI,
  wantokplay: process.env.WANTOKPLAY_MONGODB_URI,
  localhost: process.env.LOCALHOST_MONGODB_URI,
  bm8my: process.env.BM8MY_MONGODB_URI,
  bm8sg: process.env.BM8SG_MONGODB_URI,
};

const allowedOrigins = [
  "https://mysteryclub88.com",
  "https://www.mysteryclub88.com",
  "capacitor://localhost",
  "ionic://localhost",
  "file://",
  ...(process.env.NODE_ENV === "development"
    ? ["http://localhost:3000", "http://localhost:3005"]
    : []),
];

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use((req, res, next) => {
  res.setHeader("Server", "nginx");
  next();
});
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);
app.use(
  express.json({
    limit: "10mb",
    verify: (req, res, buf) => {
      try {
        JSON.parse(buf);
      } catch (e) {
        const error = new Error("Invalid JSON");
        error.status = 400;
        throw error;
      }
    },
  })
);
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(mongoSanitize());

app.use((req, res, next) => {
  if (
    req.path.includes("/admin/api/seo-pages") &&
    (req.method === "POST" || req.method === "PUT")
  ) {
    return next();
  }
  const xssClean = require("xss-clean");
  return xssClean()(req, res, next);
});

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) {
        return callback(null, true);
      }
      if (allowedOrigins.indexOf(origin) !== -1) {
        return callback(null, true);
      }
      if (origin.includes("vercel.app")) {
        return callback(null, true);
      }
      if (origin === "https://localhost" || origin === "http://localhost") {
        return callback(null, true);
      }
      if (process.env.NODE_ENV === "development") {
        return callback(null, true);
      }
      console.log(`CORS blocked request from origin: ${origin}`);
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 Minutes
  max: 10000, // 1000 Request / IP
  message: "Too many requests, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: false,
  skipSuccessfulRequests: false,
  skip: (req, res) => req.path === "/health",
  handler: (req, res, next, options) => {
    const clientIp = req.headers["x-forwarded-for"] || req.ip;
    const clientIpTrimmed = clientIp.split(",")[0].trim();
    const origin = req.headers.origin || "Unknown";

    console.log(
      `Global Rate Limit Exceeded - IP: ${clientIpTrimmed}, Origin: ${origin}, Path: ${
        req.path
      }, Time: ${new Date().toISOString()}`
    );
    res.status(options.statusCode).send(options.message);
  },
});

app.use(globalLimiter);

const connections = {};

const initializeConnections = async () => {
  let dbsToConnect;
  if (process.env.NODE_ENV === "development") {
    const devCompany = process.env.DEV_COMPANY || "ezwin9";
    const devMongoUri = COMPANY_DBS[devCompany];
    if (!devMongoUri) {
      console.error(`❌ No MongoDB URI found for DEV_COMPANY: ${devCompany}`);
      process.exit(1);
    }
    dbsToConnect = { [devCompany]: devMongoUri };
    console.log(`🔧 Development mode - Connecting to: ${devCompany}`);
  } else {
    dbsToConnect = COMPANY_DBS;
  }

  const connectPromises = Object.entries(dbsToConnect).map(
    ([companyId, mongoUri]) => {
      if (!mongoUri) {
        console.warn(`⚠ No MongoDB URI for ${companyId}`);
        return Promise.resolve();
      }

      return new Promise((resolve) => {
        const conn = mongoose.createConnection(mongoUri, {
          maxPoolSize: 10,
          serverSelectionTimeoutMS: 5000,
          socketTimeoutMS: 45000,
        });

        conn.on("connected", () => {
          console.log(`✅ Connected to ${companyId} database`);
          connections[companyId] = conn;
          resolve();
        });

        conn.on("error", (err) => {
          console.error(`❌ Failed to connect to ${companyId}:`, err.message);
          resolve();
        });
      });
    }
  );

  await Promise.allSettled(connectPromises);

  if (process.env.NODE_ENV === "development") {
    console.log(
      `🔧 Running in DEVELOPMENT mode - Connected to ${
        process.env.DEV_COMPANY || "ezwin9"
      } DB`
    );
  } else {
    console.log("🚀 Running in PRODUCTION mode - All company DBs connected");
  }
};
const PORT = 4000;

initializeConnections()
  .then(() => {
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error("❌ Unexpected error during DB initialization:", err.message);
    server.listen(PORT, () =>
      console.log(`Server running on port ${PORT} (partial DB connections)`)
    );
  });

app.get("/", (req, res) => {
  res.status(403).send({
    error: "Access Forbidden",
    message: "You do not have permission to access this resource.",
  });
});

app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

app.use((req, res, next) => {
  let companyId = req.headers["x-company-id"];
  if (companyId === "localhost" && process.env.NODE_ENV === "development") {
    const devCompany = process.env.DEV_COMPANY || "ezwin9";
    companyId = devCompany;
    req.headers["x-company-id"] = devCompany;
  }
  const conn = connections[companyId];
  if (!conn) {
    console.error(`❌ No DB connection for ${companyId}`);
    return res.status(400).send(`No DB connection for ${companyId}`);
  }
  req.db = conn;
  withConn(conn, next);
});

app.use(express.static("public"));
app.use(usersRouter);
app.use(depositRouter);
app.use(adminUserRouter);
app.use(withdrawRouter);
app.use(banklistRouter);
app.use(userbanklistRouter);
app.use(carouselRouter);
app.use(BankTransactionLogRouter);
app.use(promotionRouter);
app.use(vipRouter);
app.use(UserWalletLogRouter);
app.use(popUpRouter);
app.use(BonusRouter);
app.use(LuckySpinRouter);
app.use(InformationRouter);
app.use(ReviewRouter);
app.use(LeaderboardRouter);
app.use(BlogRouter);
app.use(MailRouter);
app.use(AnnouncementRouter);
app.use(AnnouncementCategoryRouter);
app.use(HelpRouter);
app.use(FeedbackRouter);
app.use(PromoCodeRouter);
app.use(MemoRouter);
app.use(GeneralRouter);
app.use(KioskCategoryRouter);
app.use(Kiosk);
app.use(PromotionCategoryRouter);
app.use(RebateScheduleRouter);
app.use(AgentRouter);
app.use(AgentLevelSystemRouter);
app.use(CheckInRouter);
app.use(smsRouter);
app.use(emailRouter);
app.use(LuckySpinSettingRouter);
app.use(SEORouter);
app.use(PaymentGatewayRouter);
app.use(WhitelistIPRouter);
app.use(KioskBalanceRouter);
app.use(CryptoRouter);
app.use(VultrRouter);
app.use(AgentPTRouter);
app.use(FreeCreditRouter);
app.use(FacebookRouter);
app.use(adminListRouter);
app.use(notificationRouter);
app.use(myPromotionRouter);
app.use(fingerprintRouter);
app.use(gamelistRouter);
app.use(liveTransactionRouter);

app.use("*", (req, res) => {
  res.status(404).json({
    error: "Route not found",
    message: "请求的资源不存在",
  });
});

module.exports = wss;
