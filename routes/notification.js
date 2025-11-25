const express = require("express");
const moment = require("moment");
const notification = require("../models/notification.model");
const { adminUser } = require("../models/adminuser.model");
const router = express.Router();
const { authenticateAdminToken } = require("../auth/adminAuth");

//创建Notification
router.post(
  "/api/createnotification",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const requestingUser = await adminUser.findById(req.user.userId);
      const { adminUsernames, title, text, status } = req.body;

      const users = await adminUser.find({ username: { $in: adminUsernames } });

      // Check if all provided usernames exist
      const foundUsernames = users.map((user) => user.username);
      const missingUsernames = adminUsernames.filter(
        (username) => !foundUsernames.includes(username)
      );

      if (missingUsernames.length > 0) {
        return res.status(200).json({
          message: `The following usernames were not found: ${missingUsernames.join(
            ", "
          )}`,
        });
      }

      const newNotification = new notification({
        company: requestingUser.company,
        status,
        adminUsernames,
        title,
        text,
        lastPushBy: requestingUser.username,
        lastPushDate: new Date(Date.now() + 8 * 60 * 60 * 1000),
        lastPushLog: "",
        remarks: [],
        viewedBy: [],
      });

      const savedNotification = await newNotification.save();

      res.status(200).json({ authorized: true, savedNotification });
    } catch (error) {
      console.log(error);
      res.status(200).json({ message: "Internal server error" });
    }
  }
);

//拿去指定的notification
router.get(
  "/api/specificnotifications",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const requestingUser = await adminUser.findById(req.user.userId);

      const activeNotifications = await notification.find({
        adminUsernames: requestingUser.username,
        status: "Active",
        viewedBy: { $ne: requestingUser.username },
      });

      const remainingNotifications = activeNotifications.length;

      res.status(200).json({
        authorized: true,
        activeNotifications,
        remainingNotifications,
        username: requestingUser.username,
      });
    } catch (error) {
      console.log(error);
      res.status(200).json({ error: "Internal server error" });
    }
  }
);

//当用户看了这notification就会把他定位已读
router.patch(
  "/api/notifications/:id/markasread",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { remark } = req.body;
      const requestingUser = await adminUser.findById(req.user.userId);

      if (!requestingUser) {
        return res.status(200).json({ error: "Admin user not found" });
      }

      // Step 1: Update the remarks array
      await notification.findOneAndUpdate(
        { _id: id, "remarks.username": requestingUser.username },
        {
          $set: {
            "remarks.$.remark": remark || "N/A",
          },
        }
      );

      await notification.findOneAndUpdate(
        { _id: id, "remarks.username": { $ne: requestingUser.username } },
        {
          $push: {
            remarks: {
              username: requestingUser.username,
              remark: remark || "N/A",
            },
          },
        }
      );

      // Step 2: Update the viewedBy array and the status if all users have viewed
      const notificationToUpdate = await notification.findOneAndUpdate(
        { _id: id, adminUsernames: requestingUser.username, status: "Active" },
        {
          $addToSet: { viewedBy: requestingUser.username },
        },
        { new: true }
      );

      if (
        notificationToUpdate.adminUsernames.length ===
        notificationToUpdate.viewedBy.length
      ) {
        notificationToUpdate.status = "Inactive";
      }

      const currentLog = `Notification viewed by ${
        requestingUser.username
      } on ${moment().utcOffset("+08:00").format("MM/DD/YY HH:mm:ss")}`;
      notificationToUpdate.lastPushLog = notificationToUpdate.lastPushLog
        ? `${notificationToUpdate.lastPushLog}\n${currentLog}`
        : currentLog;

      await notificationToUpdate.save();

      res.status(200).json({ authorized: true, notificationToUpdate });
    } catch (error) {
      console.log(error);
      res.status(200).json({ error: "Internal server error" });
    }
  }
);

