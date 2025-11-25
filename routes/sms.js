const express = require("express");
const router = express.Router();
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const verifySid = process.env.TWILIO_VERIFY_SID;
const mainAccountSid = process.env.TWILIO_MAIN_ACCOUNT_SID;
const mainAuthToken = process.env.TWILIO_MAIN_AUTH_TOKEN;
const client = require("twilio")(accountSid, authToken);
const mainClient = require("twilio")(mainAccountSid, mainAuthToken);
const smspricing = require("../models/smspricing.model");
const sms = require("../models/sms.model");
const { authenticateAdminToken } = require("../auth/adminAuth");
const { adminUser } = require("../models/adminuser.model");
const { User } = require("../models/users.model");
const rateLimit = require("express-rate-limit");
const OpenApi = require("@alicloud/openapi-client");
const Captcha20230305 = require("@alicloud/captcha20230305").default;

const Prelude = require("@prelude.so/sdk");
const PRELUDE_API_KEY = process.env.PRELUDE_API_KEY;
const preludeClient = new Prelude({ apiToken: PRELUDE_API_KEY });

const perMinuteLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 3,
  message: {
    success: false,
    message: "Please wait 60 seconds between attempts",
  },
  keyGenerator: (req) => {
    return req.body.phoneNumber || req.ip;
  },
  onLimited: (req) => {
    console.log(
      `[${new Date().toISOString()}] Minute limit exceeded - IP: ${
        req.ip
      }, Phone: ${req.body.phoneNumber}`
    );
  },
});

const hourlyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1小时
  max: 6,
  message: {
    success: false,
    message: "Hourly attempt limit reached, please try again later",
  },
  keyGenerator: (req) => {
    return req.body.phoneNumber || req.ip;
  },
  onLimited: (req) => {
    console.log(
      `[${new Date().toISOString()}] Daily limit exceeded - IP: ${
        req.ip
      }, Phone: ${req.body.phoneNumber}`
    );
  },
});

const dailyLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24小时
  max: 10,
  message: {
    success: false,
    message: "Daily attempt limit reached, please try again tomorrow",
  },
  keyGenerator: (req) => {
    return req.body.phoneNumber || req.ip;
  },
  onLimited: (req) => {
    console.log(
      `[${new Date().toISOString()}] Hourly limit exceeded - IP: ${
        req.ip
      }, Phone: ${req.body.phoneNumber}`
    );
  },
});

router.post("/api/verify-captcha", async (req, res) => {
  try {
    const { captchaVerifyParam } = req.body;
    if (!captchaVerifyParam) {
      return res.status(400).json({
        success: false,
        message: {
          en: "CAPTCHA parameter is required",
          zh: "需要验证码参数",
          ms: "Parameter CAPTCHA diperlukan",
        },
      });
    }
    try {
      const config = new OpenApi.Config({});
      config.accessKeyId = process.env.ALIYUN_ACCESS_KEY_ID;
      config.accessKeySecret = process.env.ALIYUN_ACCESS_KEY_SECRET;
      config.endpoint = "captcha.ap-southeast-1.aliyuncs.com";
      config.connectTimeout = 5000;
      config.readTimeout = 5000;
      const captchaClient = new Captcha20230305(config);
      const request = {};
      request.sceneId = process.env.ALIYUN_CAPTCHA_SCENE_ID;
      request.captchaVerifyParam = captchaVerifyParam;
      const captchaResp = await captchaClient.verifyIntelligentCaptcha(request);
      return res.status(200).json({
        success: true,
        result: {
          verifyResult: captchaResp.body.result.verifyResult,
          verifyCode: captchaResp.body.result.verifyCode,
        },
        message: {
          en: captchaResp.body.result.verifyResult
            ? "CAPTCHA verification successful"
            : "CAPTCHA verification failed",
          zh: captchaResp.body.result.verifyResult
            ? "验证码验证成功"
            : "验证码验证失败",
          ms: captchaResp.body.result.verifyResult
            ? "Pengesahan CAPTCHA berjaya"
            : "Pengesahan CAPTCHA gagal",
        },
      });
    } catch (captchaError) {
      console.error("CAPTCHA verification error:", captchaError);
      return res.status(500).json({
        success: false,
        message: {
          en: "Error verifying CAPTCHA",
          zh: "验证验证码时出错",
          ms: "Ralat mengesahkan CAPTCHA",
        },
      });
    }
  } catch (error) {
    console.error("Error in verify-captcha endpoint:", error);
    return res.status(500).json({
      success: false,
      message: {
        en: "Server error",
        zh: "服务器错误",
        ms: "Ralat pelayan",
      },
    });
  }
});

