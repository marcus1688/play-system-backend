const express = require("express");
const router = express.Router();
const twilio = require("twilio");
const rateLimit = require("express-rate-limit");
const email = require("../models/email.model");
const { authenticateAdminToken } = require("../auth/adminAuth");
const { authenticateToken } = require("../auth/auth");
const { adminUser } = require("../models/adminuser.model");
const { User } = require("../models/users.model");
const bcrypt = require("bcrypt");
const sgMail = require("@sendgrid/mail");

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const verifySid = process.env.TWILIO_VERIFY_SID;
const client = twilio(accountSid, authToken);
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const perMinuteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  message: {
    success: false,
    message: "Please wait 60 seconds between attempts",
  },
  keyGenerator: (req) => {
    return req.body.email || req.ip;
  },
  onLimited: (req) => {
    console.log(
      `[${new Date().toISOString()}] Minute limit exceeded - IP: ${
        req.ip
      }, Email: ${req.body.email}`
    );
  },
});

const hourlyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 6,
  message: {
    success: false,
    message: "Hourly attempt limit reached, please try again later",
  },
  keyGenerator: (req) => {
    return req.body.email || req.ip;
  },
});

const dailyLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: "Daily attempt limit reached, please try again tomorrow",
  },
  keyGenerator: (req) => {
    return req.body.email || req.ip;
  },
});

// User Send Email Verification
router.post(
  "/api/send-email-verification",
  authenticateToken,
  perMinuteLimiter,
  hourlyLimiter,
  dailyLimiter,
  async (req, res) => {
    try {
      const { email: userEmail, purpose } = req.body;
      if (!userEmail) {
        console.log("Email is missing in the request.");
        return res.status(200).json({
          success: false,
          message: {
            en: "Email is required",
            zh: "请填写邮箱地址",
            ms: "E-mel diperlukan",
          },
        });
      }

      const normalizedEmail = userEmail.toLowerCase().trim();
      const existingUser = await User.findOne({ email: normalizedEmail });

      if (purpose === "password_reset") {
        if (!existingUser) {
          return res.status(200).json({
            success: false,
            message: {
              en: "Email address is not registered in our system.",
              zh: "该邮箱未在系统中注册。",
              ms: "Alamat e-mel tidak didaftarkan dalam sistem kami.",
            },
          });
        }
      } else {
        if (existingUser) {
          return res.status(200).json({
            success: false,
            message: {
              en: "Email address is already registered. Please use a different email.",
              zh: "电子邮箱已被注册。请使用其他邮箱。",
              ms: "Alamat e-mel sudah didaftarkan. Sila gunakan e-mel yang berbeza.",
            },
          });
        }
      }

      const emailSettings = await email.findOne();
      if (!emailSettings || !emailSettings.status) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Email service is currently disabled",
            zh: "邮箱验证服务当前不可用",
            ms: "Perkhidmatan e-mel kini dimatikan",
          },
        });
      }
      if (emailSettings.balance < emailSettings.pricing) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Insufficient email balance",
            zh: "邮件余额不足",
            ms: "Baki e-mel tidak mencukupi",
          },
        });
      }
      const verification = await client.verify.v2
        .services(verifySid)
        .verifications.create({
          to: userEmail,
          channel: "email",
        });
      if (verification.status === "pending") {
        await email.findOneAndUpdate(
          {},
          { $inc: { balance: -emailSettings.pricing } },
          { new: true }
        );
      }
      res.status(200).json({
        success: verification.status === "pending",
        status: verification.status,
        message: {
          en: "Verification code sent successfully",
          zh: "验证码已成功发送",
          ms: "Kod pengesahan telah berjaya dihantar",
        },
      });
    } catch (error) {
      console.error("Error sending email verification:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error sending verification email",
          zh: "发送验证邮件时出错",
          ms: "Ralat menghantar e-mel pengesahan",
        },
        error: error.message,
      });
    }
  }
);

