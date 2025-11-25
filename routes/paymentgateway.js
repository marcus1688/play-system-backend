const express = require("express");
const router = express.Router();
const PaymentGateway = require("../models/paymentgateway.model");
const PaymentGatewayTransactionLog = require("../models/paymentgatewayTransactionLog.model");
const { authenticateAdminToken } = require("../auth/adminAuth");
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });
const { adminUser, adminLog } = require("../models/adminuser.model");
const { setConnForRequest } = require("../lib/dbContext");
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

async function uploadFileToS3(file) {
  const fileKey = `payment-gateway/${Date.now()}_${file.originalname}`;
  const uploadParams = {
    Bucket: process.env.S3_MAINBUCKET,
    Key: fileKey,
    Body: file.buffer,
    ContentType: file.mimetype,
  };
  await s3Client.send(new PutObjectCommand(uploadParams));
  return `https://${process.env.S3_MAINBUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`;
}

function getBucket(companyId) {
  const bucket = process.env[`S3_MAINBUCKET_${companyId}`];
  // console.log(`[getBucket] companyId: ${companyId}, bucket: ${bucket}`);
  return bucket;
}

const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

function getR2Bucket(companyId) {
  const bucket = process.env[`R2_BUCKET_NAME_${companyId}`];
  return bucket;
}

function getR2PublicId(companyId) {
  const publicId = process.env[`R2_PUBLIC_ID_${companyId}`];
  return publicId;
}

async function uploadFileToR2(file, companyId) {
  const bucket = getR2Bucket(companyId);
  const publicId = getR2PublicId(companyId);
  if (!bucket) throw new Error(`No R2 bucket configured for ${companyId}`);
  if (!publicId) throw new Error(`No R2 public ID configured for ${companyId}`);

  const fileKey = `payment-gateway/${Date.now()}_${file.originalname}`;
  const uploadParams = {
    Bucket: bucket,
    Key: fileKey,
    Body: file.buffer,
    ContentType: file.mimetype,
  };

  await r2Client.send(new PutObjectCommand(uploadParams));
  return `https://pub-${publicId}.r2.dev/${fileKey}`;
}

async function smartDeleteFile(fileUrl, companyId) {
  try {
    if (!fileUrl) return;

    if (
      fileUrl.includes("r2.dev") ||
      fileUrl.includes("r2.cloudflarestorage.com")
    ) {
      let fileKey;
      if (fileUrl.includes("r2.dev")) {
        const urlParts = fileUrl.split("r2.dev/");
        fileKey = urlParts[1];
      } else {
        const urlParts = fileUrl.split(".r2.cloudflarestorage.com/");
        const pathParts = urlParts[1].split("/");
        fileKey = pathParts.slice(1).join("/");
      }

      const bucket = getR2Bucket(companyId);
      if (!bucket) {
        console.log(`No R2 bucket configured for ${companyId}`);
        return;
      }

      await r2Client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: fileKey,
        })
      );
    } else {
      const key = fileUrl.split("/").slice(-2).join("/");
      const bucket = getBucket(companyId);
      if (bucket) {
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: bucket,
            Key: key,
          })
        );
      }
    }
  } catch (error) {
    console.error("Error deleting file:", error);
  }
}

router.use(async (req, res, next) => {
  try {
    setConnForRequest(req.db);
    const companyId = req.headers["x-company-id"];
    req.companyId = companyId;
    req.bucket = getBucket(companyId);
    req.r2Bucket = getR2Bucket(companyId);
    await PaymentGateway.findOne()
      .limit(1)
      .catch(() => {});
    next();
  } catch (error) {
    console.error("Middleware error:", error);
    res.status(500).json({
      success: false,
      message: {
        en: "Internal server error",
        zh: "服务器内部错误",
      },
      error: error.message,
    });
  }
});

