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

const AGENT_CONFIG = {
  LEVEL_REQUIREMENTS: AGENT_LEVEL_REQUIREMENTS,
};

module.exports = AGENT_CONFIG;
