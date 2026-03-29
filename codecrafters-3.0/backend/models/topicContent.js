const mongoose = require('mongoose');

const topicContentSchema = new mongoose.Schema({
  learningPathId: { type: mongoose.Schema.Types.ObjectId, ref: 'LearningPath', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  topicId: { type: String, required: true },
  subtopicId: { type: String, required: true },
  topicTitle: String,
  subtopicTitle: String,
  userLevel: String,
  contentType: { type: String, enum: ['standard', 'revision'], default: 'standard' },
  mainTopic: String,
  content: String,
  keyPoints: [String],
  examples: [String],
  youtubeSearchQuery: String,
  quizId: { type: mongoose.Schema.Types.ObjectId, ref: 'LearningQuiz' },
  generatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

topicContentSchema.index({ learningPathId: 1, topicId: 1, subtopicId: 1 });

module.exports = mongoose.model('TopicContent', topicContentSchema);