// User Get Payment Gateways
router.get("/api/payment-gateways", async (req, res) => {
  try {
    const gateways = await PaymentGateway.find({ status: true }).sort({
      createdAt: -1,
    });
    res.json({
      success: true,
      data: gateways,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Admin Create Payment Gateway
router.post(
  "/admin/api/payment-gateways",
  authenticateAdminToken,
  upload.any(),
  async (req, res) => {
    setConnForRequest(req.db);
    try {
      const {
        name,
        paymentAPI,
        withdrawAPI,
        reportAPI,
        minDeposit,
        maxDeposit,
        minWithdraw,
        maxWithdraw,
        autowithdraw,
        remark,
        status,
        order,
        banks,
        availableBankCodes,
      } = req.body;

      let logoUrl = null;
      const logoFile = req.files?.find((file) => file.fieldname === "logo");
      if (logoFile) {
        logoUrl = await uploadFileToR2(logoFile, req.companyId);
      }

      let bankData = [];
      if (banks) {
        const banksArray = JSON.parse(banks);

        for (let i = 0; i < banksArray.length; i++) {
          const bank = banksArray[i];
          let bankImageUrl = null;
          const bankImageFile = req.files?.find(
            (file) => file.fieldname === `bankImage_${i}`
          );
          if (bankImageFile) {
            bankImageUrl = await uploadFileToR2(bankImageFile, req.companyId);
          }
          bankData.push({
            bankname: bank.bankname,
            bankcode: bank.bankcode,
            bankimage: bankImageUrl,
            minlimit: Number(bank.minlimit) || 0,
            maxlimit: Number(bank.maxlimit) || 0,
            active: bank.active !== undefined ? bank.active : true,
          });
        }
      }

      let bankCodesData = [];
      if (availableBankCodes) {
        const bankCodesArray = JSON.parse(availableBankCodes);
        bankCodesData = bankCodesArray.map((code) => ({
          bankname: code.bankname,
          bankcode: code.bankcode,
          active: code.active !== undefined ? code.active : true,
        }));
      }

      const gateway = new PaymentGateway({
        name,
        paymentAPI,
        withdrawAPI,
        reportAPI,
        minDeposit: Number(minDeposit),
        maxDeposit: Number(maxDeposit),
        minWithdraw: Number(minWithdraw),
        maxWithdraw: Number(maxWithdraw),
        remark,
        logo: logoUrl,
        status: status === "true",
        order: parseInt(order) || 0,
        banks: bankData,
        availableBankCodes: bankCodesData,
        autowithdraw: autowithdraw === "true" || autowithdraw === true,
      });

      await gateway.save();
      res.status(200).json({
        success: true,
        message: {
          en: "Payment gateway created successfully",
          zh: "支付网关创建成功",
          zh_hk: "支付網關創建成功",
          ms: "Gerbang pembayaran berjaya dicipta",
          id: "Gateway pembayaran berhasil dibuat",
        },
        data: gateway,
      });
    } catch (error) {
      console.error("Create error:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error creating payment gateway",
          zh: "创建支付网关时出错",
          zh_hk: "創建支付網關時出錯",
          ms: "Ralat mencipta gerbang pembayaran",
          id: "Kesalahan membuat gateway pembayaran",
        },
      });
    }
  }
);

// Admin Get Single Payment Gateway by ID
router.get(
  "/admin/api/payment-gateways/:id",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const gateway = await PaymentGateway.findById(req.params.id);

      if (!gateway) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Payment gateway not found",
            zh: "找不到支付网关",
          },
        });
      }

      res.status(200).json({
        success: true,
        data: gateway,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: {
          en: "Error fetching payment gateway",
          zh: "获取支付网关时出错",
        },
      });
    }
  }
);

// Admin Get All Payment Gateways
router.get(
  "/admin/api/payment-gateways",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const gateways = await PaymentGateway.find();
      const sortedGateways = gateways.sort((a, b) => {
        const orderA = a.order || 0;
        const orderB = b.order || 0;
        if (orderA === 0 && orderB !== 0) return 1;
        if (orderA !== 0 && orderB === 0) return -1;
        return orderA - orderB;
      });
      res.json({ success: true, data: sortedGateways });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// Admin Update Payment Gateway
router.put(
  "/admin/api/payment-gateways/:id",
  authenticateAdminToken,
  upload.any(),
  async (req, res) => {
    setConnForRequest(req.db);
    try {
      const {
        name,
        paymentAPI,
        withdrawAPI,
        reportAPI,
        minDeposit,
        maxDeposit,
        minWithdraw,
        maxWithdraw,
        remark,
        status,
        order,
        banks,
        availableBankCodes,
        autowithdraw,
      } = req.body;

      const updates = {
        name,
        paymentAPI,
        withdrawAPI,
        reportAPI,
        minDeposit: Number(minDeposit),
        maxDeposit: Number(maxDeposit),
        minWithdraw: Number(minWithdraw),
        maxWithdraw: Number(maxWithdraw),
        remark,
        status: status === "true",
        order: parseInt(order) || 0,
        autowithdraw: autowithdraw === "true" || autowithdraw === true,
      };

      const gateway = await PaymentGateway.findById(req.params.id);
      if (!gateway) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Payment gateway not found",
            zh: "找不到支付网关",
            zh_hk: "搵唔到支付網關",
            ms: "Gerbang pembayaran tidak ditemui",
            id: "Gateway pembayaran tidak ditemukan",
          },
        });
      }

      const logoFile = req.files?.find((file) => file.fieldname === "logo");
      if (logoFile) {
        if (gateway.logo) {
          await smartDeleteFile(gateway.logo, req.companyId);
        }
        updates.logo = await uploadFileToR2(logoFile, req.companyId);
      }

      if (banks !== undefined) {
        const banksArray = banks ? JSON.parse(banks) : [];
        if (gateway.banks && gateway.banks.length > 0) {
          const newBankImages = banksArray
            .map((bank) => bank.bankimage)
            .filter((img) => img);
          for (const oldBank of gateway.banks) {
            if (
              oldBank.bankimage &&
              !newBankImages.includes(oldBank.bankimage)
            ) {
              await smartDeleteFile(oldBank.bankimage, req.companyId);
            }
          }
        }

        let bankData = [];
        for (let i = 0; i < banksArray.length; i++) {
          const bank = banksArray[i];
          let bankImageUrl = bank.bankimage;
          const bankImageFile = req.files?.find(
            (file) => file.fieldname === `bankImage_${i}`
          );

          if (bankImageFile) {
            if (bank.bankimage) {
              await smartDeleteFile(bank.bankimage, req.companyId);
            }
            bankImageUrl = await uploadFileToR2(bankImageFile, req.companyId);
          }

          bankData.push({
            bankname: bank.bankname,
            bankcode: bank.bankcode,
            bankimage: bankImageUrl,
            minlimit: Number(bank.minlimit) || 0,
            maxlimit: Number(bank.maxlimit) || 0,
            active: bank.active !== undefined ? bank.active : true,
          });
        }
        updates.banks = bankData;
      }

      if (availableBankCodes !== undefined) {
        const bankCodesArray = availableBankCodes
          ? JSON.parse(availableBankCodes)
          : [];
        updates.availableBankCodes = bankCodesArray.map((code) => ({
          bankname: code.bankname,
          bankcode: code.bankcode,
          active: code.active !== undefined ? code.active : true,
        }));
      }

      const updatedGateway = await PaymentGateway.findByIdAndUpdate(
        req.params.id,
        updates,
        { new: true }
      );

      res.status(200).json({
        success: true,
        message: {
          en: "Payment gateway updated successfully",
          zh: "支付网关更新成功",
          zh_hk: "支付網關更新成功",
          ms: "Gerbang pembayaran berjaya dikemas kini",
          id: "Gateway pembayaran berhasil diperbarui",
        },
        data: updatedGateway,
      });
    } catch (error) {
      console.error("Update error:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error updating payment gateway",
          zh: "更新支付网关时出错",
          zh_hk: "更新支付網關時出錯",
          ms: "Ralat mengemaskini gerbang pembayaran",
          id: "Kesalahan memperbarui gateway pembayaran",
        },
      });
    }
  }
);

