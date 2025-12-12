const express = require("express");
const router = express.Router();
const multer = require("multer");
const { authenticateAdminToken } = require("../auth/adminAuth");
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const BankList = require("../models/banklist.model");
const BankTransactionLog = require("../models/banktransactionlog.model");
const { adminUser } = require("../models/adminuser.model");
const moment = require("moment");
const { setConnForRequest } = require("../lib/dbContext");

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fieldSize: 100 * 1024 * 1024,
    fileSize: 100 * 1024 * 1024,
  },
});

function getBucket(companyId) {
  const bucket = process.env[`S3_MAINBUCKET_${companyId}`];
  return bucket;
}

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

  if (!bucket) {
    throw new Error(`No R2 bucket configured for company: ${companyId}`);
  }
  if (!publicId) {
    throw new Error(`No R2 public ID configured for company: ${companyId}`);
  }

  const folderPath = "banklists/";
  const fileKey = `${folderPath}${Date.now()}_${file.originalname}`;

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
        throw new Error(`No R2 bucket configured for company: ${companyId}`);
      }

      const deleteParams = {
        Bucket: bucket,
        Key: fileKey,
      };
      await r2Client.send(new DeleteObjectCommand(deleteParams));
    } else {
      const url = new URL(fileUrl);
      const key = decodeURIComponent(url.pathname.substring(1));
      const bucket = getBucket(companyId);

      if (bucket) {
        const deleteParams = {
          Bucket: bucket,
          Key: key,
        };
        await s3Client.send(new DeleteObjectCommand(deleteParams));
        console.log(
          `Successfully deleted S3 file: ${key} from bucket: ${bucket}`
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

// Client Get Bank List
router.get("/api/client/banklist", async (req, res) => {
  try {
    const bankLists = await BankList.find(
      { isActive: true },
      "_id bankaccount ownername bankname qrimage"
    );
    res.status(200).json({
      success: true,
      message: "Bank lists retrieved successfully",
      data: bankLists,
    });
  } catch (error) {
    console.error("Error occurred while retrieving bank lists:", error);
    res.status(200).json({
      success: false,
      message: "Internal server error",
      error: error.toString(),
    });
  }
});

// Admin Get All Bank List
router.get("/admin/api/banklist", authenticateAdminToken, async (req, res) => {
  try {
    const bankLists = await BankList.find({});
    res.status(200).json({
      success: true,
      message: "Bank lists retrieved successfully",
      data: bankLists,
    });
  } catch (error) {
    console.error("Error occurred while retrieving bank lists:", error);
    res.status(200).json({
      success: false,
      message: "Internal server error",
      error: error.toString(),
    });
  }
});

// Admin Create Bank List
router.post(
  "/admin/api/createbanklist",
  authenticateAdminToken,
  upload.single("qrimage"),
  async (req, res) => {
    try {
      setConnForRequest(req.db);
      const {
        bankname,
        bankaccount,
        ownername,
        fastpayment,
        transactionlimit,
        transactionfees,
        transactionamountlimit,
        remark,
        dailydepositamountlimit,
        dailywithdrawamountlimit,
        monthlydepositamountlimit,
        monthlywithdrawamountlimit,
      } = req.body;

      let qrImageUrl = null;
      if (req.file) {
        qrImageUrl = await uploadFileToR2(req.file, req.companyId);
      }

      const newBankList = await BankList.create({
        bankname,
        bankaccount,
        ownername,
        fastpayment,
        transactionlimit,
        transactionfees,
        transactionamountlimit,
        remark,
        qrimage: qrImageUrl,
        dailydepositamountlimit: parseFloat(dailydepositamountlimit) || 0,
        dailywithdrawamountlimit: parseFloat(dailywithdrawamountlimit) || 0,
        monthlydepositamountlimit: parseFloat(monthlydepositamountlimit) || 0,
        monthlywithdrawamountlimit: parseFloat(monthlywithdrawamountlimit) || 0,
      });

      res.status(200).json({
        success: true,
        message: {
          en: "Bank List created successfully",
          zh: "银行列表创建成功",
        },
        data: newBankList,
      });
    } catch (error) {
      console.error("Error occurred while creating bank list:", error);
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

// Admin Update Bank List
router.patch(
  "/admin/api/updatebank/:id",
  authenticateAdminToken,
  upload.single("qrimage"),
  async (req, res) => {
    const { id } = req.params;
    try {
      setConnForRequest(req.db);
      const existingBank = await BankList.findById(id);
      if (!existingBank) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Bank list not found",
            zh: "找不到银行列表",
          },
        });
      }

      let qrImageUrl = existingBank.qrimage;

      if (req.file && qrImageUrl) {
        await smartDeleteFile(qrImageUrl, req.companyId);
      }

      if (req.file) {
        try {
          qrImageUrl = await uploadFileToR2(req.file, req.companyId);
        } catch (uploadError) {
          return res.status(200).json({
            success: false,
            message: {
              en: "Error uploading image to storage",
              zh: "上传图片到存储时出错",
            },
          });
        }
      }

      const updateData = {
        bankname: req.body.bankname,
        bankaccount: req.body.bankaccount,
        ownername: req.body.ownername,
        fastpayment: req.body.fastpayment,
        transactionlimit: req.body.transactionlimit || null,
        transactionfees: req.body.transactionfees || null,
        transactionamountlimit: req.body.transactionamountlimit || null,
        remark: req.body.remark || "-",
        qrimage: qrImageUrl,
        dailydepositamountlimit:
          parseFloat(req.body.dailydepositamountlimit) || 0,
        dailywithdrawamountlimit:
          parseFloat(req.body.dailywithdrawamountlimit) || 0,
        monthlydepositamountlimit:
          parseFloat(req.body.monthlydepositamountlimit) || 0,
        monthlywithdrawamountlimit:
          parseFloat(req.body.monthlywithdrawamountlimit) || 0,
      };

      const updatedBank = await BankList.findByIdAndUpdate(id, updateData, {
        new: true,
      });

      res.status(200).json({
        success: true,
        message: {
          en: "Bank list updated successfully",
          zh: "银行列表更新成功",
        },
        data: updatedBank,
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

// Admin Delete Bank List
router.delete(
  "/admin/api/deletebanklist/:id",
  authenticateAdminToken,
  async (req, res) => {
    try {
      setConnForRequest(req.db);
      const bank = await BankList.findById(req.params.id);
      if (!bank) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Bank list not found",
            zh: "未找到银行列表",
          },
        });
      }

      if (bank.qrimage) {
        await smartDeleteFile(bank.qrimage, req.companyId);
      }

      const deletedBank = await BankList.findOneAndDelete({
        _id: req.params.id,
      });

      if (!deletedBank) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Bank list not found",
            zh: "未找到银行列表",
          },
        });
      }

      res.status(200).json({
        success: true,
        message: {
          en: "Bank list deleted successfully",
          zh: "银行列表删除成功",
        },
        data: deletedBank,
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

// Admin Update Bank Status
router.patch(
  "/admin/api/updateactivebank",
  authenticateAdminToken,
  async (req, res) => {
    const { id, isActive } = req.body;
    try {
      setConnForRequest(req.db);
      const updatedBank = await BankList.findByIdAndUpdate(
        id,
        { isActive },
        { new: true }
      );
      if (!updatedBank) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Bank not found",
            zh: "未找到银行",
          },
        });
      }
      res.status(200).json({
        success: true,
        message: {
          en: "Bank status updated successfully",
          zh: "银行状态更新成功",
        },
        data: updatedBank,
      });
    } catch (error) {
      console.error("Error updating bank's active status:", error);
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

// Admin Update Starting Balance
router.patch(
  "/admin/api/updatestartingbalance",
  authenticateAdminToken,
  async (req, res) => {
    const { id, startingBalance, remark } = req.body;
    const balance = parseFloat(startingBalance);

    try {
      setConnForRequest(req.db);
      const adminId = req.user.userId;
      const adminuser = await adminUser.findById(adminId);
      if (!adminuser) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Admin User not found, please contact customer service",
            zh: "找不到管理员用户，请联系客服",
          },
        });
      }

      const bank = await BankList.findById(id);
      if (!bank) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Bank list not found",
            zh: "找不到银行列表",
          },
        });
      }

      const oldBalance = bank.currentbalance;
      bank.startingbalance = balance;
      bank.currentbalance =
        bank.startingbalance +
        bank.totalDeposits -
        bank.totalWithdrawals +
        bank.totalCashIn -
        bank.totalCashOut;
      await bank.save();

      const transactionLog = new BankTransactionLog({
        bankName: bank.bankname,
        ownername: bank.ownername,
        remark: remark,
        lastBalance: oldBalance,
        currentBalance: bank.currentbalance,
        processby: adminuser.username,
        transactiontype: "adjust starting balance",
        amount: balance,
        qrimage: bank.qrimage,
        playerusername: "n/a",
        playerfullname: "n/a",
      });
      await transactionLog.save();

      res.status(200).json({
        success: true,
        message: {
          en: "Starting balance updated successfully",
          zh: "初始余额更新成功",
        },
        data: bank,
      });
    } catch (error) {
      console.error("Error updating starting balance:", error);
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

// Admin Cash In
router.post("/admin/api/cashin", authenticateAdminToken, async (req, res) => {
  const { id, amount, remark } = req.body;
  const cashInAmount = parseFloat(amount);

  try {
    setConnForRequest(req.db);
    const adminId = req.user.userId;
    const adminuser = await adminUser.findById(adminId);
    if (!adminuser) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Admin User not found, please contact customer service",
          zh: "找不到管理员用户，请联系客服",
        },
      });
    }

    const bank = await BankList.findById(id);
    if (!bank) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Bank list not found",
          zh: "找不到银行列表",
        },
      });
    }

    const oldBalance = bank.currentbalance;
    bank.totalCashIn += cashInAmount;
    bank.currentbalance += cashInAmount;
    await bank.save();

    const transactionLog = new BankTransactionLog({
      bankName: bank.bankname,
      ownername: bank.ownername,
      remark: remark,
      lastBalance: oldBalance,
      currentBalance: bank.currentbalance,
      processby: adminuser.username,
      transactiontype: "cashin",
      amount: cashInAmount,
      qrimage: bank.qrimage,
      playerusername: "n/a",
      playerfullname: "n/a",
    });
    await transactionLog.save();

    res.status(200).json({
      success: true,
      message: {
        en: "Cash in processed successfully",
        zh: "现金存入处理成功",
      },
      data: bank,
    });
  } catch (error) {
    console.error("Error processing cash in:", error);
    res.status(500).json({
      success: false,
      message: {
        en: "Internal server error",
        zh: "服务器内部错误",
      },
    });
  }
});