// User Verify Email Code
router.post("/api/verify-email", authenticateToken, async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Email and verification code are required",
          zh: "邮箱和验证码都是必填项",
          ms: "E-mel dan kod pengesahan diperlukan",
        },
      });
    }
    const userId = req.user.userId;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(200).json({
        success: false,
        message: {
          en: "User not found",
          zh: "未找到用户",
          ms: "Pengguna tidak dijumpai",
        },
      });
    }
    const verificationCheck = await client.verify.v2
      .services(verifySid)
      .verificationChecks.create({
        to: email,
        code: code,
      });
    if (verificationCheck.valid) {
      user.email = email;
      user.isEmailVerified = true;
      await user.save();
    }
    res.status(200).json({
      success: verificationCheck.valid,
      status: verificationCheck.status,
      valid: verificationCheck.valid,
      userUpdated: verificationCheck.valid,
      message: {
        en: verificationCheck.valid
          ? "Code verified successfully and email verified"
          : "Invalid verification code",
        zh: verificationCheck.valid
          ? "验证码验证成功，邮箱已验证"
          : "验证码无效",
        ms: verificationCheck.valid
          ? "Kod disahkan dengan jayanya dan e-mel disahkan"
          : "Kod pengesahan tidak sah",
      },
    });
  } catch (error) {
    console.error("Error verifying code:", error);
    res.status(500).json({
      success: false,
      message: {
        en: "Error verifying code",
        zh: "验证码验证出错",
        ms: "Ralat mengesahkan kod",
      },
    });
  }
});

// User Get Email Status
router.get("/api/email-status", async (req, res) => {
  try {
    const emailSettings = await email.findOne();
    if (!emailSettings) {
      return res.status(200).json({
        success: true,
        status: false,
      });
    }
    res.status(200).json({
      success: true,
      status: emailSettings.status,
    });
  } catch (error) {
    console.error("Error fetching email status:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching email status",
      error: error.message,
    });
  }
});

// User Reset Password by Email
router.post("/api/reset-password-email", async (req, res) => {
  try {
    const { email, isVerified, newPassword, confirmPassword } = req.body;
    if (!newPassword || !confirmPassword) {
      return res.status(200).json({
        success: false,
        message: {
          en: "New password are required",
          zh: "新密码是必填项",
        },
      });
    }
    if (!isVerified) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Email verification is required before password reset",
          zh: "重置密码前需要验证邮箱",
        },
      });
    }
    if (newPassword.length < 8) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Password must be at least 8 characters long",
          zh: "密码长度必须至少为8个字符",
        },
      });
    }
    if (newPassword !== confirmPassword) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Passwords do not match",
          zh: "输入的密码不匹配",
        },
      });
    }
    const user = await User.findOne({
      email: email,
      isEmailVerified: true,
    });
    if (!user) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Verified user not found with this email",
          zh: "未找到该邮箱对应的已验证用户",
        },
      });
    }
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    user.password = hashedPassword;
    await user.save();
    res.status(200).json({
      success: true,
      message: {
        en: "Password has been reset successfully",
        zh: "密码重置成功",
      },
    });
  } catch (error) {
    console.error("Error resetting password:", error);
    res.status(500).json({
      success: false,
      message: {
        en: "Error resetting password",
        zh: "重置密码时出错",
      },
    });
  }
});

// User Validate Email (for change password)
router.post(
  "/api/check-user-email",
  perMinuteLimiter,
  hourlyLimiter,
  dailyLimiter,
  async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Email is required",
            zh: "请填写邮箱地址",
          },
        });
      }
      const verifiedUser = await User.findOne({
        email: email,
        isEmailVerified: true,
      });

      if (!verifiedUser) {
        const anyUser = await User.findOne({ email: email });
        if (!anyUser) {
          return res.status(200).json({
            success: false,
            message: {
              en: "Email not found",
              zh: "未找到该邮箱",
            },
          });
        } else {
          return res.status(200).json({
            success: false,
            message: {
              en: "Email not verified, please verify your email first",
              zh: "邮箱未验证，请先验证您的邮箱",
            },
          });
        }
      }

      return res.status(200).json({
        success: true,
        message: {
          en: "Email found and verified",
          zh: "邮箱已找到且已验证",
        },
      });
    } catch (error) {
      console.error(
        `[${new Date().toISOString()}] Error checking email: ${error.message}`
      );
      return res.status(500).json({
        success: false,
        message: {
          en: "An error occurred while checking email",
          zh: "检查邮箱时发生错误",
        },
      });
    }
  }
);

