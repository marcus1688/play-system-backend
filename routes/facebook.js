const express = require("express");
const axios = require("axios"); // npm install axios
const router = express.Router();
const crypto = require("crypto");

const FB_ACCESS_TOKEN =
  "EAAVvm0Rf54MBO9VBHT5ZAxFmM4tVHWWGYqc3ciq0IzOWXjLMBSViGV4v9ZCaXZB1CbTCneFZBZBSbnaCBCpiGZArAbEdNMwRhX6gmh3D3bdgsjSVwARxL611XsKGZAXgJhaKgJeEOzvZCarUc4ZAbj6hae802RfZAvFhh5shoeqLCWpCHNmZCz4pKSE418lQpvmOkE0LQZDZD";
const FB_PIXEL_ID = "861478852201816";
const testEventCode = "TEST44983";

const TIKTOK_PIXEL_CODE = "D1CMKLRC77U2P4BEL9KG";
const TIKTOK_ACCESS_TOKEN = "69f8279d9d7b25b56f861cb7d79c64539c1cb20f";

function hashSHA256(str) {
  return crypto
    .createHash("sha256")
    .update(str.trim().toLowerCase())
    .digest("hex");
}

router.post("/test/facebook-amount", async (req, res) => {
  const amount = req.body.amount || 15000;
  const email = req.body.email || "test@example.com";
  const phone = req.body.phone || "1234567890";

  const accessToken = FB_ACCESS_TOKEN;
  const pixelId = FB_PIXEL_ID;

  try {
    const event = {
      event_name: "Deposit",
      event_time: Math.floor(Date.now() / 1000),
      event_id: `deposit_${Date.now()}`,
      action_source: "website",
      user_data: {
        em: hashSHA256(email),
        ph: hashSHA256(phone),
        client_ip_address: req.ip || "127.0.0.1",
        client_user_agent: req.headers["user-agent"] || "test-agent",
      },
      custom_data: {
        currency: "USD",
        value: Number(amount),
        content_type: "product",
        content_ids: ["recharge"],
        num_items: 1,
      },
    };

    const payload = {
      data: [event],
    };

    const url = `https://graph.facebook.com/v23.0/${pixelId}/events?access_token=${accessToken}`;

    const response = await axios.post(url, payload);

    console.log("发送到Facebook的数据:", JSON.stringify(event, null, 2));
    console.log("Facebook响应:", response.data);

    res.json({
      success: true,
      message: `成功发送金额: $${amount}`,
      amount: amount,
      facebook_response: response.data,
      sent_data: event,
    });
  } catch (error) {
    console.error("Facebook错误:", error.response?.data || error.message);
    res.json({
      success: false,
      message: "发送失败",
      error: error.response?.data || error.message,
    });
  }
});

// router.post("/test/facebook-amount", async (req, res) => {
//   const amount = req.body.amount || 8000;
//   const email = req.body.email || "test@example.com"; // 实际项目中传真实 email
//   const phone = req.body.phone || "1234567890";

//   const accessToken = FB_ACCESS_TOKEN;
//   const pixelId = FB_PIXEL_ID;
//   const testEventCode = "TEST44983";

//   try {
//     const event = {
//       event_name: "Deposit",
//       event_time: Math.floor(Date.now() / 1000),
//       event_id: `deposit_${Date.now()}`,
//       action_source: "website",
//       event_source_url: "https://yourdomain.com/deposit-success",
//       user_data: {
//         em: hashSHA256(email),
//         ph: hashSHA256(phone),
//         client_ip_address: req.ip || "127.0.0.1",
//         client_user_agent: req.headers["user-agent"] || "test-agent",
//       },
//       custom_data: {
//         currency: "USD",
//         value: Number(amount),
//         content_type: "product",
//         content_ids: ["recharge"],
//         num_items: 1,
//       },
//     };

//     const payload = {
//       data: [event],
//     };

//     const url = `https://graph.facebook.com/v23.0/${pixelId}/events?access_token=${accessToken}&test_event_code=${testEventCode}`;

//     const response = await axios.post(url, payload);

//     console.log("发送到Facebook的数据:", JSON.stringify(event, null, 2));
//     console.log("Facebook响应:", response.data);

//     res.json({
//       success: true,
//       message: `成功发送金额: $${amount}`,
//       amount: amount,
//       facebook_response: response.data,
//       sent_data: event,
//     });
//   } catch (error) {
//     console.error("Facebook错误:", error.response?.data || error.message);
//     res.json({
//       success: false,
//       message: "发送失败",
//       error: error.response?.data || error.message,
//     });
//   }
// })

router.post("/test/tiktok-amount", async (req, res) => {
  const amount = req.body.amount || 5000;
  const email = req.body.email || "test@example.com";
  const phone = req.body.phone || "1234567890";

  const tiktokPayload = {
    event_source_id: TIKTOK_PIXEL_CODE,
    event_source: "web",
    data: [
      {
        event: "Purchase",
        event_time: Math.floor(Date.now() / 1000),
        user: {
          email: hashSHA256(email), // 使用实际的哈希值
          phone_number: hashSHA256(phone),
          ip: req.ip || "127.0.0.1",
          user_agent: req.headers["user-agent"] || "Mozilla...",
        },
        properties: {
          value: Number(amount), // 使用传入的金额
          currency: "USD",
          page_url: "https://www.emtech88.com",
        },
      },
    ],
  };

  try {
    const response = await axios.post(
      "https://business-api.tiktok.com/open_api/v1.3/event/track/",
      tiktokPayload,
      {
        headers: {
          "Access-Token": TIKTOK_ACCESS_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("TikTok response:", response.data);
    res.json({ success: true, platform: "tiktok", data: response.data });
  } catch (error) {
    console.error("TikTok Error:", error.response?.data || error.message);
    res
      .status(500)
      .json({ success: false, error: error.response?.data || error.message });
  }
});

router.post("/test/tiktok-amount-test", async (req, res) => {
  const amount = req.body.amount || 10000;
  const email = req.body.email || "test@example.com";
  const phone = req.body.phone || "1234567890";

  const tiktokPayload = {
    event_source_id: TIKTOK_PIXEL_CODE,
    test_event_code: "TEST08246",
    event_source: "web",
    data: [
      {
        event: "Purchase",
        event_time: Math.floor(Date.now() / 1000),
        user: {
          email: hashSHA256(email), // 使用实际的哈希值
          phone_number: hashSHA256(phone),
          ip: req.ip || "127.0.0.1",
          user_agent: req.headers["user-agent"] || "Mozilla...",
        },
        properties: {
          value: Number(amount), // 使用传入的金额
          currency: "USD",
        },
      },
    ],
  };

  try {
    const response = await axios.post(
      "https://business-api.tiktok.com/open_api/v1.3/event/track/",
      tiktokPayload,
      {
        headers: {
          "Access-Token": TIKTOK_ACCESS_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("🔍 TikTok Test Event Response:", response.data);
    res.json({ success: true, platform: "tiktok-test", data: response.data });
  } catch (error) {
    console.error(
      "❌ TikTok Test Error:",
      error.response?.data || error.message
    );
    res
      .status(500)
      .json({ success: false, error: error.response?.data || error.message });
  }
});

module.exports = router;
