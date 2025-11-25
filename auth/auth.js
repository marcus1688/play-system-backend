const jwt = require("jsonwebtoken");

const generateToken = async (userId) => {
  const secret = process.env.JWT_SECRET;
  return jwt.sign({ userId }, secret, {
    expiresIn: "8h",
  });
};

const generateGameToken = async (userId) => {
  const secret = process.env.JWT_GAME_SECRET;
  return jwt.sign({ userId }, secret, {
    expiresIn: "8h",
  });
};

const generateRefreshToken = async (userId) => {
  const secret = process.env.REFRESH_TOKEN_SECRET;
  return jwt.sign({ userId }, secret, {
    expiresIn: "1d",
  });
};

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];

  const token = authHeader && authHeader.split(" ")[1];

  if (token == null) {
    return res
      .status(200)
      .json({ authorized: false, message: "No token provided." });
  }
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res
        .status(200)
        .json({ authorized: false, message: "Invalid token." });
    }
    req.user = user;
    next();
  });
};

const handleLoginSuccess = async (userId) => {
  const token = await generateToken(userId);
  const newGameToken = await generateGameToken(userId);
  const refreshToken = await generateRefreshToken(userId);
  return {
    token,
    newGameToken,
    refreshToken,
  };
};

module.exports = {
  generateToken,
  generateGameToken,
  generateRefreshToken,
  authenticateToken,
  handleLoginSuccess,
};