// Admin Cash Out
router.post("/admin/api/cashout", authenticateAdminToken, async (req, res) => {
  const { id, amount, remark } = req.body;
  const cashOutAmount = parseFloat(amount);

  try {
    setConnForRequest(req.db);
    const adminId = req.user.userId;
    const adminuser = await adminUser.findById(adminId);
    if (!adminuser) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Admin User not found, please contact customer service",
          zh: "找不到管理员用户，请联系客服",
        },
      });
    }

    const bank = await BankList.findById(id);
    if (!bank) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Bank list not found",
          zh: "找不到银行列表",
        },
      });
    }

    if (bank.currentbalance < cashOutAmount) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Insufficient balance",
          zh: "余额不足",
        },
      });
    }

    const oldBalance = bank.currentbalance;
    bank.totalCashOut += cashOutAmount;
    bank.currentbalance -= cashOutAmount;
    await bank.save();

    const transactionLog = new BankTransactionLog({
      bankName: bank.bankname,
      ownername: bank.ownername,
      remark: remark,
      lastBalance: oldBalance,
      currentBalance: bank.currentbalance,
      processby: adminuser.username,
      transactiontype: "cashout",
      amount: cashOutAmount,
      qrimage: bank.qrimage,
      playerusername: "n/a",
      playerfullname: "n/a",
    });
    await transactionLog.save();

    res.status(200).json({
      success: true,
      message: {
        en: "Cash out processed successfully",
        zh: "现金提取处理成功",
      },
      data: bank,
    });
  } catch (error) {
    console.error("Error processing cash out:", error);
    res.status(500).json({
      success: false,
      message: {
        en: "Internal server error",
        zh: "服务器内部错误",
      },
    });
  }
});

