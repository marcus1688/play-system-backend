const roles = [
  { value: "superadmin", label: "Super Admin" },
  { value: "admin", label: "Admin" },
  { value: "operator", label: "Operator" },
  { value: "staff", label: "Staff" },
  { value: "demo", label: "Demo" },
];

const modulePermissions = {
  transaction: {
    label: "Transaction",
    permissions: [
      { value: "transactionlist", label: "Transaction List" },
      { value: "transactionlog", label: "Transaction Log" },
    ],
  },
  user: {
    label: "User",
    permissions: [
      { value: "userlist", label: "User List" },
      { value: "userlog", label: "User Log" },
      { value: "phonenumber", label: "View Full Phone Number" },
    ],
  },
  agent: {
    label: "Agent",
    permissions: [
      { value: "agentsetting", label: "Agent Setting" },
      { value: "agentreport", label: "Agent Report" },
    ],
  },
  website: {
    label: "Website",
    permissions: [
      { value: "generalsetting", label: "General Setting" },
      { value: "popup", label: "Popup" },
      { value: "review", label: "Review" },
      { value: "leaderboard", label: "Leaderboard" },
      { value: "aboutus", label: "About Us" },
      { value: "announcements", label: "Announcements" },
      { value: "faq", label: "FAQ" },
    ],
  },
  luckyspin: {
    label: "Lucky Spin",
    permissions: [
      { value: "luckyspinsetting", label: "Lucky Spin Setting" },
      { value: "luckyspinreport", label: "Lucky Spin Report" },
    ],
  },
  blog: {
    label: "Blog",
    permissions: [{ value: "bloglist", label: "Blog List" }],
  },
  mail: {
    label: "Mail",
    permissions: [{ value: "maillist", label: "Mail List" }],
  },
  feedback: {
    label: "Feedback",
    permissions: [{ value: "feedbacklist", label: "Feedback List" }],
  },
  promocode: {
    label: "Promo Code",
    permissions: [
      { value: "promocodelist", label: "Promo Code List" },
      { value: "promocodereport", label: "Promo Code Report" },
    ],
  },
  kiosk: {
    label: "Kiosk",
    permissions: [
      { value: "kioskcategory", label: "Kiosk Category" },
      { value: "kiosklist", label: "Kiosk List" },
      { value: "kioskreport", label: "Kiosk Report" },
      { value: "kioskbalance", label: "Kiosk Balance" },
    ],
  },
  bank: {
    label: "Bank",
    permissions: [
      { value: "banklist", label: "Bank List" },
      { value: "userbanklist", label: "User Bank List" },
      { value: "bankbalance", label: "Bank Balance" },
      { value: "banktransaction", label: "Bank Transaction" },
      { value: "bankreport", label: "Bank Report" },
    ],
  },
  crypto: {
    label: "Crypto",
    permissions: [{ value: "usdt", label: "USDT" }],
  },
  carousel: {
    label: "Carousel",
    permissions: [{ value: "carousellist", label: "Carousel List" }],
  },
  admin: {
    label: "Admin",
    permissions: [
      { value: "adminlist", label: "Admin List" },
      { value: "adminlog", label: "Admin Log" },
      { value: "adminreport", label: "Admin Report" },
    ],
  },
  promotion: {
    label: "Promotion",
    permissions: [
      { value: "promotioncategory", label: "Promotion Category" },
      { value: "promotionlist", label: "Promotion List" },
      { value: "promotionreport", label: "Promotion Report" },
    ],
  },
  vip: {
    label: "VIP",
    permissions: [{ value: "viplist", label: "VIP List" }],
  },
  seo: {
    label: "SEO",
    permissions: [{ value: "pages", label: "Seo Pages" }],
  },
  verification: {
    label: "Verification",
    permissions: [
      { value: "sms", label: "Verification SMS" },
      { value: "email", label: "Verification Email" },
    ],
  },
  paymentgateway: {
    label: "Payment Gateway",
    permissions: [
      { value: "list", label: "Payment Gateway List" },
      { value: "report", label: "Payment Gateway Report" },
    ],
  },

  rebate: {
    label: "Rebate",
    permissions: [
      { value: "rebatesetting", label: "Rebate Setting" },
      { value: "rebatereport", label: "Rebate Report" },
    ],
  },
  report: {
    label: "Report",
    permissions: [
      { value: "summaryreport", label: "Summary Report" },
      { value: "playerreport", label: "Player Report" },
    ],
  },
  setting: {
    label: "Setting",
    permissions: [
      { value: "whitelistip", label: "Whitelist IP" },
      { value: "changepassword", label: "Change Password" },
    ],
  },
};

module.exports = { roles, modulePermissions };
