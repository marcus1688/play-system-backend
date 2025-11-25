const express = require("express");
const router = express.Router();
const { User } = require("../models/users.model");
const UserWalletLog = require("../models/userwalletlog.model");
const { authenticateToken } = require("../auth/auth");
const { authenticateAdminToken } = require("../auth/adminAuth");
const { updateKioskBalance } = require("../services/kioskBalanceService");
const kioskbalance = require("../models/kioskbalance.model");

const AGENT_LEVEL_REQUIREMENTS = [
  {
    level: 1,
    requiredVipLevel: 3,
    requiredCount: 3,
    bonus: 100,
  },
  {
    level: 2,
    requiredVipLevel: 6,
    requiredCount: 3,
    bonus: 500,
  },
  {
    level: 3,
    requiredVipLevel: 9,
    requiredCount: 3,
    bonus: 2000,
  },
  {
    level: 4,
    requiredVipLevel: 15,
    requiredCount: 3,
    bonus: 5000,
  },
  {
    level: 5,
    requiredVipLevel: 18,
    requiredCount: 3,
    bonus: 10000,
  },
];

// async function checkAndUpdateAgentLevel(userId) {
//   try {
//     const agent = await User.findById(userId).populate("referrals.user_id");
//     if (!agent) {
//       throw new Error("Agent not found");
//     }
//     const downlines = agent.referrals.map((ref) => ref.user_id).filter(Boolean);
//     let newLevel = agent.agentLevel || 0;
//     let bonusToAward = 0;

//     for (const requirement of AGENT_LEVEL_REQUIREMENTS) {
//       const qualifiedDownlines = downlines.filter(
//         (user) => user.viplevel >= requirement.requiredVipLevel
//       );

//       if (qualifiedDownlines.length >= requirement.requiredCount) {
//         if (requirement.level > newLevel) {
//           newLevel = requirement.level;
//           bonusToAward = requirement.bonus;
//         }
//       }
//     }

//     if (newLevel > (agent.agentLevel || 0)) {
//       await User.findByIdAndUpdate(userId, {
//         $set: { agentLevel: newLevel },
//         $inc: { wallet: bonusToAward },
//       });

//       await new UserWalletLog({
//         user_id: userId,
//         type: "BONUS",
//         amount: bonusToAward,
//         promotionnameEN: `Agent Level ${newLevel} Upgrade Bonus`,
//         status: "APPROVED",
//       }).save();

//       return {
//         success: true,
//         oldLevel: agent.agentLevel || 0,
//         newLevel,
//         bonusAwarded: bonusToAward,
//         qualifiedDownlines: downlines.filter(
//           (user) =>
//             user.viplevel >=
//             AGENT_LEVEL_REQUIREMENTS[newLevel - 1].requiredVipLevel
//         ).length,
//       };
//     }

//     return {
//       success: true,
//       oldLevel: agent.agentLevel || 0,
//       newLevel: agent.agentLevel || 0,
//       bonusAwarded: 0,
//       qualifiedDownlines: downlines.length,
//     };
//   } catch (error) {
//     console.error("Error in checkAndUpdateAgentLevel:", error);
//     throw error;
//   }
// }

async function checkAndUpdateAgentLevel(userId) {
  try {
    console.log(`Checking and updating agent level for user: ${userId}`);

    // Fetch the agent
    const agent = await User.findById(userId).populate("referrals.user_id");
    if (!agent) {
      throw new Error("Agent not found");
    }
    console.log("Agent details:", {
      userId: agent._id,
      agentLevel: agent.agentLevel,
      referrals: agent.referrals.length,
    });

    // Get downlines
    const downlines = agent.referrals.map((ref) => ref.user_id).filter(Boolean);
    console.log("Downlines count:", downlines.length);

    let newLevel = agent.agentLevel || 0;
    let bonusToAward = 0;

    // Iterate over the agent level requirements
    for (const requirement of AGENT_LEVEL_REQUIREMENTS) {
      console.log("Checking requirement:", requirement);

      const qualifiedDownlines = downlines.filter(
        (user) => user.viplevel >= requirement.requiredVipLevel
      );
      console.log(
        `Qualified downlines for Level ${requirement.level}:`,
        qualifiedDownlines.length
      );

      if (qualifiedDownlines.length >= requirement.requiredCount) {
        if (requirement.level > newLevel) {
          newLevel = requirement.level;
          bonusToAward = requirement.bonus;
          console.log(
            `New level achieved: ${newLevel}, Bonus: ${bonusToAward}`
          );
        }
      }
    }

    if (newLevel > (agent.agentLevel || 0)) {
      console.log(
        `Updating agent level from ${agent.agentLevel || 0} to ${newLevel}`
      );

      if (bonusToAward > 0) {
        const kioskSettings = await kioskbalance.findOne({});
        if (kioskSettings && kioskSettings.status) {
          const kioskResult = await updateKioskBalance(
            "subtract",
            bonusToAward,
            {
              username: agent.username,
              transactionType: "agent upgrade bonus",
              remark: `Agent Upgrade Bonus`,
              processBy: "system",
            }
          );

          if (!kioskResult.success) {
            console.error(
              `Failed to update kiosk balance for agent ${agent.username}: ${kioskResult.message}`
            );
          }
          console.log(
            `Kiosk balance updated for agent level bonus: ${bonusToAward}`
          );
        }
      }

      // Update user with new level and bonus
      await User.findByIdAndUpdate(userId, {
        $set: { agentLevel: newLevel },
        $inc: { wallet: bonusToAward },
      });

      console.log(`Bonus of ${bonusToAward} awarded to user: ${userId}`);

      // Log the bonus in the wallet log
      await new UserWalletLog({
        user_id: userId,
        type: "BONUS",
        amount: bonusToAward,
        promotionnameEN: `Agent Level ${newLevel} Upgrade Bonus`,
        status: "APPROVED",
      }).save();

      console.log("Bonus log created for user:", userId);

      return {
        success: true,
        oldLevel: agent.agentLevel || 0,
        newLevel,
        bonusAwarded: bonusToAward,
        qualifiedDownlines: downlines.filter(
          (user) =>
            user.viplevel >=
            AGENT_LEVEL_REQUIREMENTS[newLevel - 1].requiredVipLevel
        ).length,
      };
    }

    console.log("No level update needed for user:", userId);
    return {
      success: true,
      oldLevel: agent.agentLevel || 0,
      newLevel: agent.agentLevel || 0,
      bonusAwarded: 0,
      qualifiedDownlines: downlines.length,
    };
  } catch (error) {
    console.error("Error in checkAndUpdateAgentLevel:", error);
    throw error;
  }
}

// User endpoint to check their own agent level
router.post("/api/check-agent-level", authenticateToken, async (req, res) => {
  try {
    const result = await checkAndUpdateAgentLevel(req.user.userId);
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error checking agent level:", error);
    res.status(500).json({
      success: false,
      message: "Failed to check agent level",
      error: error.message,
    });
  }
});

// Admin endpoint to check any user's agent level
router.post(
  "/admin/api/check-agent-level/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const result = await checkAndUpdateAgentLevel(req.params.userId);
      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error("Error checking agent level:", error);
      res.status(500).json({
        success: false,
        message: "Failed to check agent level",
        error: error.message,
      });
    }
  }
);

// Get agent level requirements
router.get("/api/agent-level-requirements", async (req, res) => {
  try {
    res.json({
      success: true,
      data: AGENT_LEVEL_REQUIREMENTS,
    });
  } catch (error) {
    console.error("Error getting agent level requirements:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get agent level requirements",
      error: error.message,
    });
  }
});

module.exports = router;
