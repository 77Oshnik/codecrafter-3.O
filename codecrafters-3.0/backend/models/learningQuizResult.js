const mongoose = require('mongoose');

const graphNodeSchema = new mongoose.Schema({
  id: String,
  label: String,
  type: { type: String }
}, { _id: false });

const graphEdgeSchema = new mongoose.Schema({
  from: String,
  to: String,
  reason: String,
  weight: Number
}, { _id: false });

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
  }],
  rootCauseAnalysis: {
    summary: String,
    likelyRootCause: String,
    misconceptions: [{
      label: String,
      count: Number,
      severity: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' }
    }],
    prerequisiteGaps: [{
      topic: String,
      reason: String,
      severity: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
      confidence: Number
    }],
    wrongAnswerAnalyses: [{
      questionIndex: Number,
      question: String,
      selectedOption: String,
      correctOption: String,
      misconception: String,
      whyWrong: String,
      ragExplanation: String,
      confidence: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' }
    }],
    remediationPlan: [{
      step: Number,
      title: String,
      description: String,
      recommendedProblems: Number,
      successMetric: String
    }],
    visualData: {
      misconceptionBreakdown: [{
        label: String,
        count: Number,
        severity: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' }
      }],
      weakSubtopics: [{
        subtopicId: String,
        subtopicTitle: String,
        score: Number,
        attempts: Number,
        confidence: Number
      }],
      prerequisiteGraph: {
        nodes: [graphNodeSchema],
        edges: [graphEdgeSchema]
      }
    },
    generatedBy: String,
    generatedAt: Date
  }
}, { timestamps: true });

learningQuizResultSchema.index({ userId: 1, learningPathId: 1, topicId: 1 });

module.exports = mongoose.model('LearningQuizResult', learningQuizResultSchema);