// Admin Get Email Balance
router.get(
  "/admin/api/email-balance",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const emailSettings = await email.findOne();
      if (!emailSettings) {
        return res.status(200).json({
          success: true,
          message: {
            en: "Email balance retrieved",
            zh: "邮件余额查询成功",
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
          en: "Email balance retrieved",
          zh: "邮件余额查询成功",
        },
        data: {
          balance: emailSettings.balance,
          status: emailSettings.status,
          minBalance: emailSettings.minBalance,
        },
      });
    } catch (error) {
      console.error("Error fetching email balance:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error fetching email balance",
          zh: "获取邮件余额时出错",
        },
      });
    }
  }
);

// Admin Update Email Balance
router.put(
  "/admin/api/email-balance",
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
            zh: "您没有执行此操作的权限",
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

      const currentEmail = await email.findOne({});
      const currentBalance = currentEmail ? currentEmail.balance : 0;

      if (operation === "subtract" && amount > currentBalance) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Amount exceeds current balance",
            zh: "金额超过当前余额",
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
            zh: "余额不能为负数",
          },
        });
      }

      const emailSettings = await email.findOneAndUpdate(
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
          zh: `成功${operation === "add" ? "增加" : "减少"}余额`,
        },
        data: {
          balance: emailSettings.balance,
          status: emailSettings.status,
        },
      });
    } catch (error) {
      console.error("Error updating email balance:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Internal server error",
          zh: "服务器内部错误",
        },
      });
    }
  }
);

// Admin Update Email Status
router.put(
  "/admin/api/email-status",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const emailSettings = await email.findOne();
      if (!emailSettings) {
        const newSettings = await email.create({
          balance: 0,
          status: true,
          minBalance: 0,
        });
        return res.status(200).json({
          success: true,
          message: {
            en: "Email service activated",
            zh: "邮件服务已激活",
          },
          data: {
            balance: newSettings.balance,
            status: newSettings.status,
          },
        });
      }
      emailSettings.status = !emailSettings.status;
      await emailSettings.save();
      res.status(200).json({
        success: true,
        message: {
          en: `Email service ${
            emailSettings.status ? "activated" : "deactivated"
          }`,
          zh: `邮件服务已${emailSettings.status ? "激活" : "停用"}`,
        },
        data: {
          balance: emailSettings.balance,
          status: emailSettings.status,
        },
      });
    } catch (error) {
      console.error("Error toggling email status:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Internal server error",
          zh: "服务器内部错误",
        },
      });
    }
  }
);

// Admin Update Min Balance
router.put(
  "/admin/api/email-min-balance",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { minBalance } = req.body;
      const emailSettings = await email.findOne();
      if (!emailSettings) {
        const newSettings = new email({
          balance: 0,
          status: false,
          minBalance: minBalance,
        });
        await newSettings.save();
      } else {
        emailSettings.minBalance = minBalance;
        await emailSettings.save();
      }
      return res.status(200).json({
        success: true,
        message: {
          en: "Minimum balance set successfully",
          zh: "最低余额已设置成功",
        },
      });
    } catch (error) {
      console.error("Error updating email minimum balance:", error);
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

// Admin Get Email Pricing
router.get(
  "/admin/api/email-pricing",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const emailSettings = await email.findOne();
      if (!emailSettings) {
        return res.status(200).json({
          success: true,
          message: {
            en: "No pricing settings found, using default value",
            zh: "未找到价格设置，使用默认值",
          },
          data: {
            pricing: 0,
          },
        });
      }
      res.status(200).json({
        success: true,
        message: {
          en: "Pricing data retrieved successfully",
          zh: "价格数据获取成功",
        },
        data: {
          pricing: emailSettings.pricing,
        },
      });
    } catch (error) {
      console.error("Error fetching email pricing:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Internal server error",
          zh: "服务器内部错误",
        },
      });
    }
  }
);

