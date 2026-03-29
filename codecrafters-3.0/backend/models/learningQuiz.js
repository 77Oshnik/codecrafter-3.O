const mongoose = require('mongoose');

const learningQuizSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  learningPathId: { type: mongoose.Schema.Types.ObjectId, ref: 'LearningPath', required: true, index: true },
  topicId: { type: String, required: true },
  subtopicId: { type: String, required: true },
  topicTitle: String,
  subtopicTitle: String,
  mainTopic: String,
  userLevel: String,
  questions: [{
    question: String,
    options: [String],
    correctIndex: Number,
    explanation: String
  }]
}, { timestamps: true });

learningQuizSchema.index({ learningPathId: 1, topicId: 1, subtopicId: 1 });

module.exports = mongoose.model('LearningQuiz', learningQuizSchema);
