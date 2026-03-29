const express = require("express");
const mongoose = require("mongoose");
const { protect } = require("../middleware/auth");
const Conversation = require("../models/conversation");
const Document = require("../models/document");
const YouTubeVideo = require("../models/youtubeVideo");
const LearningPath = require("../models/learningPath");
const LearningQuizResult = require("../models/learningQuizResult");
const UserMemory = require("../models/userMemory");

const router = express.Router();

function getDayKey(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function calculateStreakFromDates(dateKeys) {
  if (!Array.isArray(dateKeys) || dateKeys.length === 0) return 0;
  const set = new Set(dateKeys.filter(Boolean));

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const todayKey = today.toISOString().slice(0, 10);
  const yesterdayKey = yesterday.toISOString().slice(0, 10);
  if (!set.has(todayKey) && !set.has(yesterdayKey)) return 0;

  let streak = 0;
  const cursor = set.has(todayKey) ? today : yesterday;

  while (true) {
    const key = cursor.toISOString().slice(0, 10);
    if (!set.has(key)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

router.get("/summary", protect, async (req, res) => {
  try {
    const userId = req.user.id;
    const userObjectId = mongoose.Types.ObjectId.isValid(userId)
      ? new mongoose.Types.ObjectId(userId)
      : null;

    const [
      totalConversations,
      conversationDocs,
      learningPaths,
      learningQuizAgg,
      memoryAgg,
      totalDocuments,
      readyDocuments,
      totalVideos,
      readyVideos,
      recentQuizResults,
      recentConversations,
      recentVideos,
    ] = await Promise.all([
      Conversation.countDocuments({ userId }),
      Conversation.find({ userId }).select("messages updatedAt createdAt").lean(),
      LearningPath.find({ userId })
        .select("_id topic status overallProgress completedTopics totalTopics lastActiveAt createdAt")
        .sort({ lastActiveAt: -1, createdAt: -1 })
        .lean(),
      LearningQuizResult.aggregate([
        { $match: { userId: userObjectId } },
        {
          $group: {
            _id: null,
            totalQuizzes: { $sum: 1 },
            avgScore: { $avg: "$percentage" },
          },
        },
      ]),
      UserMemory.aggregate([
        { $match: { userId: userObjectId } },
        {
          $group: {
            _id: null,
            weakCount: { $sum: { $cond: ["$isWeak", 1, 0] } },
            strongCount: { $sum: { $cond: ["$isStrong", 1, 0] } },
            dueToday: {
              $sum: {
                $cond: [{ $lte: ["$nextReviewAt", new Date()] }, 1, 0],
              },
            },
          },
        },
      ]),
      Document.countDocuments({ userId }),
      Document.countDocuments({ userId, status: "ready" }),
      YouTubeVideo.countDocuments({ userId }),
      YouTubeVideo.countDocuments({ userId, status: "ready" }),
      LearningQuizResult.find({ userId })
        .sort({ createdAt: -1 })
        .limit(8)
        .select("percentage topicId subtopicId createdAt")
        .lean(),
      Conversation.find({ userId })
        .sort({ updatedAt: -1 })
        .limit(8)
        .select("title updatedAt")
        .lean(),
      YouTubeVideo.find({ userId })
        .sort({ createdAt: -1 })
        .limit(8)
        .select("title videoId createdAt status")
        .lean(),
    ]);

    const totalMessages = conversationDocs.reduce(
      (sum, conv) => sum + (Array.isArray(conv.messages) ? conv.messages.length : 0),
      0
    );

    const activePaths = learningPaths.filter((p) => p.status !== "completed");
    const completedPaths = learningPaths.filter((p) => p.status === "completed");

    const avgLearningProgress = activePaths.length
      ? Math.round(activePaths.reduce((sum, p) => sum + (p.overallProgress || 0), 0) / activePaths.length)
      : 0;

    const quizStats = learningQuizAgg[0] || { totalQuizzes: 0, avgScore: 0 };
    const memoryStats = memoryAgg[0] || { weakCount: 0, strongCount: 0, dueToday: 0 };

    const dateKeys = [
      ...conversationDocs.map((c) => getDayKey(c.updatedAt || c.createdAt)),
      ...learningPaths.map((p) => getDayKey(p.lastActiveAt || p.createdAt)),
      ...recentQuizResults.map((q) => getDayKey(q.createdAt)),
      ...recentVideos.map((v) => getDayKey(v.createdAt)),
    ].filter(Boolean);

    const streakDays = calculateStreakFromDates(dateKeys);

    const recentActivity = [
      ...recentQuizResults.map((q) => ({
        type: "quiz",
        title: `${q.topicId} / ${q.subtopicId}`,
        score: q.percentage,
        createdAt: q.createdAt,
      })),
      ...recentConversations.map((c) => ({
        type: "chat",
        title: c.title || "Conversation",
        createdAt: c.updatedAt,
      })),
      ...recentVideos.map((v) => ({
        type: "youtube",
        title: v.title || v.videoId || "YouTube video",
        status: v.status,
        createdAt: v.createdAt,
      })),
    ]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 12);

    const latestActivePath = activePaths[0] || null;

    res.json({
      user: { id: userId },
      kpis: {
        streakDays,
        avgLearningProgress,
        totalQuizzes: quizStats.totalQuizzes || 0,
        avgQuizScore: Math.round(quizStats.avgScore || 0),
      },
      chat: {
        totalConversations,
        totalMessages,
      },
      learning: {
        totalPaths: learningPaths.length,
        activePaths: activePaths.length,
        completedPaths: completedPaths.length,
        dueToday: memoryStats.dueToday || 0,
        weakTopics: memoryStats.weakCount || 0,
        strongTopics: memoryStats.strongCount || 0,
        paths: learningPaths.map((p) => ({
          id: p._id,
          topic: p.topic,
          status: p.status,
          overallProgress: p.overallProgress || 0,
          completedTopics: p.completedTopics || 0,
          totalTopics: p.totalTopics || 0,
          lastActiveAt: p.lastActiveAt || p.createdAt,
        })),
        latestActivePath: latestActivePath
          ? {
            id: latestActivePath._id,
            topic: latestActivePath.topic,
            overallProgress: latestActivePath.overallProgress || 0,
          }
          : null,
      },
      youtube: {
        totalVideos,
        readyVideos,
      },
      documents: {
        totalDocuments,
        readyDocuments,
      },
      recentActivity,
    });
  } catch (err) {
    console.error("[dashboard/summary]", err);
    res.status(500).json({ error: "Failed to fetch dashboard summary" });
  }
});

module.exports = router;