// Admin Update Email Pricing
router.put(
  "/admin/api/email-pricing",
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
            zh: "您没有执行此操作的权限",
          },
        });
      }
      const { pricing } = req.body;
      if (typeof pricing !== "number" || pricing < 0) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Invalid pricing value",
            zh: "无效的价格值",
          },
        });
      }
      const emailSettings = await email.findOneAndUpdate(
        {},
        { pricing },
        { upsert: true, new: true }
      );
      res.status(200).json({
        success: true,
        message: {
          en: "Pricing updated successfully",
          zh: "价格更新成功",
        },
        data: {
          pricing: emailSettings.pricing,
        },
      });
    } catch (error) {
      console.error("Error updating email pricing:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Internal server error",
          zh: "服务器内部错误",
        },
      });
    }
  }
);

// Send Custom Mail Function
const sendDepositSuccessEmail = async (
  userEmail,
  userName,
  amount,
  currency,
  txId
) => {
  try {
    const emailSettings = await email.findOne();
    if (!emailSettings || !emailSettings.status) {
      console.log(`[${new Date().toISOString()}] Email service is disabled`);
      return {
        success: false,
        message: {
          en: "Email service is currently disabled",
          zh: "邮箱服务当前不可用",
        },
      };
    }
    if (emailSettings.balance < emailSettings.pricing) {
      console.log(`[${new Date().toISOString()}] Insufficient email balance`);
      return {
        success: false,
        message: {
          en: "Insufficient email balance",
          zh: "邮件余额不足",
        },
      };
    }
    const msg = {
      to: userEmail,
      from: {
        email: process.env.SENDGRID_SENDER_EMAIL,
        name: process.env.SENGRID_COMPANY_NAME,
      },
      templateId: process.env.SENDGRID_DEPOSIT_TEMPLATE_ID,
      dynamicTemplateData: {
        name: userName,
        amount: amount,
        currency: currency,
        txId: txId,
        date: new Date().toLocaleString("en-AU", {
          timeZone: "Australia/Sydney",
        }),
        accountUrl: process.env.SENGRID_ACCOUNT_URL,
      },
    };
    await sgMail.send(msg);
    await email.findOneAndUpdate(
      {},
      { $inc: { balance: -emailSettings.pricing } },
      { new: true }
    );
    return {
      success: true,
      message: {
        en: "Deposit confirmation email sent successfully",
        zh: "存款确认邮件发送成功",
      },
    };
  } catch (error) {
    console.error("Error sending deposit email:", error);
    if (error.response && error.response.body && error.response.body.errors) {
      console.error(
        "SendGrid error details:",
        JSON.stringify(error.response.body.errors)
      );
    }
    return {
      success: false,
      message: {
        en: "Error sending deposit confirmation email",
        zh: "发送存款确认邮件时出错",
      },
      error: error.message,
    };
  }
};

// Test Custom Mail Function
router.post("/api/send-deposit-email", async (req, res) => {
  try {
    const result = await sendDepositSuccessEmail(
      "marioheng1688@gmail.com",
      "Valued Customer",
      "100",
      "AUD",
      "123"
    );

    if (result.success) {
      return res.status(200).json({
        success: true,
        message: {
          en: "Deposit confirmation email sent successfully",
          zh: "存款确认邮件发送成功",
        },
      });
    } else {
      return res.status(200).json({
        success: false,
        message: result.message,
        error: result.error,
      });
    }
  } catch (error) {
    console.error(
      `[${new Date().toISOString()}] Error in deposit email API:`,
      error
    );
    return res.status(500).json({
      success: false,
      message: {
        en: "Error sending deposit email",
        zh: "发送存款邮件时出错",
      },
      error: error.message,
    });
  }
});

module.exports = router;
