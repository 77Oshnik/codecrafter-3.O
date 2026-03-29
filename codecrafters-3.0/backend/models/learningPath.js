const mongoose = require('mongoose');

const subtopicSchema = new mongoose.Schema({
  id: { type: String, required: true },
  title: { type: String, required: true },
  description: String,
  type: { type: String, enum: ['core', 'revision', 'remedial'], default: 'core' },
  adaptive: { type: Boolean, default: false },
  sourceSubtopicId: String,
  unlockReason: { type: String, enum: ['quiz-failed', 'low-confidence', 'scheduled-review'] },
  status: { type: String, enum: ['locked', 'available', 'completed'], default: 'locked' },
  quizScore: Number,
  quizAttempts: { type: Number, default: 0 },
  contentGenerated: { type: Boolean, default: false },
  completedAt: Date
});

const roadmapTopicSchema = new mongoose.Schema({
  id: { type: String, required: true },
  title: { type: String, required: true },
  description: String,
  order: { type: Number, required: true },
  difficulty: { type: String, enum: ['beginner', 'intermediate', 'advanced'] },
  estimatedTime: String,
  status: { type: String, enum: ['locked', 'available', 'in-progress', 'completed'], default: 'locked' },
  subtopics: [subtopicSchema],
  completedAt: Date
});

const learningPathSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  topic: { type: String, required: true },
  userLevel: { type: String, enum: ['beginner', 'intermediate', 'advanced'] },
  assessmentScore: Number,
  assessmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'LearningAssessment' },
  levelExplanation: String,
  strengths: [String],
  weaknesses: [String],
  status: { type: String, enum: ['assessing', 'active', 'completed'], default: 'assessing', index: true },
  roadmap: [roadmapTopicSchema],
  overallProgress: { type: Number, default: 0 },
  totalTopics: { type: Number, default: 0 },
  completedTopics: { type: Number, default: 0 },
  streakDays: { type: Number, default: 0 },
  lastActiveAt: Date
}, { timestamps: true });

module.exports = mongoose.model('LearningPath', learningPathSchema);
