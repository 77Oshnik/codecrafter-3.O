const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema({
  email: { type: String, required: true, index: true },
  otp: { type: String, required: true },
  expiresAt: { type: Date, required: true, expires: 0 }, // MongoDB TTL — auto-deletes expired docs
});

module.exports = mongoose.model("OTP", otpSchema);
