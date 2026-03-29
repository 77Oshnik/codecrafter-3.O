const mongoose = require('mongoose');

const reviewHistorySchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  score: Number,
  quizResultId: mongoose.Schema.Types.ObjectId
});

const userMemorySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  learningPathId: { type: mongoose.Schema.Types.ObjectId, ref: 'LearningPath', required: true },
  topicId: { type: String, required: true },
  subtopicId: { type: String, required: true },
  topicTitle: { type: String, required: true },
  subtopicTitle: String,
  mainTopic: String,
  userLevel: String,

  // Performance metrics
  confidenceScore: { type: Number, default: 0 },
  correctCount: { type: Number, default: 0 },
  incorrectCount: { type: Number, default: 0 },
  totalAttempts: { type: Number, default: 0 },

  // Spaced repetition (SM-2 algorithm)
  easeFactor: { type: Number, default: 2.5 },
  intervalDays: { type: Number, default: 1 },
  repetitionNumber: { type: Number, default: 0 },
  lastReviewedAt: Date,
  nextReviewAt: Date,

  // Classification
  isWeak: { type: Boolean, default: false },
  isStrong: { type: Boolean, default: false },

  reviewHistory: [reviewHistorySchema]
}, { timestamps: true });

userMemorySchema.index({ userId: 1, learningPathId: 1, topicId: 1, subtopicId: 1 });
userMemorySchema.index({ userId: 1, nextReviewAt: 1 });
userMemorySchema.index({ userId: 1, isWeak: 1 });

module.exports = mongoose.model('UserMemory', userMemorySchema);