// User Send Otp
router.post(
  "/api/send-otp",
  perMinuteLimiter,
  hourlyLimiter,
  dailyLimiter,
  async (req, res) => {
    try {
      const { phoneNumber } = req.body;
      if (!phoneNumber) {
        console.log("Phone number is missing in the request.");
        return res.status(200).json({
          success: false,
          message: {
            en: "Phone number is required",
            zh: "手机号码是必填项",
            zh_hk: "手機號碼係必填項",
            ms: "Nombor telefon diperlukan",
            id: "Nomor telepon diperlukan",
          },
        });
      }

      const smsSettings = await sms.findOne({});
      const pricingSettings = await smspricing.findOne({});
      if (!smsSettings || !pricingSettings) {
        return res.status(200).json({
          success: false,
          message: {
            en: "SMS service not configured",
            zh: "短信服务未配置",
            zh_hk: "短訊服務未配置",
            ms: "Perkhidmatan SMS tidak dikonfigurasi",
            id: "Layanan SMS tidak dikonfigurasi",
          },
        });
      }
      if (!smsSettings.status) {
        return res.status(200).json({
          success: false,
          message: {
            en: "SMS service is currently disabled",
            zh: "短信服务当前不可用",
            zh_hk: "短訊服務目前不可用",
            ms: "Perkhidmatan SMS kini dimatikan",
            id: "Layanan SMS saat ini dinonaktifkan",
          },
        });
      }
      if (smsSettings.balance < pricingSettings.pricing) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Insufficient SMS balance",
            zh: "短信余额不足",
            zh_hk: "短訊餘額不足",
            ms: "Baki SMS tidak mencukupi",
            id: "Saldo SMS tidak mencukupi",
          },
        });
      }

      // Format the phone number to ensure it has the "+" prefix
      const formattedNumber = phoneNumber.startsWith("+852")
        ? phoneNumber
        : `+852${phoneNumber}`;

      const verifyNumber = phoneNumber.startsWith("852")
        ? phoneNumber
        : `852${phoneNumber}`;

      const existingUser = await User.findOne({ phonenumber: verifyNumber });
      if (existingUser) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Phone number is already registered. Please use a different number",
            zh: "手机号码已被注册，请使用其他号码",
            zh_hk: "手機號碼已被註冊，請使用其他號碼",
            ms: "Nombor telefon sudah didaftarkan. Sila gunakan nombor yang berbeza",
            id: "Nomor telepon sudah terdaftar. Silakan gunakan nomor yang berbeda",
          },
        });
      }

      // console.log("Sending OTP to phone number:", formattedNumber);

      try {
        const verification = await preludeClient.verification.create({
          target: {
            type: "phone_number",
            value: formattedNumber,
          },
        });

        if (verification && verification.id) {
          await sms.findOneAndUpdate(
            {},
            { $inc: { balance: -pricingSettings.pricing } },
            { new: true }
          );
          // console.log("Prelude API Response:", JSON.stringify(verification));
          res.status(200).json({
            success: true,
            status: "pending",
            verificationId: verification.id,
            message: {
              en: "Verification code sent successfully",
              zh: "验证码发送成功",
              zh_hk: "驗證碼發送成功",
              ms: "Kod pengesahan berjaya dihantar",
              id: "Kode verifikasi berhasil dikirim",
            },
          });
        } else {
          throw new Error("Failed to get verification ID from Prelude");
        }
      } catch (preludeError) {
        console.error("Error sending OTP via Prelude:", preludeError);
        res.status(500).json({
          success: false,
          message: {
            en: "Error sending SMS verification code",
            zh: "发送短信验证码时出错",
            zh_hk: "發送短訊驗證碼時出錯",
            ms: "Ralat menghantar kod pengesahan SMS",
            id: "Error mengirim kode verifikasi SMS",
          },
        });
      }
    } catch (error) {
      console.error("Error sending OTP:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error sending SMS verification code",
          zh: "发送短信验证码时出错",
          zh_hk: "發送短訊驗證碼時出錯",
          ms: "Ralat menghantar kod pengesahan SMS",
          id: "Error mengirim kode verifikasi SMS",
        },
      });
    }
  }
);

