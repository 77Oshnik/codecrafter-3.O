const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const authRoutes = require("./routes/auth");
const chatRoutes = require("./routes/chat");
const documentRoutes = require("./routes/documents");
const studyRoutes = require("./routes/study");
const youtubeRoutes = require("./routes/youtube");
const learningRoutes = require("./routes/learning");
const dashboardRoutes = require("./routes/dashboard");
const LearningQuiz = require("./models/learningQuiz");
const TopicContent = require("./models/topicContent");
const LearningQuizResult = require("./models/learningQuizResult");
const UserMemory = require("./models/userMemory");
const transcriptRoutes = require("./routes/transcript");

const app = express();

// Log every incoming request so we can see if it reaches the server
app.use((req, _res, next) => {
  console.log(`[${req.method}] ${req.path}`);
  next();
});

const allowedOrigins = [
  process.env.FRONTEND_URL || "http://localhost:3000",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

app.use(cors({
  origin(origin, callback) {
    // Allow non-browser requests and local frontend dev origins.
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use(express.json());

const mongoUri = process.env.MONGO_URI;

async function cleanupLegacyIndexes() {
  const targets = [
    LearningQuiz.collection.name,
    TopicContent.collection.name,
    LearningQuizResult.collection.name,
    UserMemory.collection.name,
  ];

  for (const collectionName of targets) {
    try {
      const collection = mongoose.connection.collection(collectionName);
      const indexes = await collection.indexes();
      const hasLegacySessionIndex = indexes.some((idx) => idx?.name === "sessionId_1");

      if (hasLegacySessionIndex) {
        await collection.dropIndex("sessionId_1");
        console.log(`[index cleanup] Dropped legacy index sessionId_1 on ${collectionName}`);
      }
    } catch (err) {
      console.warn(
        `[index cleanup] Skipped ${collectionName}: ${err?.message || err}`
      );
    }
  }
}

if (!mongoUri || mongoUri === "your_mongodb_connection_string_here") {
  console.error(
    "Missing MONGO_URI. Add your MongoDB connection string to backend/.env before starting the server."
  );
  process.exit(1);
}

mongoose
  .connect(mongoUri)
  .then(async () => {
    console.log("MongoDB Connected");
    await cleanupLegacyIndexes();
  })
  .catch((err) => console.log(err));

app.get("/", (req, res) => {
  res.json({ status: "API Running" });
});

app.use("/api/auth", authRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/study", studyRoutes);
app.use("/api/youtube", youtubeRoutes);
app.use("/api/transcript", transcriptRoutes);
app.use("/api/learning", learningRoutes);
app.use("/api/dashboard", dashboardRoutes);

// Global error handler - catches anything Express 5 passes via next(err)
app.use((err, _req, res, _next) => {
  console.error('[Global error handler]', err?.message || err);
  console.error(err?.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
