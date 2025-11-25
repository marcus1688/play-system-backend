const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../auth/auth");
const { fromHex } = require("tron-format-address");
const { User } = require("../models/users.model");
const IndexModel = require("../models/index.model");
const cryptoprivacyModel = require("../models/cryptoprivacy.model");
const Withdraw = require("../models/withdraw.model");
const CryptoDetailsModal = require("../models/cryptodetails.model");
const UserWalletLog = require("../models/userwalletlog.model");
const { authenticateAdminToken } = require("../auth/adminAuth");
const { v4: uuidv4 } = require("uuid");

const axios = require("axios");
const QRCode = require("qrcode");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Create Virtual Account & Generate Address
router.post(
  "/api/create-crypto-accounts",
  authenticateToken,
  async (req, res) => {
    try {
      const userId = req.user.userId;
      const user = await User.findById(userId);
      if (!user) {
        console.log("User not found");
        return res.status(404).json({ error: "User not found" });
      }

      if (!user.isEmailVerified) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Please proceed to verify your account first before generating an address.",
            zh: "请先验证您的账户，然后再生成地址。",
            zh_hk: "請先驗證你嘅賬戶，然後再產生地址。",
            ms: "Sila sahkan akaun anda terlebih dahulu sebelum menjana alamat.",
            id: "Silakan verifikasi akun Anda terlebih dahulu sebelum membuat alamat.",
          },
        });
      }

      if (user.cryptoWallet && user.cryptoWallet.length > 0) {
        return res.status(200).json({
          success: false,
          message: {
            en: "You already have a crypto wallet. Each user can only have one wallet.",
            zh: "您已经拥有一个加密钱包。每个用户只能拥有一个钱包。",
            zh_hk: "你已經擁有一個加密錢包。每個用戶只可以擁有一個錢包。",
            ms: "Anda sudah mempunyai dompet kripto. Setiap pengguna hanya boleh mempunyai satu dompet.",
            id: "Silakan verifikasi akun Anda terlebih dahulu sebelum membuat alamat.",
          },
        });
      }

      let indexDoc = await IndexModel.findOne({ name: "cryptoIndex" });
      if (!indexDoc) {
        indexDoc = new IndexModel({ name: "cryptoIndex", currentIndex: 2 });
        await indexDoc.save();
      }
      let currentIndex = indexDoc.currentIndex;
      const tronRequestBody = {
        customer: {
          accountingCurrency: "USD",
          externalId: user._id,
        },
        currency: "USDT_TRON",
        xpub: process.env.CRYPTO_PUBLIC_KEY,
        accountCode: "tron_account",
        accountingCurrency: "USD",
        accountNumber: user.username,
      };
      // Create Tron Account
      const tronResponse = await axios.post(
        "https://api.tatum.io/v3/ledger/account",
        tronRequestBody,
        {
          headers: {
            "x-api-key": process.env.CRYPTO_API_KEY,
            "Content-Type": "application/json",
          },
        }
      );
      const tronAccountId = tronResponse.data.id;
      // Generate Tron Address
      const tronAddressResponse = await axios.post(
        `https://api.tatum.io/v3/offchain/account/${tronAccountId}/address?index=${currentIndex}`,
        {},
        {
          headers: {
            "x-api-key": process.env.CRYPTO_API_KEY,
            "Content-Type": "application/json",
          },
        }
      );
      const tronAddress = tronAddressResponse.data.address;
      // Generate Tron QR Code
      const tronQrCode = await QRCode.toDataURL(tronAddress);

      // Subscribe to TRON Webhook
      const tronWebhookResponse = await axios.post(
        "https://api.tatum.io/v4/subscription",
        {
          type: "ADDRESS_EVENT",
          attr: {
            chain: "TRON",
            address: tronAddress,
            url: "http://api.ezwin9.com/webhook-endpoint",
          },
        },
        {
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            "x-api-key": process.env.CRYPTO_API_KEY,
          },
        }
      );
      const generatePrivateKeyOptions = {
        method: "POST",
        url: "https://api.tatum.io/v3/tron/wallet/priv",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-api-key": process.env.CRYPTO_API_KEY,
        },
        data: {
          index: currentIndex,
          mnemonic: process.env.CRYPTO_MNEMONIC,
        },
      };

      const privateKeyResponse = await axios.request(generatePrivateKeyOptions);
      const privateKey = privateKeyResponse.data.key;
      // Save to MongoDB
      const newCryptoAccount = {
        crypto_currency: "USDT_TRON",
        crypto_active: tronResponse.data.active,
        crypto_address: tronAddress,
        crypto_qrimage: tronQrCode,
        crypto_customerid: tronResponse.data.customerId,
        crypto_accountid: tronAccountId,
        crypto_accountbalance: tronResponse.data.balance.accountBalance,
        crypto_availablebalance: tronResponse.data.balance.availableBalance,
      };

      user.cryptoWallet.push(newCryptoAccount);
      await user.save();

      const newCryptoDetail = new CryptoDetailsModal({
        username: user.username,
        user_id: user._id,
        index: currentIndex,
        crypto_currency: "USDT_TRON",
        crypto_active: tronResponse.data.active,
        crypto_address: tronAddress,
        crypto_qrimage: tronQrCode,
        crypto_customerid: tronResponse.data.customerId,
        crypto_accountid: tronAccountId,
        private_key: privateKey,
      });
      await newCryptoDetail.save();

      currentIndex += 1;
      indexDoc.currentIndex = currentIndex;
      await indexDoc.save();

      // USDT_TRON Transfer
      //   try {
      //     const usdtTransferOptions = {
      //       method: "POST",
      //       url: "https://api.tatum.io/v3/tron/transaction",
      //       headers: {
      //         accept: "application/json",
      //         "content-type": "application/json",
      //         "x-api-key": process.env.CRYPTO_API_KEY,
      //       },
      //       data: {
      //         fromPrivateKey: process.env.CRYPTO_ADMIN_PRIVATE_KEY,
      //         to: tronAddress,
      //         amount: "0.01",
      //       },
      //     };
      //     const transferResponse = await axios.request(usdtTransferOptions);
      //     if (transferResponse.status === 200) {
      //       const updatedDetails = await CryptoDetailsModal.findOneAndUpdate(
      //         { crypto_accountid: tronAccountId },
      //         { $inc: { trx_balance: 0.01 } },
      //         { new: true }
      //       );
      //       if (updatedDetails) {
      //         // console.log(
      //         //   "usdt_balance updated successfully in CryptoDetailsModal",
      //         //   updatedDetails
      //         // );
      //       } else {
      //         console.error(
      //           "Failed to update usdt_balance in CryptoDetailsModal"
      //         );
      //       }
      //     } else {
      //       console.error(
      //         "Failed to transfer USDT_TRON, status code:",
      //         transferResponse.status
      //       );
      //     }
      //   } catch (error) {
      //     console.error(
      //       "Error during USDT_TRON transfer or updating usdt_balance:",
      //       error.response ? error.response.data : error.message
      //     );
      //   }

      res.status(200).json({
        success: true,
        message: {
          en: "Crypto wallet created successfully.",
          zh: "加密钱包创建成功。",
          zh_hk: "加密錢包建立成功。",
          ms: "Dompet kripto berjaya dicipta.",
          id: "Dompet kripto berhasil dibuat.",
        },
        accounts: newCryptoAccount,
      });
    } catch (err) {
      console.error("Error creating crypto accounts:", err.message);
      res.status(500).json({
        message: {
          en: "Error creating crypto accounts",
          zh: "创建加密账户时出错",
          zh_hk: "建立加密賬戶時出錯",
          ms: "Ralat mencipta akaun kripto",
          id: "Error membuat akun kripto",
        },
      });
    }
  }
);

