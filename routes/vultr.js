const express = require("express");
const router = express.Router();
const axios = require("axios");
require("dotenv").config();
const VULTR_API_KEY = process.env.VULTR_API_KEY;
const API_BASE_URL = "https://api.vultr.com/v2";

const checkApiKey = (req, res, next) => {
  if (!VULTR_API_KEY) {
    return res.status(500).json({
      error: true,
      message: "服务器未配置 Vultr API 密钥",
    });
  }
  next();
};

const getApiConfig = () => {
  return {
    headers: {
      Authorization: `Bearer ${VULTR_API_KEY}`,
      "Content-Type": "application/json",
    },
  };
};

const CORRECT_PASSWORD = process.env.VULTR_CORRECT_PASSWORD;

router.post("/api/bare-metals/reboot", checkApiKey, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({
        error: true,
        message: "缺少必要参数: password",
      });
    }
    if (password !== CORRECT_PASSWORD) {
      return res.status(403).json({
        error: true,
        message: "密码不正确，无法执行重启操作",
      });
    }
    const response = await axios.post(
      `${API_BASE_URL}/bare-metals/ab54c5a2-e0e4-40ab-a00b-b26147401a54/reboot`,
      {},
      getApiConfig()
    );
    if (response.status === 204 || response.status === 200) {
      return res.json({
        success: true,
        message: `服务器正在重启`,
      });
    } else {
      throw new Error(`意外响应状态: ${response.status}`);
    }
  } catch (error) {
    console.error("重启服务器时出错:", error.message);
    if (error.response) {
      return res.status(error.response.status).json({
        error: true,
        code: error.response.status,
        message: error.response.data.error || "重启服务器失败",
      });
    } else {
      return res.status(500).json({
        error: true,
        message: `重启服务器失败: ${error.message}`,
      });
    }
  }
});

router.get("/api/servers", checkApiKey, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({
        error: true,
        message: "缺少必要参数: password",
      });
    }
    if (password !== CORRECT_PASSWORD) {
      return res.status(403).json({
        error: true,
        message: "密码不正确，无法执行重启操作",
      });
    }

    const response = await axios.get(
      `${API_BASE_URL}/bare-metals`,
      getApiConfig()
    );
    return res.json({
      success: true,
      servers: response.data.bare_metals || [],
    });
  } catch (error) {
    console.error("获取服务器列表时出错:", error.message);
    if (error.response) {
      return res.status(error.response.status).json({
        error: true,
        code: error.response.status,
        message: error.response.data.error || "获取服务器列表失败",
      });
    } else {
      return res.status(500).json({
        error: true,
        message: `获取服务器列表失败: ${error.message}`,
      });
    }
  }
});

module.exports = router;
