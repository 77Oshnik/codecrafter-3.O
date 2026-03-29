const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  id: String,
  question: String,
  options: [String],
  correctIndex: Number,
  difficulty: { type: String, enum: ['easy', 'medium', 'hard'] },
  subtopic: String,
  explanation: String
});

const learningAssessmentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  topic: { type: String, required: true },
  questions: [questionSchema],
  userAnswers: [Number],
  score: Number,
  totalQuestions: { type: Number, default: 10 },
  easyCorrect: { type: Number, default: 0 },
  mediumCorrect: { type: Number, default: 0 },
  hardCorrect: { type: Number, default: 0 },
  classifiedLevel: { type: String, enum: ['beginner', 'intermediate', 'advanced'] },
  completed: { type: Boolean, default: false },
  completedAt: Date
}, { timestamps: true });

module.exports = mongoose.model('LearningAssessment', learningAssessmentSchema);