// Client USDT Deduct Fee
router.post("/api/usdt-deduct-fees", async (req, res) => {
  try {
    const { userId, deductAmount, processBy } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (user.wallet < deductAmount) {
      return res
        .status(400)
        .json({ message: "Insufficient balance for fee deduction" });
    }
    user.wallet -= deductAmount;
    await user.save();

    const transactionId = uuidv4();
    const newWithdrawal = new Withdraw({
      userid: user._id,
      username: user.username,
      fullname: user.fullname,
      bankname: "N/A",
      ownername: "N/A",
      banknumber: "N/A",
      bankid: "N/A",
      transactionType: "TRANSACTION FEES",
      processBy: processBy || "Auto Processed",
      withdrawAmount: deductAmount,
      status: "APPROVED",
      remark: "USDT 1 手续费",
      transactionId: transactionId,
      usdtWithdrawAmount: 0,
      usdtaddress: "-",
      usdttohkdwithdraw: 0,
      processtime: "N/A",
    });
    await newWithdrawal.save();

    const walletLog = new UserWalletLog({
      userId: user._id,
      transactionid: newWithdrawal.transactionId,
      transactiontime: new Date(),
      transactiontype: "提款",
      amount: deductAmount,
      status: "已批准",
    });
    await walletLog.save();

    res.status(200).json({
      message: "Fee deducted successfully",
      deductedFee: deductAmount.toFixed(2),
      remainingBalance: user.wallet.toFixed(2),
    });
  } catch (error) {
    console.error("Error processing fee deduction:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Revert Client USDT Deduct Fees
router.post("/api/revert-usdt-deduct-fees", async (req, res) => {
  try {
    const { transactionId, processBy } = req.body;
    const transaction = await Withdraw.findOne({
      _id: transactionId,
    });
    const walletLog = await UserWalletLog.findOne({
      transactionid: transaction.transactionId,
    });
    if (!transaction) {
      return res.status(404).json({ message: "Transaction not found" });
    }
    if (transaction.status === "REVERTED") {
      return res.status(400).json({ message: "Transaction already reverted" });
    }
    transaction.reverted = true;
    transaction.revertedProcessBy = processBy;
    await transaction.save();
    walletLog.status = "取消";
    await walletLog.save();
    const user = await User.findById(transaction.userid);
    if (user) {
      user.wallet += transaction.withdrawAmount;
      await user.save();
    }
    res.status(200).json({
      message: "Transaction reverted successfully",
      authorized: true,
    });
  } catch (error) {
    console.error("Error reverting transaction:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Get All Virtual Account (1 Credit)
router.get(
  "/admin/api/get-accounts",
  authenticateAdminToken,
  async (req, res) => {
    try {
      let allAccounts = [];
      let currentPage = 0;
      let hasMoreData = true;
      while (hasMoreData) {
        const response = await axios.get(
          "https://api.tatum.io/v3/ledger/account",
          {
            headers: {
              "x-api-key": process.env.CRYPTO_API_KEY,
            },
            params: {
              pageSize: 50,
              page: currentPage,
              sort: "asc",
              sortBy: "account_balance",
            },
          }
        );
        if (response.data && response.data.length > 0) {
          allAccounts = [...allAccounts, ...response.data];
          if (response.data.length < 50) {
            hasMoreData = false;
          } else {
            currentPage++;
          }
        } else {
          hasMoreData = false;
        }
      }
      res.status(200).json(allAccounts);
    } catch (err) {
      console.error(
        "Error retrieving accounts:",
        err.response ? err.response.data : err.message
      );
      res.status(500).json({
        error: "Error retrieving accounts",
        details: err.message,
      });
    }
  }
);

// Internal Transfer Fund (4 Credit)
router.post(
  "/admin/api/internal-transfer-funds",
  authenticateAdminToken,
  (req, res) => {
    const { senderAccountId, recipientAccountId, amount } = req.body;
    console.log(req.body);

    if (!senderAccountId || !recipientAccountId || !amount) {
      return res.status(400).json({
        error: "senderAccountId, recipientAccountId, and amount are required",
      });
    }

    const options = {
      method: "POST",
      url: "https://api.tatum.io/v3/ledger/transaction",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-api-key": process.env.CRYPTO_API_KEY, // 替换为你的API Key
      },
      data: {
        anonymous: false,
        baseRate: 1,
        senderAccountId: senderAccountId,
        recipientAccountId: recipientAccountId,
        amount: amount,
      },
    };

    axios
      .request(options)
      .then(function (response) {
        res.status(200).json(response.data); // 返回API的响应数据
      })
      .catch(function (error) {
        console.error(
          "Error transferring funds:",
          error.response ? error.response.data : error.message
        );
        res.status(error.response?.status || 500).json({
          error: "Error transferring funds",
          message: error.response?.data?.message || error.message,
          details: error.response?.data || null,
        });
      });
  }
);

// Get Virtual Account Address (1 Credit)
router.post(
  "/admin/api/get-account-address",
  authenticateAdminToken,
  async (req, res) => {
    const { accountId } = req.body; // 从req.body中获取accountId
    if (!accountId) {
      return res.status(400).json({ error: "accountId is required" });
    }
    const options = {
      method: "GET",
      url: `https://api.tatum.io/v3/offchain/account/${accountId}/address`,
      headers: {
        accept: "application/json",
        "x-api-key": process.env.CRYPTO_API_KEY,
      },
    };
    try {
      const response = await axios.request(options);
      res.status(200).json(response.data);
    } catch (error) {
      console.error("Error fetching account address:", error);
      res.status(500).json({
        error: "Error fetching account address",
        details: error.message,
      });
    }
  }
);

// 生成Tron钱包获取XPUB (1 Credit)
router.post(
  "/admin/api/generate-tron-wallet",
  authenticateAdminToken,
  (req, res) => {
    const { password } = req.body;
    const correctPassword = "1688";
    if (password !== correctPassword) {
      return res.status(401).json({ message: "Invalid password" });
    }
    const options = {
      method: "GET",
      url: `https://api.tatum.io/v3/tron/wallet`,
      headers: {
        accept: "application/json",
        "x-api-key": process.env.CRYPTO_API_KEY,
      },
    };
    axios
      .request(options)
      .then(async function (response) {
        const { mnemonic, xpub } = response.data;
        try {
          const existingWallet = await cryptoprivacyModel.findOne({ xpub });

          if (existingWallet) {
            existingWallet.xpub = xpub;
            await existingWallet.save();
            res.status(200).json({
              message: "Tron wallet xpub updated successfully!",
              xpub: xpub,
            });
          } else {
            const newWallet = new cryptoprivacyModel({ mnemonic, xpub });
            await newWallet.save();
            res.status(200).json({
              message: "Tron wallet created and saved successfully!",
              mnemonic: mnemonic,
              xpub: xpub,
            });
          }
        } catch (error) {
          console.error("Error saving Tron wallet to database:", error);
          res.status(500).json({ message: "Error saving wallet data" });
        }
      })
      .catch(function (error) {
        console.error("Error generating Tron wallet:", error);
        res.status(500).send("Error generating Tron wallet");
      });
  }
);

// Trasnfer All Fund To Admin
router.post(
  "/admin/api/transfer-to-admin",
  authenticateAdminToken,
  async (req, res) => {
    try {
      // Step 1: 获取所有账户信息
      const response = await axios.get(
        "https://api.tatum.io/v3/ledger/account",
        {
          headers: {
            "x-api-key": process.env.CRYPTO_API_KEY, // 替换为你的API Key
          },
          params: {
            pageSize: 50,
            sort: "asc",
            sortBy: "id",
          },
        }
      );
      const accounts = response.data;

      // Step 2: 过滤有余额的账户
      const accountsWithBalance = accounts.filter(
        (account) => parseFloat(account.balance.availableBalance) > 0
      );

      // Step 3: 查找 "Admin" 账户
      const adminAccount = accounts.find(
        (account) => account.accountNumber === "Admin"
      );

      if (!adminAccount) {
        return res.status(404).json({ error: "Admin account not found" });
      }

      // Step 4: 遍历有余额的账户，并将每个账户的余额转到 Admin 账户
      const transferPromises = accountsWithBalance.map((account) => {
        const senderAccountId = account.id;
        const recipientAccountId = adminAccount.id;
        const amount = account.balance.availableBalance;

        // Step 5: 调用 internal-transfer-funds 路由进行资金转移
        const options = {
          method: "POST",
          url: "https://api.tatum.io/v3/ledger/transaction",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            "x-api-key": process.env.CRYPTO_API_KEY,
          },
          data: {
            anonymous: false,
            baseRate: 1,
            senderAccountId: senderAccountId,
            recipientAccountId: recipientAccountId,
            amount: amount,
          },
        };

        return axios.request(options);
      });

      // 等待所有转账请求完成
      const transferResults = await Promise.all(transferPromises);

      // 返回转账成功的结果
      res.status(200).json({
        message: "All transfers to Admin account completed successfully",
        transfers: transferResults.map((result) => result.data),
      });
    } catch (error) {
      console.error("Error transferring funds to Admin account:", error);
      res.status(500).json({
        error: "Error transferring funds to Admin account",
        details: error.response?.data || error.message,
      });
    }
  }
);

// Transfer TRX
router.post(
  "/admin/api/tranfer-trx",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { to, amount, fromPrivateKey } = req.body;
      const options = {
        method: "POST",
        url: "https://api.tatum.io/v3/tron/transaction",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-api-key": process.env.CRYPTO_API_KEY,
        },
        data: {
          fromPrivateKey: fromPrivateKey,
          to: to,
          amount: amount,
        },
      };
      const response = await axios.request(options);
      if (response.status === 200) {
        console.log("TRON transaction successful:", response.data);
        res.status(200).json({
          message: "TRON transaction successful",
          transactionDetails: response.data,
        });
      } else {
        throw new Error("Transaction failed, status not 200");
      }
    } catch (error) {
      console.error(
        "Error during TRON transaction:",
        error.response?.data || error.message
      );
      res.status(500).json({
        error: "TRON transaction failed",
        details: error.response?.data || error.message,
      });
    }
  }
);

// Get Freeze & Unfreeze Trx Details
router.post(
  "/admin/api/admin-trx-freeze-unfreeze-details",
  authenticateAdminToken,
  async (req, res) => {
    const address = process.env.CRYPTO_ADMIN_TRX_ADDRESS;
    const url = `https://api.trongrid.io/v1/accounts/${address}`;

    try {
      const response = await axios.get(url);
      const data = response.data.data[0];

      // Total TRX balance
      const totalTrx = data.balance / 1000000;

      // Total USDT balance
      let totalUsdt = 0;
      if (data.trc20 && data.trc20.length > 0) {
        data.trc20.forEach((token) => {
          Object.values(token).forEach((value) => {
            totalUsdt += parseInt(value) / 1000000;
          });
        });
      }

      // Calculate frozen TRX
      let frozenTrx = 0;
      if (data.frozenV2 && data.frozenV2.length > 0) {
        data.frozenV2.forEach((frozenItem) => {
          if (frozenItem.type === "ENERGY") {
            frozenTrx += frozenItem.amount / 1000000;
          }
        });
      }

      // Calculate unfrozen TRX and format detailed info for unfreeze items
      let unfreezeDetails = [];
      if (data.unfrozenV2 && data.unfrozenV2.length > 0) {
        data.unfrozenV2.forEach((unfrozenItem) => {
          if (unfrozenItem.type === "ENERGY") {
            const amount = unfrozenItem.unfreeze_amount / 1000000; // Convert to TRX
            const expiredTime = new Intl.DateTimeFormat("en-GB", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }).format(new Date(unfrozenItem.unfreeze_expire_time));

            // Push formatted data into unfreezeDetails array
            unfreezeDetails.push({
              type: unfrozenItem.type,
              amount: `${amount} TRX`,
              expiredTime: expiredTime,
            });
          }
        });
      }

      res.status(200).json({
        totalTrx, // Total TRX balance
        totalUsdt, // Total USDT balance
        frozenTrx, // Total frozen TRX
        unfreezeDetails, // Array of unfreeze details with type, amount, and expired time
        address: data.address,
      });
    } catch (error) {
      console.error("Error fetching TRX balance:", error);
      res.status(500).json({
        error: "Error fetching TRX/USDT balance",
        details: error.response?.data || error.message,
      });
    }
  }
);

// Get Admin Tron Balance
router.post(
  "/admin/api/admin-trx-balance",
  authenticateAdminToken,
  async (req, res) => {
    const address = process.env.CRYPTO_ADMIN_TRX_ADDRESS;
    // const address = "TCXYSVAzd4AMk3W2YjKAknDJY3gi2d3X5z"; // 可以从 req.body 获取地址
    const url = `https://apilist.tronscan.org/api/account?address=${address}`;

    try {
      // 发送 GET 请求到 Tronscan API 获取账户信息
      const response = await axios.get(url);
      const data = response.data;
      // 提取 TRX 余额，单位是 sun，需要除以 1,000,000 转换成 TRX
      const trxBalance = data.balance / 1000000;

      // 提取所有 USDT 余额，遍历 tokens 数组，找到 tokenAbbr 为 "USDT" 的代币并将余额相加
      let usdtBalance = 0;
      if (data.tokens && data.tokens.length > 0) {
        usdtBalance = data.tokens.reduce((total, token) => {
          if (token.tokenAbbr === "USDT") {
            return total + parseFloat(token.balance) / 1000000; // 将 sun 转换为 USDT
          }
          return total;
        }, 0);
      }

      // 提取 Energy 剩余值
      const energyRemaining = data.bandwidth?.energyRemaining || 0;

      res.status(200).json({
        trxBalance: trxBalance, // TRX 余额
        usdtBalance: usdtBalance, // 所有 USDT 余额总和
        energyRemaining: energyRemaining, // Energy 剩余值
        address: address,
      });
    } catch (error) {
      console.error("Error fetching TRX balance:", error);
      res.status(500).json({
        error: "Error fetching TRX/USDT balance",
        details: error.response?.data || error.message,
      });
    }
  }
);

// Deactivate Virutal Account
router.put(
  "/admin/api/crypto-deactivate-account",
  authenticateAdminToken,
  async (req, res) => {
    const { accountId } = req.body; // Get accountId from the request body

    const options = {
      method: "PUT",
      url: `https://api.tatum.io/v3/ledger/account/${accountId}/deactivate`,
      headers: {
        accept: "application/json",
        "x-api-key": process.env.CRYPTO_API_KEY, // Use your Tatum API key
      },
    };

    try {
      const response = await axios.request(options);
      res.status(200).json(response.data); // Return the response data
    } catch (error) {
      console.error("Error deactivating account:", error);
      res.status(500).json({
        error: "Failed to deactivate account",
        details: error.message,
      });
    }
  }
);

// Route to get all Database crypto details
router.get(
  "/admin/api/get-crypto-details",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const cryptoDetails = await CryptoDetailsModal.find();
      res.status(200).json(cryptoDetails);
    } catch (error) {
      console.error("Error fetching crypto details:", error);
      res.status(500).json({
        error: "Failed to retrieve crypto details",
        details: error.message,
      });
    }
  }
);