// User Verify Otp
router.post("/api/verify-otp", async (req, res) => {
  try {
    const { phoneNumber, code, verificationId } = req.body;

    if (!phoneNumber || !code || !verificationId) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Phone number, verification code, and verification ID are required",
          zh: "手机号码、验证码和验证ID都是必填项",
          zh_hk: "手機號碼、驗證碼同驗證ID都係必填項",
          ms: "Nombor telefon, kod pengesahan, dan ID pengesahan diperlukan",
          id: "Nomor telepon, kode verifikasi, dan ID verifikasi diperlukan",
        },
      });
    }

    const formattedNumber = phoneNumber.startsWith("+852")
      ? phoneNumber
      : `+852${phoneNumber}`;

    try {
      const verificationCheck = await preludeClient.verification.check({
        id: verificationId,
        code: code,
        target: {
          type: "phone_number",
          value: formattedNumber,
        },
      });
      // console.log("Verification result:", JSON.stringify(verificationCheck));

      const isValid =
        verificationCheck && verificationCheck.status === "success";

      res.status(200).json({
        success: isValid,
        status: verificationCheck.status,
        valid: isValid,
        message: {
          en: isValid
            ? "Phone number verified successfully"
            : "Invalid verification code",
          zh: isValid ? "手机号码验证成功" : "验证码无效",
          zh_hk: isValid ? "手機號碼驗證成功" : "驗證碼無效",
          ms: isValid
            ? "Nombor telefon berjaya disahkan"
            : "Kod pengesahan tidak sah",
          id: isValid
            ? "Nomor telepon berhasil diverifikasi"
            : "Kode verifikasi tidak valid",
        },
      });
    } catch (preludeError) {
      console.error("Error verifying OTP via Prelude:", preludeError);
      res.status(500).json({
        success: false,
        message: {
          en: "Error verifying code",
          zh: "验证码验证出错",
          zh_hk: "驗證碼驗證出錯",
          ms: "Ralat mengesahkan kod",
          id: "Error memverifikasi kode",
        },
      });
    }
  } catch (error) {
    console.error("Error verifying OTP:", error);
    res.status(500).json({
      success: false,
      message: {
        en: "Error verifying code",
        zh: "验证码验证出错",
        zh_hk: "驗證碼驗證出錯",
        ms: "Ralat mengesahkan kod",
        id: "Error memverifikasi kode",
      },
    });
  }
});

// User Get SMS Status
router.get("/api/sms-status", async (req, res) => {
  try {
    const smsSettings = await sms.findOne();
    if (!smsSettings) {
      return res.status(200).json({
        success: true,
        status: false,
      });
    }
    res.status(200).json({
      success: true,
      status: smsSettings.status,
    });
  } catch (error) {
    console.error("Error fetching SMS status:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching SMS status",
      error: error.message,
    });
  }
});

// Admin Get SMS Pricing
router.get("/admin/api/sms-pricing", async (req, res) => {
  try {
    const preludePrice = 0.1;
    const ourPrice = (parseFloat(preludePrice) + 0.01).toFixed(4);
    await smspricing.findOneAndUpdate(
      {},
      { pricing: ourPrice },
      { upsert: true, new: true }
    );
    res.status(200).json({
      success: true,
      message: {
        en: "SMS pricing updated successfully",
        zh: "短信价格已获取成功",
      },
      Price: ourPrice,
      price_unit: "USD",
    });
  } catch (error) {
    console.error("Error fetching SMS pricing:", error);
    res.status(500).json({
      success: false,
      message: {
        en: "Error fetching SMS pricing",
        zh: "获取短信价格时出错",
      },
    });
  }
});

// Admin Get SMS Balance
router.get(
  "/admin/api/sms-balance",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const smsSettings = await sms.findOne();
      if (!smsSettings) {
        return res.status(200).json({
          success: true,
          message: {
            en: "SMS balance retrieved",
            zh: "短信余额查询成功",
          },
          data: {
            balance: 0,
            status: false,
            minBalance: 0,
          },
        });
      }
      res.status(200).json({
        success: true,
        message: {
          en: "SMS balance retrieved",
          zh: "短信余额查询成功",
        },
        data: {
          balance: smsSettings.balance,
          status: smsSettings.status,
          minBalance: smsSettings.minBalance,
        },
      });
    } catch (error) {
      console.error("Error fetching SMS balance:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error fetching SMS balance",
          zh: "获取短信余额时出错",
        },
      });
    }
  }
);

