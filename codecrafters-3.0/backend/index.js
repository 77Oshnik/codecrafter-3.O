const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const authRoutes = require("./routes/auth");
const chatRoutes = require("./routes/chat");
const documentRoutes = require("./routes/documents");
const studyRoutes = require("./routes/study");

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:3000" }));
app.use(express.json());

const mongoUri = process.env.MONGO_URI;

if (!mongoUri || mongoUri === "your_mongodb_connection_string_here") {
  console.error(
    "Missing MONGO_URI. Add your MongoDB connection string to backend/.env before starting the server."
  );
  process.exit(1);
}

mongoose
  .connect(mongoUri)
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.log(err));

app.get("/", (req, res) => {
  res.json({ status: "API Running" });
});

app.use("/api/auth", authRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/study", studyRoutes);

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
