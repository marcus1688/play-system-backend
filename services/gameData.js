const { User, GameDataLog } = require("../models/users.model");
const moment = require("moment");

async function getYesterdayGameLogs() {
  try {
    const yesterdayDate = moment()
      .tz("Australia/Sydney")
      .subtract(1, "day")
      .format("YYYY-MM-DD");

    const gameLogs = await GameDataLog.find({ date: yesterdayDate }).lean();

    const transformedData = {};

    gameLogs.forEach((log) => {
      const username = log.username;

      Object.entries(log.gameCategories).forEach(([category, games]) => {
        if (!transformedData[category]) {
          transformedData[category] = {};
        }

        if (!transformedData[category][username]) {
          transformedData[category][username] = {
            turnover: 0,
            winloss: 0,
          };
        }

        Object.values(games).forEach((gameData) => {
          transformedData[category][username].turnover += Number(
            gameData.turnover || 0
          );
          transformedData[category][username].winloss += Number(
            gameData.winloss || 0
          );
        });

        transformedData[category][username].turnover = Number(
          transformedData[category][username].turnover.toFixed(2)
        );
        transformedData[category][username].winloss = Number(
          transformedData[category][username].winloss.toFixed(2)
        );
      });
    });

    return transformedData;
  } catch (error) {
    console.error("Failed to get yesterday's game logs:", error);
    throw error;
  }
}

module.exports = { getYesterdayGameLogs };