// Admin Delete Payment Gateway
router.delete(
  "/admin/api/payment-gateways/:id",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const gateway = await PaymentGateway.findById(req.params.id);
      if (!gateway) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Payment gateway not found",
            zh: "找不到支付网关",
          },
        });
      }

      if (gateway.logo) {
        await smartDeleteFile(gateway.logo, req.companyId);
      }

      if (gateway.banks) {
        for (const bank of gateway.banks) {
          if (bank.bankimage) {
            await smartDeleteFile(bank.bankimage, req.companyId);
          }
        }
      }

      await PaymentGateway.findByIdAndDelete(req.params.id);
      res.status(200).json({
        success: true,
        message: {
          en: "Payment gateway deleted successfully",
          zh: "支付网关删除成功",
        },
      });
    } catch (error) {
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

// Admin Toggle Payment Gateway Status
router.patch(
  "/admin/api/payment-gateways/:id/toggle",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const gateway = await PaymentGateway.findById(req.params.id);
      if (!gateway) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Payment gateway not found",
            zh: "找不到支付网关",
          },
        });
      }

      gateway.status = !gateway.status;
      await gateway.save();
      res.status(200).json({
        success: true,
        message: {
          en: `Payment gateway is now ${
            gateway.status ? "active" : "inactive"
          }`,
          zh: `支付网关${gateway.status ? "已激活" : "已停用"}`,
        },
        data: gateway,
      });
    } catch (error) {
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

router.patch(
  "/admin/api/payment-gateways/:id/adjust-balance",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { operation, amount, remark } = req.body;
      const userId = req.user.userId;

      if (!operation || !amount || !remark) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Missing required fields",
            zh: "缺少必填字段",
          },
        });
      }

      const adminuser = await adminUser.findById(userId);
      if (!adminuser) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Admin user not found",
            zh: "未找到管理员用户",
          },
        });
      }

      const gateway = await PaymentGateway.findById(id, {
        balance: 1,
        name: 1,
      }).lean();
      if (!gateway) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Payment gateway not found",
            zh: "找不到支付网关",
          },
        });
      }
      const adjustmentAmount = operation === "add" ? amount : -amount;
      const oldBalance = gateway.balance || 0;
      const updatedGateway = await PaymentGateway.findByIdAndUpdate(
        id,
        { $inc: { balance: adjustmentAmount } },
        { new: true, projection: { balance: 1, name: 1 } }
      ).lean();

      await PaymentGatewayTransactionLog.create({
        gatewayId: id,
        gatewayName: gateway.name,
        transactiontype: "adjustment",
        amount,
        lastBalance: oldBalance,
        currentBalance: updatedGateway.balance,
        remark,
        processby: adminuser.username,
      });

      return res.status(200).json({
        success: true,
        message: {
          en: "Balance adjusted successfully",
          zh: "余额调整成功",
        },
        data: {
          oldBalance,
          newBalance: updatedGateway.balance,
        },
      });
    } catch (error) {
      console.error("Error adjusting gateway balance:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "Internal server error",
          zh: "服务器内部错误",
        },
      });
    }
  }
);

module.exports = router;
