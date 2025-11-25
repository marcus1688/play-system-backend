const jwt = require("jsonwebtoken");

const generateToken = async (userId) => {
  const secret = process.env.JWT_ADMIN_SECRET;
  return jwt.sign({ userId }, secret, {
    expiresIn: "30m",
  });
};

const generateRefreshToken = async (userId) => {
  const secret = process.env.ADMIN_REFRESH_TOKEN_SECRET;
  return jwt.sign({ userId }, secret, {
    expiresIn: "1d",
  });
};

const authenticateAdminToken = (req, res, next) => {
  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return res
      .status(200)
      .json({ authorized: false, message: "No token provided." });
  }
  const companyId = req.headers["x-company-id"];
  if (!companyId) {
    return res
      .status(200)
      .json({ authorized: false, message: "No company id." });
  }
  const companyIdUpper = companyId.toUpperCase();
  const secret =
    process.env[`JWT_ADMIN_SECRET_${companyIdUpper}`] ||
    process.env.JWT_ADMIN_SECRET;
  if (!secret) {
    return res
      .status(200)
      .json({ authorized: false, message: "JWT secret not configured." });
  }

  jwt.verify(token, secret, (err, user) => {
    if (err) {
      return res
        .status(200)
        .json({ authorized: false, message: "Invalid token." });
    }
    req.user = { ...user, companyId };
    next();
  });
};

const handleLoginSuccess = async (userId) => {
  const token = await generateToken(userId);
  const refreshToken = await generateRefreshToken(userId);
  return {
    token,
    refreshToken,
  };
};

module.exports = {
  generateToken,
  generateRefreshToken,
  authenticateAdminToken,
  handleLoginSuccess,
};