// Internal Withdraw
router.post(
  "/admin/api/internal-withdraw",
  authenticateAdminToken,
  async (req, res) => {
    const { senderAccountId, address, amount, fee } = req.body;
    const initialOptions = {
      method: "POST",
      url: "https://api.tatum.io/v3/offchain/withdrawal",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-api-key": process.env.CRYPTO_API_KEY,
      },
      data: {
        senderAccountId,
        address,
        amount,
        fee,
      },
    };
    try {
      const initialResponse = await axios.request(initialOptions);
      const { id, reference } = initialResponse.data;
      console.log("Initial Withdrawal Response:", initialResponse.data);
      // const confirmOptions = {
      //   method: "PUT",
      //   url: `https://api.tatum.io/v3/offchain/withdrawal/${id}/${reference}`,
      //   headers: {
      //     accept: "application/json",
      //     "x-api-key": process.env.CRYPTO_API_KEY,
      //   },
      // };
      // const confirmResponse = await axios.request(confirmOptions);
      // console.log("Confirmation Response:", confirmResponse.data);
      res.status(200).json({
        message: "Withdrawal initiated and confirmed successfully",
        // initialResponse: initialResponse.data,
        // confirmResponse: confirmResponse.data,
      });
    } catch (error) {
      console.error(
        "Error during withdrawal or confirmation:",
        error.response?.data || error.message
      );
      res.status(500).json({
        error: "Withdrawal or confirmation failed",
        details: error.response?.data || error.message,
      });
    }
  }
);