//获取所有Notification
router.get("/api/notifications", authenticateAdminToken, async (req, res) => {
  try {
    const notifications = await notification.find();
    res.status(200).json({ authorized: true, notifications });
  } catch (error) {
    console.log(error);
    res.status(200).json({ error: "Internal server error" });
  }
});

router.get(
  "/api/notification/:id",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const notificationID = req.params.id;
      const requestingUser = await adminUser.findById(req.user.userId);
      const notificationData = await notification.findById(notificationID);

      if (!notificationData) {
        return res.status(200).send({ message: "Notification not found!" });
      }
      if (
        requestingUser.company != notificationData.company ||
        requestingUser.role !== "Owner"
      ) {
        return res.status(200).send({
          message:
            "Access denied. You can only access data within your company and if you are an owner!",
        });
      }

      res.status(200).send({ authorized: true, notificationData });
    } catch (error) {
      console.log(error);
      res.status(200).send({ message: "Internal server error" });
    }
  }
);

//Update Notification
router.patch(
  "/api/updatenotification/:id",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const notificationID = req.params.id;
      const requestingUser = await adminUser.findById(req.user.userId);
      const { adminUsernames, title, text, status, viewedBy } = req.body;

      const notificationData = await notification.findById(notificationID);

      if (
        requestingUser.company !== notificationData.company ||
        requestingUser.role !== "Owner"
      ) {
        return res.status(200).send({
          message:
            "Access denied. You can only update data within your company and if you are an owner!",
        });
      }

      const users = await adminUser.find({ username: { $in: adminUsernames } });

      // Check if all provided usernames exist
      const foundUsernames = users.map((user) => user.username);
      const missingUsernames = adminUsernames.filter(
        (username) => !foundUsernames.includes(username)
      );

      if (missingUsernames.length > 0) {
        return res.status(200).json({
          message: `The following usernames were not found: ${missingUsernames.join(
            ", "
          )}`,
        });
      }

      notificationData.adminUsernames = adminUsernames;
      notificationData.title = title;
      notificationData.text = text;
      notificationData.status = status;
      notificationData.viewedBy = viewedBy || notificationData.viewedBy;
      notificationData.lastPushBy = requestingUser.username;
      notificationData.lastPushDate = new Date(Date.now() + 8 * 60 * 60 * 1000);

      const updatedNotification = await notificationData.save();

      res.status(200).json({ authorized: true, updatedNotification });
    } catch (error) {
      console.log(error);
      res.status(200).json({ message: "Internal server error" });
    }
  }
);

router.delete(
  "/api/notification/:id",
  authenticateAdminToken,
  async (req, res) => {
    const notificationID = req.params.id;
    const requestingUser = await adminUser.findById(req.user.userId);

    // First, find the carousel to delete to know its company, destination, and order.
    const notificationToDelete = await notification.findById(notificationID);

    if (
      requestingUser.company != notificationToDelete.company ||
      requestingUser.role !== "Owner"
    ) {
      return res.status(200).send({
        message:
          "Access denied. You can only delete data within your company and if you are an owner!",
      });
    }

    try {
      await notification.findByIdAndDelete(notificationID);

      res.status(200).send({
        authorized: true,
        message: "Notification have been successfully deleted!",
      });
    } catch (error) {
      res.status(200).send({ message: "Internal server error" });
    }
  }
);

// 更新active的銀行
router.patch("/api/updatenotificationstatus/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const notifcationData = await notification.findById(id);
    if (!notifcationData) {
      return res.status(200).json({ message: "Notification not found" });
    }

    // Determine the new status based on the current one
    const newStatus =
      notifcationData.status === "Active" ? "Inactive" : "Active";

    // Update the user with the new status
    const updatedNotification = await notification.findByIdAndUpdate(
      id,
      { status: newStatus },
      { new: true }
    );

    // Successfully toggled and updated the user status
    res.json({ authorized: true, message: "Notification status updated" });
  } catch (error) {
    res.status(200).json({ message: "Internal server error" });
  }
});
module.exports = router;