// Admin Get Bank Report
router.get(
  "/admin/api/bankreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      setConnForRequest(req.db);
      const { startDate, endDate } = req.query;
      const banks = await BankList.find({});

      const dateFilter = {};
      if (startDate && endDate) {
        dateFilter.createdAt = {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        };
      }

      const stats = await BankTransactionLog.aggregate([
        {
          $match: {
            bankName: { $in: banks.map((b) => b.bankname) },
            ...dateFilter,
          },
        },
        {
          $group: {
            _id: "$bankName",
            totalDeposits: {
              $sum: {
                $cond: [
                  { $eq: [{ $toLower: "$transactiontype" }, "deposit"] },
                  "$amount",
                  0,
                ],
              },
            },
            totalWithdrawals: {
              $sum: {
                $cond: [
                  { $eq: [{ $toLower: "$transactiontype" }, "withdraw"] },
                  "$amount",
                  0,
                ],
              },
            },
            totalCashIn: {
              $sum: {
                $cond: [
                  { $eq: [{ $toLower: "$transactiontype" }, "cashin"] },
                  "$amount",
                  0,
                ],
              },
            },
            totalCashOut: {
              $sum: {
                $cond: [
                  { $eq: [{ $toLower: "$transactiontype" }, "cashout"] },
                  "$amount",
                  0,
                ],
              },
            },
          },
        },
      ]);

      const statsMap = new Map(stats.map((s) => [s._id, s]));

      const reportData = banks.map((bank) => {
        const bankStats = statsMap.get(bank.bankname) || {};
        return {
          id: bank._id,
          bankName: bank.bankname,
          ownername: bank.ownername,
          totalDeposit: bankStats.totalDeposits || 0,
          totalWithdraw: bankStats.totalWithdrawals || 0,
          totalCashIn: bankStats.totalCashIn || 0,
          totalCashOut: bankStats.totalCashOut || 0,
          currentBalance: bank.currentbalance,
        };
      });

      const totals = reportData.reduce(
        (acc, bank) => ({
          totalDeposit: (acc.totalDeposit || 0) + bank.totalDeposit,
          totalWithdraw: (acc.totalWithdraw || 0) + bank.totalWithdraw,
          totalCashIn: (acc.totalCashIn || 0) + bank.totalCashIn,
          totalCashOut: (acc.totalCashOut || 0) + bank.totalCashOut,
        }),
        {}
      );

      res.status(200).json({
        success: true,
        message: "Report data retrieved successfully",
        data: {
          reports: reportData,
          totals,
        },
      });
    } catch (error) {
      console.error("Error generating bank report:", error);
      res.status(200).json({
        success: false,
        message: "Internal server error",
        error: error.toString(),
      });
    }
  }
);

module.exports = router;