// Get Smart Contract
router.post(
  "/admin/api/get-smart-contract",
  authenticateAdminToken,
  async (req, res) => {
    const { address } = req.body;
    const url = `https://api.trongrid.io/v1/accounts/${address}`;

    try {
      const response = await axios.get(url);
      const data = response.data.data[0];

      // Extract TRC20 tokens and process them
      const SmartContractDetails = data.trc20
        ? data.trc20.map((token) => {
            const [smartContractAddress, rawAmount] = Object.entries(token)[0];
            const amount = parseInt(rawAmount) / 1000000; // Convert to proper amount
            return {
              smartContractAddress,
              amount, // Converted amount
            };
          })
        : [];

      res.status(200).json({
        SmartContractDetails, // Return processed smart contract details
        address: data.address,
      });
    } catch (error) {
      console.error("Error fetching TRC20 tokens:", error);
      res.status(500).json({
        error: "Error fetching TRC20 tokens",
        details: error.response?.data || error.message,
      });
    }
  }
);

// External Withdraw
router.post(
  "/admin/api/external-withdraw",
  authenticateAdminToken,
  async (req, res) => {
    const {
      to,
      amount,
      tokenAddress,
      feeLimit,
      senderAccountId,
      address,
      fromPrivateKey,
    } = req.body;

    // Initial TRC20 Transfer Request
    const transferOptions = {
      method: "POST",
      url: "https://api.tatum.io/v3/tron/trc20/transaction",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-api-key": process.env.CRYPTO_API_KEY,
      },
      data: {
        fromPrivateKey: fromPrivateKey,
        to: to, // Recipient address
        tokenAddress: tokenAddress, // The USDT contract address on Tron
        feeLimit: feeLimit, // Fee limit in TRX
        amount: amount, // Amount to be transferred
      },
    };

    try {
      // Execute the external TRC20 withdrawal transaction
      const transferResponse = await axios.request(transferOptions);
      console.log("TRC20 Transaction Response:", transferResponse.data);

      const txId = transferResponse.data.txId;
      await delay(2000);

      // Now, check the transaction status
      const checkTxUrl = `https://api.tatum.io/v3/tron/transaction/${txId}`;
      const checkTxResponse = await axios.get(checkTxUrl, {
        headers: {
          "x-api-key": process.env.CRYPTO_API_KEY,
        },
      });

      // Extract contractRet and check if the transaction was successful
      const contractRet = checkTxResponse.data.ret[0]?.contractRet;
      if (contractRet === "SUCCESS") {
        console.log("Transaction successful, proceeding with withdrawal...");

        // Proceed with the internal withdrawal using Tatum's API
        const initialOptions = {
          method: "POST",
          url: "https://api.tatum.io/v3/offchain/withdrawal",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            "x-api-key": process.env.CRYPTO_API_KEY,
          },
          data: {
            senderAccountId,
            address,
            amount,
            fee: "50",
          },
        };
        try {
          const initialResponse = await axios.request(initialOptions);
          const { id, reference } = initialResponse.data;
          console.log("Initial Withdrawal Response:", initialResponse.data);

          // // Confirm the withdrawal
          // const confirmOptions = {
          //   method: "PUT",
          //   url: `https://api.tatum.io/v3/offchain/withdrawal/${id}/${reference}`,
          //   headers: {
          //     accept: "application/json",
          //     "x-api-key": process.env.CRYPTO_API_KEY,
          //   },
          // };

          // const confirmResponse = await axios.request(confirmOptions);
          // console.log("Confirmation Response:", confirmResponse.data);

          res.status(200).json({
            message:
              "External Withdraw successful and internal withdrawal initiated",
            // externalWithdrawData: transferResponse.data,
            // internalWithdrawData: confirmResponse.data,
          });
        } catch (error) {
          console.error(
            "Error during internal withdrawal or confirmation:",
            error.response?.data || error.message
          );
          res.status(500).json({
            error: "Internal withdrawal or confirmation failed",
            details: error.response?.data || error.message,
          });
        }
      } else {
        console.error("TRC20 transaction failed:", checkTxResponse.data);
        res.status(500).json({
          error: "TRC20 transaction failed",
          details: checkTxResponse.data,
        });
      }
    } catch (error) {
      console.error(
        "Error during TRC20 transaction or checking transaction status:",
        error.response?.data || error.message
      );
      res.status(500).json({
        error: "TRC20 transaction or status check failed",
        details: error.response?.data || error.message,
      });
    }
  }
);

// Freeze TRX for Energy
router.post(
  "/admin/api/freeze-trx-energy",
  authenticateAdminToken,
  async (req, res) => {
    const { amount, fromPrivateKey } = req.body;

    const options = {
      method: "POST",
      url: "https://api.tatum.io/v3/tron/freezeBalance",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-api-key": process.env.CRYPTO_API_KEY,
      },
      data: {
        resource: "ENERGY",
        fromPrivateKey: fromPrivateKey,
        amount,
      },
    };
    try {
      const response = await axios.request(options);
      res.status(200).json({
        message: "TRX successfully frozen for energy",
        data: response.data,
      });
    } catch (error) {
      console.error(
        "Error freezing TRX for energy:",
        error.response?.data || error.message
      );
      res.status(500).json({
        error: "Error freezing TRX for energy",
        details: error.response?.data || error.message,
      });
    }
  }
);

// Unfreeze TRX for Energy
router.post(
  "/admin/api/unfreeze-trx",
  authenticateAdminToken,
  async (req, res) => {
    const { amount, fromPrivateKey } = req.body;

    const options = {
      method: "POST",
      url: "https://api.tatum.io/v3/tron/unfreezeBalance",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-api-key": process.env.CRYPTO_API_KEY,
      },
      data: {
        resource: "ENERGY",
        fromPrivateKey: fromPrivateKey,
        amount,
      },
    };
    try {
      const response = await axios.request(options);
      res.status(200).json({
        message: "TRX Unfreeze successful",
        data: response.data,
      });
    } catch (error) {
      console.error(
        "Error during unfreezing TRX:",
        error.response?.data || error.message
      );
      res.status(500).json({
        error: "Unfreeze TRX failed",
        details: error.response?.data || error.message,
      });
    }
  }
);

