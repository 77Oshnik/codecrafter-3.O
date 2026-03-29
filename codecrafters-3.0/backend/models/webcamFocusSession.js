const mongoose = require('mongoose');

const webcamFocusSessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  learningPathId: { type: mongoose.Schema.Types.ObjectId, ref: 'LearningPath', required: true, index: true },
  topicId: { type: String, required: true, index: true },
  subtopicId: { type: String, required: true, index: true },
  source: { type: String, default: 'learn-topic-page' },
  cameraEnabled: { type: Boolean, default: true },
  startedAt: { type: Date, default: Date.now, index: true },
  endedAt: Date,
  durationMs: { type: Number, default: 0 },
  focusedMs: { type: Number, default: 0 },
  awayMs: { type: Number, default: 0 },
  interruptions: { type: Number, default: 0 },
  eventsCount: { type: Number, default: 0 },
  focusScore: { type: Number, default: 0 },
  latestFaceDetected: { type: Boolean, default: false },
  latestHeadYaw: { type: Number, default: 0 },
  latestHeadPitch: { type: Number, default: 0 },
  latestEyesOpenProb: { type: Number, default: 0 },
  latestBlinkClosureMs: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('WebcamFocusSession', webcamFocusSessionSchema);