// Admin Update SMS Balance
router.put(
  "/admin/api/sms-balance",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const adminId = req.user.userId;
      const adminuser = await adminUser.findById(adminId);
      if (!adminuser) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Admin User not found, please contact customer service",
            zh: "未找到管理员用户，请联系客户服务",
          },
        });
      }
      if (adminuser.role !== "superadmin") {
        return res.status(200).json({
          success: false,
          message: {
            en: "You do not have permission to perform this action",
            zh: "您没有权限执行此操作",
          },
        });
      }
      const { operation, amount } = req.body;
      if (typeof amount !== "number") {
        return res.status(200).json({
          success: false,
          message: {
            en: "Amount must be a number",
            zh: "金额必须是数字",
          },
        });
      }
      if (!["add", "subtract"].includes(operation)) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Invalid operation type",
            zh: "无效的操作类型",
          },
        });
      }
      const currentSms = await sms.findOne({});
      const currentBalance = currentSms ? currentSms.balance : 0;
      if (operation === "subtract" && amount > currentBalance) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Amount exceeds current balance",
            zh: "金额超出当前余额",
          },
        });
      }
      const newBalance =
        operation === "add" ? currentBalance + amount : currentBalance - amount;
      if (newBalance < 0) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Balance cannot be negative",
            zh: "余额不能为负",
          },
        });
      }
      const smsSettings = await sms.findOneAndUpdate(
        {},
        { balance: newBalance },
        { upsert: true, new: true }
      );
      res.status(200).json({
        success: true,
        message: {
          en: `Successfully ${
            operation === "add" ? "added" : "subtracted"
          } balance`,
          zh: `余额已成功${operation === "add" ? "增加" : "减少"}`,
        },
        data: {
          balance: smsSettings.balance,
          status: smsSettings.status,
        },
      });
    } catch (error) {
      console.error("Error updating SMS balance:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error updating SMS balance",
          zh: "更新短信余额时出错",
        },
      });
    }
  }
);

// Admin Update SMS Status
router.put(
  "/admin/api/sms-status",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const smsSettings = await sms.findOne();
      if (!smsSettings) {
        const newSettings = await sms.create({
          balance: 0,
          status: true,
        });
        return res.status(200).json({
          success: true,
          message: {
            en: "SMS service activated",
            zh: "短信服务已激活",
          },
          data: {
            balance: newSettings.balance,
            status: newSettings.status,
          },
        });
      }
      smsSettings.status = !smsSettings.status;
      await smsSettings.save();
      res.status(200).json({
        success: true,
        message: {
          en: `SMS service ${smsSettings.status ? "activated" : "deactivated"}`,
          zh: `短信服务已${smsSettings.status ? "激活" : "停用"}`,
        },
        data: {
          balance: smsSettings.balance,
          status: smsSettings.status,
        },
      });
    } catch (error) {
      console.error("Error toggling SMS status:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error toggling SMS status",
          zh: "切换短信状态时出错",
        },
      });
    }
  }
);

// Admin Get Main Balance
router.get(
  "/admin/api/twilio-balance",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const adminId = req.user.userId;
      const adminuser = await adminUser.findById(adminId);
      if (!adminuser) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Admin user not found, please contact customer service",
            zh: "未找到管理员用户，请联系客户服务",
          },
        });
      }
      if (adminuser.role !== "superadmin") {
        return res.status(200).json({
          success: false,
          message: {
            en: "You do not have permission to perform this action",
            zh: "您没有执行此操作的权限",
          },
        });
      }
      const placeholderBalance = {
        currency: "USD",
        balance: 500.0,
      };
      res.status(200).json({
        success: true,
        message: {
          en: "Prelude balance retrieved successfully",
          zh: "Prelude 余额获取成功",
        },
        data: {
          currency: placeholderBalance.currency,
          balance: placeholderBalance.balance,
          account: PRELUDE_API_KEY ? "Connected" : "Not connected",
        },
      });
    } catch (error) {
      console.error("Error fetching Prelude balance:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error fetching Prelude balance",
          zh: "获取 Prelude 余额时出错",
        },
      });
    }
  }
);

// Admin Update Min Balance
router.put(
  "/admin/api/sms-min-balance",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { minBalance } = req.body;
      const smsSettings = await sms.findOne();
      if (!smsSettings) {
        const newSettings = new sms({
          balance: 0,
          status: false,
          minBalance: minBalance,
        });
        await newSettings.save();
      } else {
        smsSettings.minBalance = minBalance;
        await smsSettings.save();
      }
      res.status(200).json({
        success: true,
        message: {
          en: "Minimum balance updated successfully",
          zh: "最低余额更新成功",
        },
      });
    } catch (error) {
      console.error("Error updating SMS minimum balance:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error updating minimum balance",
          zh: "更新最低余额时出错",
        },
      });
    }
  }
);

module.exports = router;