// Customer Crypto Details
router.post(
  "/admin/api/customer-crypto-details",
  authenticateAdminToken,
  async (req, res) => {
    const { address } = req.body; // 从请求中获取地址
    const url = `https://apilist.tronscan.org/api/account?address=${address}`; // 使用新的 API URL

    try {
      // 发送 GET 请求到 Tronscan API 获取账户信息
      const response = await axios.get(url);
      const data = response.data;

      // Total TRX balance (balance 是以 sun 为单位，需要除以 1,000,000 转换为 TRX)
      const totalTrx = data.balance / 1000000;

      // Total USDT balance (遍历 tokens 数组，找到 USDT 的余额)
      let totalUsdt = 0;
      if (data.tokens && data.tokens.length > 0) {
        totalUsdt = data.tokens.reduce((total, token) => {
          if (token.tokenAbbr === "USDT") {
            return total + parseFloat(token.balance) / 1000000; // 将 sun 转换为 USDT
          }
          return total;
        }, 0);
      }

      // 如果你还需要计算 frozen TRX，可以参考之前的逻辑
      // let frozenTrx = 0;
      // if (data.frozenV2 && data.frozenV2.length > 0) {
      //   data.frozenV2.forEach((frozenItem) => {
      //     if (frozenItem.type === "ENERGY") {
      //       frozenTrx += frozenItem.amount / 1000000;
      //     }
      //   });
      // }

      // 返回 TRX 和 USDT 余额
      res.status(200).json({
        totalTrx, // 总 TRX 余额
        totalUsdt, // 总 USDT 余额
        // frozenTrx, // 冻结的 TRX 余额（如需要可取消注释）
        address: data.address, // 地址信息
      });
    } catch (error) {
      console.error("Error fetching crypto details:", error);
      res.status(500).json({
        error: "Error fetching crypto details",
        details: error.response?.data || error.message,
      });
    }
  }
);

// Generate Private Key
router.post(
  "/admin/api/generate-private-key",
  authenticateAdminToken,
  async (req, res) => {
    let { index } = req.body;
    const mnemonic = process.env.CRYPTO_MNEMONIC;
    index = Number(index);
    const options = {
      method: "POST",
      url: "https://api.tatum.io/v3/tron/wallet/priv",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-api-key": process.env.CRYPTO_API_KEY,
      },
      data: {
        index,
        mnemonic,
      },
    };
    try {
      const response = await axios.request(options);
      res.status(200).json(response.data);
    } catch (error) {
      console.error(
        "Error generating Tron wallet:",
        error.response?.data || error.message
      );
      res.status(500).json({
        error: "Error generating Tron wallet",
        details: error.response?.data || error.message,
      });
    }
  }
);

// TRC20 Transaction
router.post(
  "/admin/api/trc20-transactions",
  authenticateAdminToken,
  async (req, res) => {
    const { address } = req.body;
    const url = `https://api.trongrid.io/v1/accounts/${address}/transactions/trc20`;

    try {
      const response = await axios.get(url, {
        headers: {
          accept: "application/json",
        },
      });

      // Check if transactions are found
      if (response.data && response.data.data) {
        // Format the transaction data
        const formattedTransactions = response.data.data.map((tx) => {
          const date = new Date(tx.block_timestamp);
          const formattedDate = date.toLocaleString("en-GB", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          });

          const amount = tx.value / Math.pow(10, tx.token_info.decimals); // Convert to correct decimal format

          return {
            transactionId: tx.transaction_id,
            time: formattedDate,
            fromAddress: tx.from,
            toAddress: tx.to,
            symbol: tx.token_info.symbol,
            amount: amount.toFixed(6),
          };
        });

        res.status(200).json({
          transactions: formattedTransactions,
        });
      } else {
        res.status(404).json({
          message: "No TRC20 transactions found for this address.",
        });
      }
    } catch (error) {
      console.error("Error fetching TRC20 transactions:", error.message);
      res.status(500).json({
        error: "Error fetching TRC20 transactions",
        details: error.message,
      });
    }
  }
);

// TRX Transaction
router.post(
  "/admin/api/trx-transactions",
  authenticateAdminToken,
  async (req, res) => {
    const { address } = req.body;
    const url = `https://api.trongrid.io/v1/accounts/${address}/transactions`;

    try {
      const response = await axios.get(url, {
        headers: {
          accept: "application/json",
        },
      });

      // Check if transactions are found
      if (response.data && response.data.data) {
        // Format the transaction data
        const formattedTransactions = response.data.data.map((tx) => {
          const date = new Date(tx.block_timestamp);
          const formattedDate = date.toLocaleString("en-GB", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          });

          // Convert owner and to address from hex to base58
          const fromAddress = tx.raw_data.contract[0].parameter.value
            .owner_address
            ? fromHex(tx.raw_data.contract[0].parameter.value.owner_address)
            : "Unknown Address";

          const toAddress = tx.raw_data.contract[0].parameter.value.to_address
            ? fromHex(tx.raw_data.contract[0].parameter.value.to_address)
            : "Unknown Address";

          const amount =
            tx.raw_data.contract[0].parameter.value.amount / 1000000; // Convert to TRX from SUN
          const fee = tx.ret[0]?.fee || 0; // Extract fee from the transaction

          return {
            transactionId: tx.txID,
            time: formattedDate,
            fromAddress: fromAddress,
            toAddress: toAddress,
            amount: amount.toFixed(6),
            fee: fee / 1000000, // Convert fee from SUN to TRX
            status: tx.ret[0].contractRet,
          };
        });

        res.status(200).json({
          transactions: formattedTransactions,
        });
      } else {
        res.status(404).json({
          message: "No TRX transactions found for this address.",
        });
      }
    } catch (error) {
      console.error("Error fetching TRX transactions:", error.message);
      res.status(500).json({
        error: "Error fetching TRX transactions",
        details: error.message,
      });
    }
  }
);

// Get All Available Balance Account
router.post(
  "/admin/api/get-filtered-accounts",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const {
        pageSize = 50,
        page = 0,
        sort = "desc",
        sortBy = "account_balance",
        active = true,
        onlyNonZeroBalance = true,
      } = req.body;
      let allAccounts = [];
      let currentPage = parseInt(page);
      let hasMoreData = true;
      while (hasMoreData) {
        const params = {
          pageSize: parseInt(pageSize),
          page: currentPage,
          sort,
          sortBy,
          active: active === "true" || active === true,
          onlyNonZeroBalance:
            onlyNonZeroBalance === "true" || onlyNonZeroBalance === true,
        };
        const response = await axios.get(
          "https://api.tatum.io/v3/ledger/account",
          {
            headers: {
              "x-api-key": process.env.CRYPTO_API_KEY,
            },
            params,
          }
        );
        if (response.data && response.data.length > 0) {
          const customerIds = response.data.map(
            (account) => account.customerId
          );
          const cryptoDetails = await CryptoDetailsModal.find({
            crypto_customerid: { $in: customerIds },
          });
          const cryptoDetailsMap = {};
          cryptoDetails.forEach((detail) => {
            cryptoDetailsMap[detail.crypto_customerid] = detail;
          });
          const formattedAccounts = response.data.map((account) => {
            const cryptoDetail = cryptoDetailsMap[account.customerId];
            return {
              username: account.accountNumber || "N/A",
              availableBalance: parseFloat(
                account.balance.availableBalance
              ).toFixed(2),
              cryptoAddress: cryptoDetail
                ? cryptoDetail.crypto_address
                : "Address not found",
              privateKey: cryptoDetail ? cryptoDetail.private_key : null,
            };
          });
          allAccounts = [...allAccounts, ...formattedAccounts];
          if (response.data.length < parseInt(pageSize)) {
            hasMoreData = false;
          } else {
            currentPage++;
          }
        } else {
          hasMoreData = false;
        }
      }
      res.status(200).json({
        totalAccounts: allAccounts.length,
        accounts: allAccounts,
      });
    } catch (err) {
      console.error(
        "Error retrieving filtered accounts:",
        err.response ? err.response.data : err.message
      );
      res.status(500).json({
        error: "Error retrieving filtered accounts",
        details: err.message,
      });
    }
  }
);

