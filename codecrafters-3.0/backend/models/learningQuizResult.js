const mongoose = require('mongoose');

const learningQuizResultSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  learningPathId: { type: mongoose.Schema.Types.ObjectId, ref: 'LearningPath', required: true, index: true },
  learningQuizId: { type: mongoose.Schema.Types.ObjectId, ref: 'LearningQuiz', required: true },
  topicId: { type: String, required: true },
  subtopicId: { type: String, required: true },
  answers: [Number],
  score: Number,
  total: Number,
  percentage: Number,
  feedback: [{
    question: String,
    selectedIndex: Number,
    correctIndex: Number,
    isCorrect: Boolean,
    explanation: String
  }]
}, { timestamps: true });

learningQuizResultSchema.index({ userId: 1, learningPathId: 1, topicId: 1 });

module.exports = mongoose.model('LearningQuizResult', learningQuizResultSchema);
