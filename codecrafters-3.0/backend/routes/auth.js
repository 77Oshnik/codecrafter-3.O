const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/user");
const OTP = require("../models/otp");
const { sendVerificationEmail } = require("../lib/email");

const router = express.Router();

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ error: "All fields are required." });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser?.isVerified) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    if (existingUser) {
      existingUser.name = name.trim();
      existingUser.password = hashedPassword;
      await existingUser.save();
    } else {
      await User.create({ name: name.trim(), email: normalizedEmail, password: hashedPassword });
    }

    await OTP.deleteMany({ email: normalizedEmail });

    const otp = generateOTP();
    await OTP.create({
      email: normalizedEmail,
      otp,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    await sendVerificationEmail(normalizedEmail, name.trim(), otp);

    return res.status(201).json({ message: "Verification code sent. Please check your email." });
  } catch (err) {
    console.error("[register]", err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

// POST /api/auth/verify-email
router.post("/verify-email", async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email?.trim() || !otp?.trim()) {
      return res.status(400).json({ error: "Email and verification code are required." });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const otpRecord = await OTP.findOne({ email: normalizedEmail });

    if (!otpRecord) {
      return res.status(400).json({ error: "Verification code not found or already expired." });
    }

    if (new Date() > otpRecord.expiresAt) {
      await OTP.deleteOne({ _id: otpRecord._id });
      return res.status(400).json({
        error: "Verification code has expired. Please sign up again to receive a new code.",
      });
    }

    if (otpRecord.otp !== otp.trim()) {
      return res.status(400).json({ error: "Invalid verification code." });
    }

    await User.updateOne({ email: normalizedEmail }, { $set: { isVerified: true } });
    await OTP.deleteOne({ _id: otpRecord._id });

    return res.json({ message: "Email verified successfully. You can now log in." });
  } catch (err) {
    console.error("[verify-email]", err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

// POST /api/auth/resend-otp
router.post("/resend-otp", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email?.trim()) {
      return res.status(400).json({ error: "Email is required." });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(404).json({ error: "No account found with this email." });
    }

    if (user.isVerified) {
      return res.status(400).json({ error: "This account is already verified." });
    }

    await OTP.deleteMany({ email: normalizedEmail });

    const otp = generateOTP();
    await OTP.create({
      email: normalizedEmail,
      otp,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    await sendVerificationEmail(normalizedEmail, user.name, otp);

    return res.json({ message: "A new verification code has been sent." });
  } catch (err) {
    console.error("[resend-otp]", err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

// POST /api/auth/login  — called by NextAuth's authorize callback
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email?.trim() || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    if (!user.isVerified) {
      return res.status(403).json({ error: "Please verify your email before logging in." });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    return res.json({
      id: user._id.toString(),
      name: user.name,
      email: user.email,
    });
  } catch (err) {
    console.error("[login]", err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

module.exports = router;