// Tranfer TRX to all Available Balance Account& Transfer USDT back to Main USDT Address
router.post(
  "/admin/api/batch-process-accounts",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const {
        pageSize = 50,
        page = 0,
        sort = "desc",
        sortBy = "account_balance",
        active = true,
        onlyNonZeroBalance = true,
      } = req.body;
      let allAccounts = [];
      let currentPage = parseInt(page);
      let hasMoreData = true;
      const adminAddress = process.env.CRYPTO_ADMIN_TRX_ADDRESS;
      console.log("开始获取账户数据...");
      while (hasMoreData) {
        const params = {
          pageSize: parseInt(pageSize),
          page: currentPage,
          sort,
          sortBy,
          active: active === "true" || active === true,
          onlyNonZeroBalance:
            onlyNonZeroBalance === "true" || onlyNonZeroBalance === true,
        };
        const response = await axios.get(
          "https://api.tatum.io/v3/ledger/account",
          {
            headers: {
              "x-api-key": process.env.CRYPTO_API_KEY,
            },
            params,
          }
        );
        if (response.data && response.data.length > 0) {
          const customerIds = response.data.map(
            (account) => account.customerId
          );
          const cryptoDetails = await CryptoDetailsModal.find({
            crypto_customerid: { $in: customerIds },
          });
          const cryptoDetailsMap = {};
          cryptoDetails.forEach((detail) => {
            cryptoDetailsMap[detail.crypto_customerid] = detail;
          });
          const formattedAccounts = response.data
            .map((account) => {
              const cryptoDetail = cryptoDetailsMap[account.customerId];
              if (
                cryptoDetail &&
                parseFloat(account.balance.availableBalance) > 0
              ) {
                return {
                  username: account.accountNumber || "N/A",
                  availableBalance: parseFloat(
                    account.balance.availableBalance
                  ),
                  cryptoAddress: cryptoDetail.crypto_address,
                  privateKey: cryptoDetail.private_key,
                  accountId: account.id,
                };
              }
              return null;
            })
            .filter((account) => account !== null)
            .filter((account) => account.cryptoAddress !== adminAddress);
          allAccounts = [...allAccounts, ...formattedAccounts];
          if (response.data.length < parseInt(pageSize)) {
            hasMoreData = false;
          } else {
            currentPage++;
          }
        } else {
          hasMoreData = false;
        }
      }
      const excludedAdminAccount = allAccounts.some(
        (a) => a.cryptoAddress === adminAddress
      );
      if (excludedAdminAccount) {
        console.log(`已从处理列表中排除主账户 ${adminAddress}`);
      }
      let totalAvailableBalance = 0;
      allAccounts.forEach((account) => {
        totalAvailableBalance += account.availableBalance;
      });
      console.log(
        `找到 ${
          allAccounts.length
        } 个有余额的账户需要处理，总可用余额: ${totalAvailableBalance.toFixed(
          2
        )} USDT`
      );
      console.log("检查每个账户的TRX余额...");
      let totalTrxNeeded = 0;
      const minTrxRequired = 20;
      for (let i = 0; i < allAccounts.length; i++) {
        const account = allAccounts[i];
        try {
          console.log(
            `检查账户 ${i + 1}/${allAccounts.length}: ${account.cryptoAddress}`
          );

          const accountBalanceUrl = `https://apilist.tronscan.org/api/account?address=${account.cryptoAddress}`;
          const accountBalanceResponse = await axios.get(accountBalanceUrl);
          const accountTrxBalance =
            accountBalanceResponse.data.balance / 1000000; // 转换为TRX

          const trxNeeded = Math.max(0, minTrxRequired - accountTrxBalance);
          totalTrxNeeded += trxNeeded;

          allAccounts[i] = {
            ...account,
            currentTrxBalance: accountTrxBalance,
            trxNeeded: trxNeeded,
          };
        } catch (error) {
          console.error(
            `检查账户 ${account.cryptoAddress} TRX余额失败:`,
            error.message
          );
          // 如果查询失败，保守估计需要完整的20 TRX
          totalTrxNeeded += minTrxRequired;
          allAccounts[i] = {
            ...account,
            currentTrxBalance: 0,
            trxNeeded: minTrxRequired,
          };
        }
        if (i < allAccounts.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
      console.log(`所有账户共需转入 ${totalTrxNeeded.toFixed(2)} TRX`);
      console.log(`检查主账户 ${adminAddress} 余额...`);
      const adminBalanceUrl = `https://apilist.tronscan.org/api/account?address=${adminAddress}`;
      const adminBalanceResponse = await axios.get(adminBalanceUrl);
      const adminTrxBalance = adminBalanceResponse.data.balance / 1000000;
      console.log(`主账户当前余额: ${adminTrxBalance.toFixed(2)} TRX`);
      console.log(`处理所有账户总共需要: ${totalTrxNeeded.toFixed(2)} TRX`);
      if (adminTrxBalance < totalTrxNeeded) {
        console.log(
          `警告: 主账户余额不足! 需要 ${totalTrxNeeded.toFixed(
            2
          )} TRX, 当前只有 ${adminTrxBalance.toFixed(2)} TRX`
        );
        console.log(
          `缺少 ${(totalTrxNeeded - adminTrxBalance).toFixed(2)} TRX`
        );
        return res.status(400).json({
          error: "Insufficient TRX balance in admin account",
          required: totalTrxNeeded,
          available: adminTrxBalance,
          deficit: totalTrxNeeded - adminTrxBalance,
          accountsToProcess: allAccounts.length,
          totalAvailableBalance: totalAvailableBalance.toFixed(2),
        });
      }
      console.log("开始向用户账户发送TRX...");
      const trxTransferResults = [];
      const batchSize = 5;
      for (let i = 0; i < allAccounts.length; i += batchSize) {
        const batch = allAccounts.slice(i, i + batchSize);
        console.log(
          `处理第 ${i + 1} 到 ${Math.min(
            i + batchSize,
            allAccounts.length
          )} 个账户的TRX转账...`
        );
        const batchPromises = batch.map(async (account) => {
          if (account.trxNeeded <= 0) {
            console.log(
              `跳过 ${account.username} (${
                account.cryptoAddress
              }): 已有足够TRX (${account.currentTrxBalance.toFixed(2)} TRX)`
            );
            return {
              username: account.username,
              address: account.cryptoAddress,
              success: true,
              skipped: true,
              currentTrxBalance: account.currentTrxBalance,
            };
          }
          try {
            const options = {
              method: "POST",
              url: "https://api.tatum.io/v3/tron/transaction",
              headers: {
                accept: "application/json",
                "content-type": "application/json",
                "x-api-key": process.env.CRYPTO_API_KEY,
              },
              data: {
                fromPrivateKey: process.env.CRYPTO_ADMIN_PRIVATE_KEY,
                to: account.cryptoAddress,
                amount: account.trxNeeded.toString(),
              },
            };
            const response = await axios.request(options);
            console.log(
              `成功向 ${account.username} (${
                account.cryptoAddress
              }) 发送 ${account.trxNeeded.toFixed(2)} TRX, txId: ${
                response.data.txId
              }`
            );
            return {
              username: account.username,
              address: account.cryptoAddress,
              success: true,
              txId: response.data.txId,
              amount: account.trxNeeded,
              currentTrxBalance: account.currentTrxBalance,
            };
          } catch (error) {
            console.error(
              `向 ${account.username} (${account.cryptoAddress}) 发送TRX失败:`,
              error.response?.data?.message || error.message
            );
            return {
              username: account.username,
              address: account.cryptoAddress,
              success: false,
              error: error.response?.data?.message || error.message,
              currentTrxBalance: account.currentTrxBalance,
            };
          }
        });
        const batchResults = await Promise.all(batchPromises);
        trxTransferResults.push(...batchResults);
        if (i + batchSize < allAccounts.length) {
          console.log("等待1秒后处理下一批...");
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
      console.log("等待TRX转账确认 (5秒)...");
      await new Promise((resolve) => setTimeout(resolve, 5000));
      console.log("开始从用户账户提取USDT到主账户...");
      const usdtTransferResults = [];
      for (let i = 0; i < allAccounts.length; i += batchSize) {
        const batch = allAccounts.slice(i, i + batchSize);
        console.log(
          `处理第 ${i + 1} 到 ${Math.min(
            i + batchSize,
            allAccounts.length
          )} 个账户的USDT转账...`
        );
        const batchPromises = batch.map(async (account) => {
          if (account.availableBalance <= 0) {
            return {
              username: account.username,
              address: account.cryptoAddress,
              success: false,
              error: "No available balance",
            };
          }
          try {
            const options = {
              method: "POST",
              url: "https://api.tatum.io/v3/tron/trc20/transaction",
              headers: {
                accept: "application/json",
                "content-type": "application/json",
                "x-api-key": process.env.CRYPTO_API_KEY,
              },
              data: {
                fromPrivateKey: account.privateKey,
                to: adminAddress,
                tokenAddress: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
                feeLimit: 20,
                amount: account.availableBalance.toString(),
              },
            };
            const response = await axios.request(options);
            console.log(
              `成功从 ${account.username} (${account.cryptoAddress}) 提取 ${account.availableBalance} USDT, txId: ${response.data.txId}`
            );
            const withdrawalOptions = {
              method: "POST",
              url: "https://api.tatum.io/v3/offchain/withdrawal",
              headers: {
                accept: "application/json",
                "content-type": "application/json",
                "x-api-key": process.env.CRYPTO_API_KEY,
              },
              data: {
                senderAccountId: account.accountId,
                address: adminAddress,
                amount: account.availableBalance.toString(),
                fee: "50",
              },
            };
            try {
              const withdrawalResponse = await axios.request(withdrawalOptions);
              console.log(
                `更新Tatum ledger成功, id: ${withdrawalResponse.data.id}, reference: ${withdrawalResponse.data.reference}`
              );
            } catch (withdrawalError) {
              console.error(
                `更新Tatum ledger失败:`,
                withdrawalError.response?.data?.message ||
                  withdrawalError.message
              );
            }
            return {
              username: account.username,
              address: account.cryptoAddress,
              success: true,
              txId: response.data.txId,
              amount: account.availableBalance,
            };
          } catch (error) {
            console.error(
              `从 ${account.username} (${account.cryptoAddress}) 提取USDT失败:`,
              error.response?.data?.message || error.message
            );
            return {
              username: account.username,
              address: account.cryptoAddress,
              success: false,
              error: error.response?.data?.message || error.message,
            };
          }
        });
        const batchResults = await Promise.all(batchPromises);
        usdtTransferResults.push(...batchResults);
        if (i + batchSize < allAccounts.length) {
          console.log("等待1秒后处理下一批...");
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
      const trxSuccessful = trxTransferResults.filter(
        (tx) => tx.success
      ).length;
      const trxFailed = trxTransferResults.length - trxSuccessful;
      const usdtSuccessful = usdtTransferResults.filter(
        (tx) => tx.success
      ).length;
      const usdtFailed = usdtTransferResults.length - usdtSuccessful;
      console.log(`====== 处理完成 ======`);
      console.log(`TRX转账: 成功 ${trxSuccessful} / 失败 ${trxFailed}`);
      console.log(`USDT提取: 成功 ${usdtSuccessful} / 失败 ${usdtFailed}`);
      console.log(`总账户数: ${allAccounts.length}`);
      res.status(200).json({
        message: "Batch processing completed",
        accountsProcessed: allAccounts.length,
        trxTransfers: {
          successful: trxSuccessful,
          failed: trxFailed,
          details: trxTransferResults,
        },
        usdtTransfers: {
          successful: usdtSuccessful,
          failed: usdtFailed,
          details: usdtTransferResults,
        },
      });
    } catch (error) {
      console.error("批量处理过程中发生错误:", error.message);
      res.status(500).json({
        error: "Batch processing failed",
        details: error.message,
      });
    }
  }
);

// Recover All TRX to Main USDT Address
router.post(
  "/admin/api/recover-trx-balances",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const cryptoDetails = await CryptoDetailsModal.find({});
      const adminAddress = process.env.CRYPTO_ADMIN_TRX_ADDRESS;
      console.log(`开始处理 ${cryptoDetails.length} 个账户的TRX回收...`);
      console.log(`主账户地址: ${adminAddress}`);
      const results = [];
      let totalRecoveredTrx = 0;
      for (let i = 0; i < cryptoDetails.length; i++) {
        const account = cryptoDetails[i];
        if (account.crypto_address === adminAddress) {
          console.log(`跳过主账户 ${account.crypto_address}`);
          continue;
        }
        try {
          console.log(
            `[${i + 1}/${cryptoDetails.length}] 检查账户 ${
              account.crypto_address
            } 的TRX余额...`
          );
          const accountBalanceUrl = `https://apilist.tronscan.org/api/account?address=${account.crypto_address}`;
          const accountBalanceResponse = await axios.get(accountBalanceUrl);
          const accountTrxBalance =
            accountBalanceResponse.data.balance / 1000000; // 转换为TRX
          if (accountTrxBalance > 0.1) {
            const transferAmount = Math.floor(accountTrxBalance);
            console.log(
              `账户 ${account.crypto_address} 有 ${accountTrxBalance.toFixed(
                2
              )} TRX，将转回 ${transferAmount} TRX`
            );
            if (transferAmount > 0) {
              try {
                const options = {
                  method: "POST",
                  url: "https://api.tatum.io/v3/tron/transaction",
                  headers: {
                    accept: "application/json",
                    "content-type": "application/json",
                    "x-api-key": process.env.CRYPTO_API_KEY,
                  },
                  data: {
                    fromPrivateKey: account.private_key,
                    to: adminAddress,
                    amount: transferAmount.toString(),
                  },
                };
                const response = await axios.request(options);
                totalRecoveredTrx += transferAmount;
                console.log(
                  `成功从 ${account.crypto_address} 转回 ${transferAmount} TRX 到主账户, txId: ${response.data.txId}`
                );
                results.push({
                  address: account.crypto_address,
                  username: account.username,
                  totalBalance: accountTrxBalance,
                  transferredAmount: transferAmount,
                  success: true,
                  txId: response.data.txId,
                });
              } catch (txError) {
                console.error(
                  `从 ${account.crypto_address} 转账失败:`,
                  txError.response?.data?.message || txError.message
                );
                results.push({
                  address: account.crypto_address,
                  username: account.username,
                  totalBalance: accountTrxBalance,
                  transferredAmount: 0,
                  success: false,
                  error: txError.response?.data?.message || txError.message,
                });
              }
            } else {
              console.log(
                `账户 ${account.crypto_address} 的整数TRX余额为0，跳过转账`
              );
              results.push({
                address: account.crypto_address,
                username: account.username,
                totalBalance: accountTrxBalance,
                transferredAmount: 0,
                success: true,
                skipped: true,
                reason: "Balance too small for integer transfer",
              });
            }
          } else {
            console.log(
              `账户 ${
                account.crypto_address
              } TRX余额太小 (${accountTrxBalance.toFixed(2)} TRX)，跳过转账`
            );
            results.push({
              address: account.crypto_address,
              username: account.username,
              totalBalance: accountTrxBalance,
              transferredAmount: 0,
              success: true,
              skipped: true,
              reason: "Balance below threshold",
            });
          }
        } catch (error) {
          console.error(
            `检查账户 ${account.crypto_address} 失败:`,
            error.message
          );
          results.push({
            address: account.crypto_address,
            username: account.username,
            error: error.message,
            success: false,
          });
        }
        if (i < cryptoDetails.length - 1) {
          const delay = 1000;
          console.log(`等待 ${delay / 1000} 秒后处理下一个账户...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
      const successful = results.filter((r) => r.success && !r.skipped).length;
      const skipped = results.filter((r) => r.skipped).length;
      const failed = results.filter((r) => !r.success).length;
      console.log(`===== TRX回收完成 =====`);
      console.log(`成功转账: ${successful}`);
      console.log(`跳过转账: ${skipped}`);
      console.log(`失败转账: ${failed}`);
      console.log(`总回收TRX: ${totalRecoveredTrx}`);
      res.status(200).json({
        message: "TRX recovery completed",
        totalAccounts: cryptoDetails.length,
        successful,
        skipped,
        failed,
        totalRecoveredTrx,
        details: results,
      });
    } catch (error) {
      console.error("TRX回收过程中发生错误:", error.message);
      res.status(500).json({
        error: "TRX recovery failed",
        details: error.message,
      });
    }
  }
);

// Deactivate All Account
router.post(
  "/admin/api/batch-deactivate-accounts",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const excludedAccountIds = ["6857f33dd83157a32a4affc0"];
      const cryptoDetails = await CryptoDetailsModal.find({});
      const accountIds = cryptoDetails
        .map((detail) => detail.crypto_accountid)
        .filter((id) => id && !excludedAccountIds.includes(id));
      console.log(`找到 ${accountIds.length} 个需要停用的账户ID`);
      console.log(`已排除 ${excludedAccountIds.join(", ")} 这些账户`);
      const results = [];
      let successCount = 0;
      let failCount = 0;
      for (let i = 0; i < accountIds.length; i++) {
        const accountId = accountIds[i];
        console.log(
          `[${i + 1}/${accountIds.length}] 正在停用账户 ${accountId}...`
        );
        try {
          const options = {
            method: "PUT",
            url: `https://api.tatum.io/v3/ledger/account/${accountId}/deactivate`,
            headers: {
              accept: "application/json",
              "x-api-key": process.env.CRYPTO_API_KEY,
            },
          };
          const response = await axios.request(options);
          console.log(`成功停用账户 ${accountId}`);
          results.push({
            accountId,
            success: true,
            status: response.status,
            message: "Account deactivated successfully",
          });
          successCount++;
        } catch (error) {
          console.error(
            `停用账户 ${accountId} 失败:`,
            error.response?.data || error.message
          );
          results.push({
            accountId,
            success: false,
            error: error.response?.data || error.message,
          });
          failCount++;
        }
        if (i < accountIds.length - 1) {
          const delay = 500;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
      console.log(`===== 批量停用完成 =====`);
      console.log(`成功停用: ${successCount}`);
      console.log(`失败停用: ${failCount}`);
      res.status(200).json({
        message: "Batch deactivation completed",
        totalAccounts: accountIds.length,
        successful: successCount,
        failed: failCount,
        excludedAccounts: excludedAccountIds,
        details: results,
      });
    } catch (error) {
      console.error("批量停用账户过程中发生错误:", error.message);
      res.status(500).json({
        error: "Batch deactivation failed",
        details: error.message,
      });
    }
  }
);

// Deactivate Certain Account
router.post(
  "/admin/api/deactivate-accounts",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const accountIds = [
        "6857f2346e76c04c0ce2aa11",
        "6857f2a7bf29dc5d5d3947c0",
        "6857f22f0e508a9945abcc22",
      ];
      if (
        !accountIds ||
        !Array.isArray(accountIds) ||
        accountIds.length === 0
      ) {
        return res.status(400).json({
          success: false,
          error: "accountIds array is required and cannot be empty",
        });
      }

      // 檢查環境變量
      if (!process.env.CRYPTO_API_KEY) {
        return res.status(500).json({
          success: false,
          error: "CRYPTO_API_KEY not configured",
        });
      }

      const results = [];
      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < accountIds.length; i++) {
        const accountId = accountIds[i];

        try {
          const options = {
            method: "PUT",
            url: `https://api.tatum.io/v3/ledger/account/${accountId}/deactivate`,
            headers: {
              accept: "application/json",
              "x-api-key": process.env.CRYPTO_API_KEY,
            },
          };

          const response = await axios.request(options);

          results.push({
            accountId,
            success: true,
            status: response.status,
          });
          successCount++;
        } catch (error) {
          results.push({
            accountId,
            success: false,
            error: error.response?.data || error.message,
          });
          failCount++;
        }

        // 延遲避免API限制
        if (i < accountIds.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      res.status(200).json({
        success: true,
        message: "Batch deactivation completed",
        totalAccounts: accountIds.length,
        successful: successCount,
        failed: failCount,
        results: results,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Batch deactivation failed",
        details: error.message,
      });
    }
  }
);

// router.post("/api/create-crypto-detail", async (req, res) => {
//   try {
//     // Destructure the request body to get the values
//     const {
//       username = "Admin",
//       user_id = "-",
//       index = "1",
//       crypto_currency = "USDT_TRON",
//       crypto_active = true,
//       crypto_address = "TXcyzovZT2gBzQGTCPewbebhXMBxYmcuDg",
//       crypto_qrimage = "-",
//       crypto_customerid = "66e59af2deb9bb93e1ffed00",
//       crypto_accountid = "66e59af2deb9bb93e1ffecff",
//     } = req.body;

//     // Create a new crypto detail entry
//     const newCryptoDetail = new CryptoDetailsModal({
//       username,
//       user_id,
//       index,
//       crypto_currency,
//       crypto_active,
//       crypto_address,
//       crypto_qrimage,
//       crypto_customerid,
//       crypto_accountid,
//     });

//     // Save the new entry to the database
//     const savedCryptoDetail = await newCryptoDetail.save();

//     // Send success response with the saved data
//     res.status(201).json({
//       message: "Crypto detail created successfully",
//       data: savedCryptoDetail,
//     });
//   } catch (error) {
//     console.error("Error creating crypto detail:", error);
//     res.status(500).json({
//       error: "Failed to create crypto detail",
//       details: error.message,
//     });
//   }
// });

module.exports = router;
