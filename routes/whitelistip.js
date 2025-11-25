const express = require("express");
const router = express.Router();
const WhitelistIP = require("../models/whitelistip.model");
const { authenticateAdminToken } = require("../auth/adminAuth");
const { adminUser } = require("../models/adminuser.model");

// Admin Get All Whitelisted IPs
router.get(
  "/admin/api/whitelist-ips",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const whitelistedIPs = await WhitelistIP.find().sort({ createdAt: -1 });
      res.status(200).json({
        success: true,
        whitelistedIPs,
      });
    } catch (error) {
      console.error("Error fetching whitelisted IPs:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
);

// Admin Create Whitelisted IP
router.post(
  "/admin/api/whitelist-ip",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.user.userId;
      const admin = await adminUser.findById(userId);
      if (!admin) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Admin user not found, please contact customer service",
            zh: "未找到管理员用户，请联系客户服务",
          },
        });
      }
      const { ips, description } = req.body;
      if (!ips || !Array.isArray(ips) || ips.length === 0) {
        return res.status(200).json({
          success: false,
          message: {
            en: "At least one IP address is required",
            zh: "至少需要提供一个 IP 地址",
          },
        });
      }
      const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
      const invalidIPs = ips.filter((ip) => !ipRegex.test(ip));
      // if (invalidIPs.length > 0) {
      //   return res.status(200).json({
      //     success: false,
      //     message: {
      //       en: "Invalid IP address format",
      //       zh: "无效的 IP 地址格式",
      //     },
      //     invalidIPs,
      //   });
      // }
      const existingIPs = await WhitelistIP.find({ ips: { $in: ips } });
      if (existingIPs.length > 0) {
        const duplicateIPs = [];
        existingIPs.forEach((record) => {
          record.ips.forEach((ip) => {
            if (ips.includes(ip) && !duplicateIPs.includes(ip)) {
              duplicateIPs.push(ip);
            }
          });
        });
        if (duplicateIPs.length > 0) {
          return res.status(200).json({
            success: false,
            message: {
              en: "Some IP addresses are already whitelisted",
              zh: "某些 IP 地址已在白名单中",
            },
            duplicateIPs,
          });
        }
      }
      const newWhitelistIP = new WhitelistIP({
        ips,
        description,
        createdBy: admin.username,
        lastUpdatedBy: admin.username,
      });
      await newWhitelistIP.save();
      res.status(200).json({
        success: true,
        message: {
          en: "Whitelist IP added successfully",
          zh: "白名单 IP 添加成功",
        },
        whitelistIP: newWhitelistIP,
      });
    } catch (error) {
      console.error("Error creating whitelist IP:", error);
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

// Admin Update Whitelisted IP
router.put(
  "/admin/api/whitelist-ip/:id",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.user.userId;
      const admin = await adminUser.findById(userId);
      if (!admin) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Admin user not found, please contact customer service",
            zh: "未找到管理员用户，请联系客户服务",
          },
        });
      }
      const { id } = req.params;
      const { ips, description } = req.body;
      const existingRecord = await WhitelistIP.findById(id);
      if (!existingRecord) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Whitelist IP record not found",
            zh: "找不到白名单 IP 记录",
          },
        });
      }
      if (!ips || !Array.isArray(ips) || ips.length === 0) {
        return res.status(200).json({
          success: false,
          message: {
            en: "At least one IP address is required",
            zh: "至少需要提供一个 IP 地址",
          },
        });
      }
      const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
      const invalidIPs = ips.filter((ip) => !ipRegex.test(ip));
      // if (invalidIPs.length > 0) {
      //   return res.status(200).json({
      //     success: false,
      //     message: {
      //       en: "Invalid IP address format",
      //       zh: "无效的 IP 地址格式",
      //     },
      //     invalidIPs,
      //   });
      // }
      const otherRecords = await WhitelistIP.find({
        _id: { $ne: id },
        ips: { $in: ips },
      });
      if (otherRecords.length > 0) {
        const duplicateIPs = [];
        otherRecords.forEach((record) => {
          record.ips.forEach((ip) => {
            if (ips.includes(ip) && !duplicateIPs.includes(ip)) {
              duplicateIPs.push(ip);
            }
          });
        });
        if (duplicateIPs.length > 0) {
          return res.status(200).json({
            success: false,
            message: {
              en: "Some IP addresses already exist in other whitelist records",
              zh: "某些 IP 地址已存在于其他白名单记录中",
            },
            duplicateIPs,
          });
        }
      }
      const updatedWhitelistIP = await WhitelistIP.findByIdAndUpdate(
        id,
        {
          ips,
          description,
          lastUpdatedBy: admin.username,
        },
        { new: true }
      );
      res.status(200).json({
        success: true,
        message: {
          en: "Whitelist IP updated successfully",
          zh: "白名单 IP 更新成功",
        },
        whitelistIP: updatedWhitelistIP,
      });
    } catch (error) {
      console.error("Error updating whitelist IP:", error);
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

// Admin Delete Whitelisted IP
router.delete(
  "/admin/api/whitelist-ip/:id",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { id } = req.params;
      const existingRecord = await WhitelistIP.findById(id);
      if (!existingRecord) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Whitelist IP record not found",
            zh: "找不到白名单IP记录",
          },
        });
      }
      await WhitelistIP.findByIdAndDelete(id);
      res.status(200).json({
        success: true,
        message: {
          en: "Whitelist IP record deleted successfully",
          zh: "白名单IP记录删除成功",
        },
      });
    } catch (error) {
      console.error("Error deleting whitelist IP:", error);
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

// Check if IP is whitelisted
router.get(
  "/admin/api/check-ip/:ip",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { ip } = req.params;
      const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
      // if (!ipRegex.test(ip)) {
      //   return res.status(400).json({
      //     success: false,
      //     message: "Invalid IP address format",
      //   });
      // }
      const isWhitelisted = await WhitelistIP.findOne({
        ips: ip,
      });
      res.status(200).json({
        success: true,
        isWhitelisted: !!isWhitelisted,
        details: isWhitelisted
          ? {
              _id: isWhitelisted._id,
              description: isWhitelisted.description,
              createdAt: isWhitelisted.createdAt,
              createdBy: isWhitelisted.createdBy,
            }
          : null,
      });
    } catch (error) {
      console.error("Error checking whitelist status:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
);

module.exports = router;
