const express = require('express');
const router = express.Router();
const { protect: auth } = require('../middleware/auth');
const LearningPath = require('../models/learningPath');
const LearningAssessment = require('../models/learningAssessment');
const TopicContent = require('../models/topicContent');
const LearningQuiz = require('../models/learningQuiz');
const LearningQuizResult = require('../models/learningQuizResult');
const UserMemory = require('../models/userMemory');
const {
  generateAssessmentQuestions,
  classifyUserLevel,
  generateRoadmap,
  generateTopicContent,
  generateTopicQuiz,
  analyzeQuizRootCauses,
  calculateNextReview,
  getAdaptedLevel,
  ensureRevisionSubtopic,
  calculateProgress
} = require('../services/learningService');

// All routes require authentication
router.use(auth);

// ─── POST /api/learning/start ─────────────────────────────────────────────────
// Creates an assessment for a topic
router.post('/start', async (req, res) => {
  try {
    const { topic } = req.body;
    if (!topic || !topic.trim()) {
      return res.status(400).json({ error: 'Topic is required' });
    }

    const questions = await generateAssessmentQuestions(topic.trim());

    const assessment = await LearningAssessment.create({
      userId: req.user.id,
      topic: topic.trim(),
      questions,
      totalQuestions: questions.length
    });

    // Return questions without correct answers
    const safeQuestions = questions.map(q => ({
      id: q.id,
      question: q.question,
      options: q.options,
      difficulty: q.difficulty,
      subtopic: q.subtopic
    }));

    res.json({ assessmentId: assessment._id, topic: topic.trim(), questions: safeQuestions });
  } catch (err) {
    console.error('[/start] Assessment generation failed:', err?.message || err);
    res.status(500).json({ error: 'Failed to generate assessment', detail: err?.message });
  }
});

// ─── POST /api/learning/assessment/:id/submit ────────────────────────────────
// Submits assessment, classifies level, generates roadmap
router.post('/assessment/:id/submit', async (req, res) => {
  try {
    const { answers } = req.body;
    if (!Array.isArray(answers)) {
      return res.status(400).json({ error: 'answers array is required' });
    }

    const assessment = await LearningAssessment.findOne({
      _id: req.params.id,
      userId: req.user.id
    });
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });
    if (assessment.completed) return res.status(400).json({ error: 'Assessment already completed' });

    // Grade the assessment
    const questions = assessment.questions;
    let correct = 0, easyCorrect = 0, mediumCorrect = 0, hardCorrect = 0;

    questions.forEach((q, i) => {
      const isCorrect = answers[i] === q.correctIndex;
      if (isCorrect) {
        correct++;
        if (q.difficulty === 'easy') easyCorrect++;
        else if (q.difficulty === 'medium') mediumCorrect++;
        else if (q.difficulty === 'hard') hardCorrect++;
      }
    });

    const score = Math.round((correct / questions.length) * 100);

    // Classify level with AI
    const classification = await classifyUserLevel(
      assessment.topic, score, easyCorrect, mediumCorrect, hardCorrect
    );
    const level = classification.level || 'beginner';

    // Generate personalized roadmap
    const roadmapTopics = await generateRoadmap(
      assessment.topic, level, classification.weaknesses || []
    );

    // Set first topic and its first subtopic as available
    const roadmap = roadmapTopics.map((t, ti) => ({
      ...t,
      status: ti === 0 ? 'available' : 'locked',
      subtopics: t.subtopics.map((s, si) => ({
        ...s,
        status: ti === 0 && si === 0 ? 'available' : 'locked'
      }))
    }));

    // Save completed assessment
    await LearningAssessment.findByIdAndUpdate(assessment._id, {
      userAnswers: answers,
      score,
      easyCorrect,
      mediumCorrect,
      hardCorrect,
      classifiedLevel: level,
      completed: true,
      completedAt: new Date()
    });

    // Create learning path
    const learningPath = await LearningPath.create({
      userId: req.user.id,
      topic: assessment.topic,
      userLevel: level,
      assessmentScore: score,
      assessmentId: assessment._id,
      levelExplanation: classification.explanation,
      strengths: classification.strengths || [],
      weaknesses: classification.weaknesses || [],
      status: 'active',
      roadmap,
      totalTopics: roadmap.length,
      completedTopics: 0,
      overallProgress: 0,
      lastActiveAt: new Date()
    });

    res.json({
      learningPathId: learningPath._id,
      score,
      level,
      explanation: classification.explanation,
      strengths: classification.strengths || [],
      weaknesses: classification.weaknesses || [],
      recommendation: classification.recommendation,
      totalTopics: roadmap.length
    });
  } catch (err) {
    console.error('Submit assessment error:', err);
    res.status(500).json({ error: 'Failed to process assessment' });
  }
});

// ─── GET /api/learning/paths ──────────────────────────────────────────────────
// List all user's learning paths
router.get('/paths', async (req, res) => {
  try {
    const paths = await LearningPath.find({ userId: req.user.id })
      .select('topic userLevel status overallProgress totalTopics completedTopics createdAt lastActiveAt')
      .sort({ lastActiveAt: -1, createdAt: -1 });

    res.json(paths);
  } catch (err) {
    console.error('List paths error:', err);
    res.status(500).json({ error: 'Failed to fetch learning paths' });
  }
});

// ─── GET /api/learning/paths/:id ─────────────────────────────────────────────
// Get full roadmap for a learning path
router.get('/paths/:id', async (req, res) => {
  try {
    const path = await LearningPath.findOne({ _id: req.params.id, userId: req.user.id });
    if (!path) return res.status(404).json({ error: 'Learning path not found' });

    // Get recent quiz results for this path
    const recentResults = await LearningQuizResult.find({
      userId: req.user.id,
      learningPathId: path._id
    }).sort({ createdAt: -1 }).limit(10).select('topicId subtopicId percentage createdAt');

    // Get weak topics
    const weakMemories = await UserMemory.find({
      userId: req.user.id,
      learningPathId: path._id,
      isWeak: true
    }).select('topicTitle subtopicTitle confidenceScore');

    const recentRootCauseResults = await LearningQuizResult.find({
      userId: req.user.id,
      learningPathId: path._id,
      rootCauseAnalysis: { $exists: true }
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .select('subtopicId percentage createdAt rootCauseAnalysis');

    const misconceptionCounts = new Map();
    const prerequisiteGapCounts = new Map();

    recentRootCauseResults.forEach(result => {
      const misconceptions = result?.rootCauseAnalysis?.misconceptions || [];
      misconceptions.forEach(item => {
        const key = item?.label || 'Uncategorized misconception';
        misconceptionCounts.set(key, (misconceptionCounts.get(key) || 0) + (item?.count || 1));
      });

      const gaps = result?.rootCauseAnalysis?.prerequisiteGaps || [];
      gaps.forEach(item => {
        const key = item?.topic || 'Unknown prerequisite';
        prerequisiteGapCounts.set(key, (prerequisiteGapCounts.get(key) || 0) + 1);
      });
    });

    const rootCauseOverview = {
      totalAnalyses: recentRootCauseResults.length,
      misconceptionHotspots: Array.from(misconceptionCounts.entries())
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8),
      prerequisiteHotspots: Array.from(prerequisiteGapCounts.entries())
        .map(([topic, count]) => ({ topic, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8),
      weakSubtopics: weakMemories
        .map(item => ({
          subtopicTitle: item.subtopicTitle,
          topicTitle: item.topicTitle,
          confidenceScore: item.confidenceScore
        }))
        .sort((a, b) => a.confidenceScore - b.confidenceScore)
        .slice(0, 8)
    };

    res.json({
      ...path.toObject(),
      recentResults,
      weakTopics: weakMemories,
      rootCauseOverview
    });
  } catch (err) {
    console.error('Get path error:', err);
    res.status(500).json({ error: 'Failed to fetch learning path' });
  }
});

// ─── GET /api/learning/paths/:pathId/topics/:topicId/subtopics/:subtopicId/content
// Get or generate content for a subtopic
router.get('/paths/:pathId/topics/:topicId/subtopics/:subtopicId/content', async (req, res) => {
  try {
    const { pathId, topicId, subtopicId } = req.params;

    const learningPath = await LearningPath.findOne({ _id: pathId, userId: req.user.id });
    if (!learningPath) return res.status(404).json({ error: 'Learning path not found' });

    const topic = learningPath.roadmap.find(t => t.id === topicId);
    if (!topic) return res.status(404).json({ error: 'Topic not found' });

    const subtopic = topic.subtopics.find(s => s.id === subtopicId);
    if (!subtopic) return res.status(404).json({ error: 'Subtopic not found' });

    if (subtopic.status === 'locked') {
      return res.status(403).json({ error: 'Complete previous subtopics first' });
    }

    const sourceSubtopic = subtopic.sourceSubtopicId
      ? topic.subtopics.find(s => s.id === subtopic.sourceSubtopicId)
      : null;
    const contentType = subtopic.type === 'revision' ? 'revision' : 'standard';

    // Check cache
    let existing = await TopicContent.findOne({ learningPathId: pathId, topicId, subtopicId })
      .populate('quizId');
    if (existing && (existing.contentType || 'standard') === contentType) return res.json(existing);

    // Determine effective level (adaptive)
    const recentScores = await LearningQuizResult.find({
      userId: req.user.id,
      learningPathId: pathId
    }).sort({ createdAt: -1 }).limit(5).select('percentage');
    const scores = recentScores.map(r => r.percentage);
    const effectiveLevel = getAdaptedLevel(learningPath.userLevel, scores);

    // Generate content
    const { content, keyPoints, youtubeSearchQuery } = await generateTopicContent(
      learningPath.topic,
      topic.title,
      subtopic.title,
      effectiveLevel,
      {
        contentType,
        sourceSubtopicTitle: sourceSubtopic?.title || '',
        revisionReason: subtopic.unlockReason || ''
      }
    );

    const saved = existing
      ? await TopicContent.findByIdAndUpdate(
        existing._id,
        {
          topicTitle: topic.title,
          subtopicTitle: subtopic.title,
          userLevel: effectiveLevel,
          contentType,
          mainTopic: learningPath.topic,
          content,
          keyPoints,
          youtubeSearchQuery,
          generatedAt: new Date()
        },
        { new: true }
      )
      : await TopicContent.create({
        learningPathId: pathId,
        userId: req.user.id,
        topicId,
        subtopicId,
        topicTitle: topic.title,
        subtopicTitle: subtopic.title,
        userLevel: effectiveLevel,
        contentType,
        mainTopic: learningPath.topic,
        content,
        keyPoints,
        youtubeSearchQuery
      });

    // Mark topic as in-progress if it's available
    if (topic.status === 'available') {
      await LearningPath.updateOne(
        { _id: pathId, 'roadmap.id': topicId },
        { $set: { 'roadmap.$.status': 'in-progress', lastActiveAt: new Date() } }
      );
    }

    res.json(saved);
  } catch (err) {
    console.error('Get content error:', err);
    res.status(500).json({ error: 'Failed to generate content' });
  }
});

// ─── GET /api/learning/paths/:pathId/topics/:topicId/subtopics/:subtopicId/videos
// Fetch YouTube suggestions for a learning subtopic via YouTube Data API
router.get('/paths/:pathId/topics/:topicId/subtopics/:subtopicId/videos', async (req, res) => {
  try {
    const { pathId, topicId, subtopicId } = req.params;
    const requestedQuery = String(req.query.q || '').trim();
    const youtubeApiKey = process.env.YOUTUBE_API_KEY || process.env.GOOGLE_API_KEY;

    if (!youtubeApiKey) {
      return res.status(500).json({ error: 'YOUTUBE_API_KEY is not configured' });
    }

    const learningPath = await LearningPath.findOne({ _id: pathId, userId: req.user.id });
    if (!learningPath) return res.status(404).json({ error: 'Learning path not found' });

    const topic = learningPath.roadmap.find(t => t.id === topicId);
    if (!topic) return res.status(404).json({ error: 'Topic not found' });

    const subtopic = topic.subtopics.find(s => s.id === subtopicId);
    if (!subtopic) return res.status(404).json({ error: 'Subtopic not found' });
    if (subtopic.status === 'locked') {
      return res.status(403).json({ error: 'Complete previous subtopics first' });
    }

    const savedContent = await TopicContent.findOne({ learningPathId: pathId, topicId, subtopicId })
      .select('youtubeSearchQuery');

    const effectiveQuery = requestedQuery
      || savedContent?.youtubeSearchQuery
      || `${topic.title} ${subtopic.title} tutorial`;

    const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
    searchUrl.searchParams.set('part', 'snippet');
    searchUrl.searchParams.set('type', 'video');
    searchUrl.searchParams.set('videoEmbeddable', 'true');
    searchUrl.searchParams.set('maxResults', '6');
    searchUrl.searchParams.set('q', effectiveQuery);
    searchUrl.searchParams.set('key', youtubeApiKey);

    const searchRes = await fetch(searchUrl.toString());
    const searchJson = await searchRes.json();

    if (!searchRes.ok) {
      const errMessage = searchJson?.error?.message || 'Failed to fetch videos from YouTube API';
      return res.status(502).json({ error: errMessage });
    }

    const items = Array.isArray(searchJson.items) ? searchJson.items : [];
    const videos = items
      .map(item => {
        const videoId = item?.id?.videoId;
        const snippet = item?.snippet || {};
        if (!videoId) return null;

        return {
          videoId,
          title: snippet.title || 'Untitled video',
          channelTitle: snippet.channelTitle || '',
          description: snippet.description || '',
          publishedAt: snippet.publishedAt || null,
          thumbnailUrl:
            snippet?.thumbnails?.high?.url
            || snippet?.thumbnails?.medium?.url
            || snippet?.thumbnails?.default?.url
            || '',
          url: `https://www.youtube.com/watch?v=${videoId}`,
          embedUrl: `https://www.youtube.com/embed/${videoId}`
        };
      })
      .filter(Boolean);

    return res.json({ query: effectiveQuery, videos });
  } catch (err) {
    console.error('[learning/videos] error', err);
    return res.status(500).json({ error: 'Failed to fetch learning videos', detail: err?.message });
  }
});

// ─── GET /api/learning/paths/:pathId/topics/:topicId/subtopics/:subtopicId/quiz
// Get or generate quiz for a subtopic
router.get('/paths/:pathId/topics/:topicId/subtopics/:subtopicId/quiz', async (req, res) => {
  try {
    const { pathId, topicId, subtopicId } = req.params;
    console.log('[quiz get] hit', { pathId, topicId, subtopicId, userId: req.user?.id });

    const learningPath = await LearningPath.findOne({ _id: pathId, userId: req.user.id });
    if (!learningPath) return res.status(404).json({ error: 'Learning path not found' });

    const topic = learningPath.roadmap.find(t => t.id === topicId);
    if (!topic) return res.status(404).json({ error: 'Topic not found' });

    const subtopic = topic.subtopics.find(s => s.id === subtopicId);
    if (!subtopic) return res.status(404).json({ error: 'Subtopic not found' });

    if (subtopic.status === 'locked') {
      return res.status(403).json({ error: 'Complete previous subtopics first' });
    }

    // Check if quiz exists
    let quiz = await LearningQuiz.findOne({ learningPathId: pathId, topicId, subtopicId });
    if (quiz) {
      // Return questions without correct answers
      const safeQuestions = quiz.questions.map((q, i) => ({
        index: i,
        question: q.question,
        options: q.options
      }));
      return res.json({ quizId: quiz._id, questions: safeQuestions });
    }

    // Determine effective level
    const recentScores = await LearningQuizResult.find({
      userId: req.user.id,
      learningPathId: pathId
    }).sort({ createdAt: -1 }).limit(5).select('percentage');
    const effectiveLevel = getAdaptedLevel(learningPath.userLevel, recentScores.map(r => r.percentage));

    let questions;
    try {
      questions = await generateTopicQuiz(
        learningPath.topic, topic.title, subtopic.title, effectiveLevel
      );
    } catch (firstErr) {
      console.warn('[learning quiz] first generation attempt failed, retrying', {
        pathId,
        topicId,
        subtopicId,
        message: firstErr?.message
      });
      questions = await generateTopicQuiz(
        learningPath.topic, topic.title, subtopic.title, effectiveLevel
      );
    }

    quiz = await LearningQuiz.create({
      userId: req.user.id,
      learningPathId: pathId,
      topicId,
      subtopicId,
      topicTitle: topic.title,
      subtopicTitle: subtopic.title,
      mainTopic: learningPath.topic,
      userLevel: effectiveLevel,
      questions
    });

    // Update TopicContent with quizId
    await TopicContent.findOneAndUpdate(
      { learningPathId: pathId, topicId, subtopicId },
      { quizId: quiz._id }
    );

    const safeQuestions = questions.map((q, i) => ({
      index: i,
      question: q.question,
      options: q.options
    }));

    res.json({ quizId: quiz._id, questions: safeQuestions });
  } catch (err) {
    console.error('Get quiz error:', {
      message: err?.message,
      stack: err?.stack,
      params: req.params,
      userId: req.user?.id
    });
    res.status(500).json({ error: 'Failed to generate quiz', detail: err?.message });
  }
});

// ─── POST /api/learning/quiz/:quizId/submit
// Submit quiz answers, update memory, unlock next subtopic/topic
// Accepts pathId, topicId, subtopicId in the request body
router.post('/quiz/:quizId/submit', async (req, res) => {
  try {
    const { quizId } = req.params;
    const { pathId, topicId, subtopicId, answers } = req.body;
    console.log('[quiz submit] hit', {
      quizId,
      userId: req.user?.id,
      pathId,
      topicId,
      subtopicId,
      answerCount: Array.isArray(answers) ? answers.length : null
    });

    if (!pathId || !topicId || !subtopicId) {
      return res.status(400).json({ error: 'pathId, topicId, subtopicId required in body' });
    }
    if (!Array.isArray(answers)) {
      return res.status(400).json({ error: 'answers array is required' });
    }

    const [learningPath, quiz] = await Promise.all([
      LearningPath.findOne({ _id: pathId, userId: req.user.id }),
      LearningQuiz.findOne({ _id: quizId, learningPathId: pathId })
    ]);

    console.log('[quiz submit] fetched resources', {
      hasLearningPath: Boolean(learningPath),
      hasQuiz: Boolean(quiz),
      quizQuestionCount: quiz?.questions?.length || 0
    });

    if (!learningPath) return res.status(404).json({ error: 'Learning path not found' });
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

    // Grade quiz
    let score = 0;
    const feedback = quiz.questions.map((q, i) => {
      const isCorrect = answers[i] === q.correctIndex;
      if (isCorrect) score++;
      return {
        question: q.question,
        selectedIndex: answers[i],
        correctIndex: q.correctIndex,
        isCorrect,
        explanation: q.explanation
      };
    });

    const total = quiz.questions.length;
    const percentage = Math.round((score / total) * 100);
    console.log('[quiz submit] graded quiz', { score, total, percentage });

    const wrongAnswers = feedback
      .map((entry, index) => ({ entry, index }))
      .filter(item => !item.entry.isCorrect)
      .map(item => {
        const question = quiz.questions[item.index] || {};
        const selectedIdx = item.entry.selectedIndex;
        const selectedOption = Number.isInteger(selectedIdx)
          ? question.options?.[selectedIdx]
          : null;

        return {
          questionIndex: item.index,
          question: item.entry.question,
          selectedIndex: selectedIdx,
          selectedOption: selectedOption || 'No valid option selected',
          correctIndex: item.entry.correctIndex,
          correctOption: question.options?.[item.entry.correctIndex] || 'Correct option unavailable',
          correctExplanation: item.entry.explanation || ''
        };
      });

    const topicIndex = learningPath.roadmap.findIndex(t => t.id === topicId);
    const subtopicIndex = topicIndex >= 0
      ? learningPath.roadmap[topicIndex].subtopics.findIndex(s => s.id === subtopicId)
      : -1;

    const prerequisiteCandidates = topicIndex >= 0 && subtopicIndex > 0
      ? learningPath.roadmap[topicIndex].subtopics
        .slice(0, subtopicIndex)
        .filter(s => (s.type || 'core') === 'core')
        .map(s => ({
          subtopicId: s.id,
          title: s.title,
          score: s.quizScore ?? 50,
          attempts: s.quizAttempts ?? 0
        }))
      : [];

    const [weakMemoriesForAnalysis, relatedContent] = await Promise.all([
      UserMemory.find({
        userId: req.user.id,
        learningPathId: pathId,
        isWeak: true
      })
        .sort({ confidenceScore: 1, updatedAt: -1 })
        .limit(8)
        .select('topicId subtopicId topicTitle subtopicTitle confidenceScore totalAttempts'),
      TopicContent.find({
        learningPathId: pathId,
        topicId,
        subtopicId: { $in: [subtopicId, ...prerequisiteCandidates.map(s => s.subtopicId)] }
      })
        .select('subtopicId subtopicTitle keyPoints content')
        .sort({ updatedAt: -1 })
        .limit(8)
    ]);

    const ragContext = relatedContent.map(item => ({
      subtopicId: item.subtopicId,
      subtopicTitle: item.subtopicTitle,
      keyPoints: Array.isArray(item.keyPoints) ? item.keyPoints.slice(0, 5) : [],
      excerpt: String(item.content || '').slice(0, 500)
    }));

    const rootCauseAnalysis = await analyzeQuizRootCauses({
      mainTopic: learningPath.topic,
      topicTitle: quiz.topicTitle,
      subtopicTitle: quiz.subtopicTitle,
      userLevel: learningPath.userLevel,
      score,
      total,
      percentage,
      wrongAnswers,
      prerequisiteCandidates,
      weakMemories: weakMemoriesForAnalysis,
      ragContext
    });

    // Step 1: Save quiz result
    console.log('[quiz submit] step 1 – saving result');
    const result = await LearningQuizResult.create({
      userId: req.user.id,
      learningPathId: pathId,
      learningQuizId: quizId,
      topicId,
      subtopicId,
      answers,
      score,
      total,
      percentage,
      feedback,
      rootCauseAnalysis
    });
    console.log('[quiz submit] step 1 done – result id:', result._id);

    // Step 2: Update UserMemory (spaced repetition)
    console.log('[quiz submit] step 2 – updating memory');
    const topicForMemory = learningPath.roadmap.find(t => t.id === topicId);
    const subtopicForMemory = topicForMemory?.subtopics.find(s => s.id === subtopicId);

    let memory = await UserMemory.findOne({
      userId: req.user.id,
      learningPathId: pathId,
      topicId,
      subtopicId
    });

    if (!memory) {
      memory = new UserMemory({
        userId: req.user.id,
        learningPathId: pathId,
        topicId,
        subtopicId,
        topicTitle: topicForMemory?.title || topicId,
        subtopicTitle: subtopicForMemory?.title || subtopicId,
        mainTopic: learningPath.topic,
        userLevel: learningPath.userLevel,
        easeFactor: 2.5,
        intervalDays: 1,
        repetitionNumber: 0,
        correctCount: 0,
        incorrectCount: 0,
        totalAttempts: 0,
        reviewHistory: []
      });
    }

    const nextReview = calculateNextReview(memory, percentage);
    const correctCount = (memory.correctCount || 0) + score;
    const incorrectCount = (memory.incorrectCount || 0) + (total - score);
    const totalAttempts = (memory.totalAttempts || 0) + 1;
    const confidenceScore = Math.round((correctCount / (correctCount + incorrectCount)) * 100);

    memory.correctCount = correctCount;
    memory.incorrectCount = incorrectCount;
    memory.totalAttempts = totalAttempts;
    memory.confidenceScore = confidenceScore;
    memory.easeFactor = nextReview.easeFactor;
    memory.intervalDays = nextReview.intervalDays;
    memory.repetitionNumber = nextReview.repetitionNumber;
    memory.lastReviewedAt = new Date();
    memory.nextReviewAt = nextReview.nextReviewAt;
    memory.isWeak = confidenceScore < 60;
    memory.isStrong = confidenceScore >= 80;
    memory.reviewHistory.push({ date: new Date(), score: percentage, quizResultId: result._id });

    memory.markModified('reviewHistory');
    await memory.save();
    console.log('[quiz submit] step 2 done – memory saved');

    // Step 3: Update roadmap progress
    console.log('[quiz submit] step 3 – updating roadmap');
    const passed = percentage >= 60;
    let nextInfo = null;

    const topicIdx = learningPath.roadmap.findIndex(t => t.id === topicId);
    const subtopicIdx = topicIdx >= 0
      ? learningPath.roadmap[topicIdx].subtopics.findIndex(s => s.id === subtopicId)
      : -1;

    console.log('[quiz submit] roadmap lookup', { topicIdx, subtopicIdx });

    if (topicIdx === -1 || subtopicIdx === -1) {
      return res.status(404).json({ error: 'Topic or subtopic not found in roadmap' });
    }

    const currentSub = learningPath.roadmap[topicIdx].subtopics[subtopicIdx];
    const wasAlreadyCompleted = currentSub.status === 'completed';
    const shouldInsertRevision = (currentSub.type || 'core') === 'core'
      && (!passed || confidenceScore < 60);
    const revisionReason = !passed ? 'quiz-failed' : 'low-confidence';

    // Always update quiz score and attempts
    currentSub.quizScore = percentage;
    currentSub.quizAttempts = (currentSub.quizAttempts || 0) + 1;

    if (shouldInsertRevision) {
      const insertedRevision = ensureRevisionSubtopic(
        learningPath.roadmap[topicIdx],
        currentSub,
        revisionReason
      );

      if (insertedRevision) {
        console.log('[quiz submit] adaptive revision prepared', {
          sourceSubtopicId: currentSub.id,
          revisionSubtopicId: insertedRevision.id,
          reason: revisionReason
        });
      }
    }

    if (passed) {
      currentSub.status = 'completed';
      if (!currentSub.completedAt) currentSub.completedAt = new Date();

      // Only unlock next item if this is the first time passing
      if (!wasAlreadyCompleted) {
        const nextSubtopicIdx = subtopicIdx + 1;
        if (nextSubtopicIdx < learningPath.roadmap[topicIdx].subtopics.length) {
          // Unlock next subtopic, including adaptive revision steps.
          learningPath.roadmap[topicIdx].subtopics[nextSubtopicIdx].status = 'available';
          nextInfo = {
            type: 'subtopic',
            topicId,
            subtopicId: learningPath.roadmap[topicIdx].subtopics[nextSubtopicIdx].id,
            title: learningPath.roadmap[topicIdx].subtopics[nextSubtopicIdx].title,
            subtopicType: learningPath.roadmap[topicIdx].subtopics[nextSubtopicIdx].type || 'core'
          };
        } else {
          // All subtopics done — complete the topic
          const allDone = learningPath.roadmap[topicIdx].subtopics.every(s => s.status === 'completed');
          if (allDone && learningPath.roadmap[topicIdx].status !== 'completed') {
            learningPath.roadmap[topicIdx].status = 'completed';
            learningPath.roadmap[topicIdx].completedAt = new Date();
            learningPath.completedTopics = (learningPath.completedTopics || 0) + 1;

            // Unlock next topic
            const nextTopicIdx = topicIdx + 1;
            if (nextTopicIdx < learningPath.roadmap.length) {
              if (learningPath.roadmap[nextTopicIdx].status === 'locked') {
                learningPath.roadmap[nextTopicIdx].status = 'available';
                learningPath.roadmap[nextTopicIdx].subtopics[0].status = 'available';
              }
              nextInfo = {
                type: 'topic',
                topicId: learningPath.roadmap[nextTopicIdx].id,
                subtopicId: learningPath.roadmap[nextTopicIdx].subtopics[0].id,
                title: learningPath.roadmap[nextTopicIdx].title,
                subtopicType: learningPath.roadmap[nextTopicIdx].subtopics[0].type || 'core'
              };
            } else if (learningPath.status !== 'completed') {
              learningPath.status = 'completed';
            }
          }
        }
      } else {
        // Retake: return the next subtopic info so UI can navigate
        const nextSubtopicIdx = subtopicIdx + 1;
        if (nextSubtopicIdx < learningPath.roadmap[topicIdx].subtopics.length) {
          const nextSub = learningPath.roadmap[topicIdx].subtopics[nextSubtopicIdx];
          if (nextSub.status !== 'locked') {
            nextInfo = {
              type: 'subtopic',
              topicId,
              subtopicId: nextSub.id,
              title: nextSub.title,
              subtopicType: nextSub.type || 'core'
            };
          }
        }
      }
    } else {
      const revisionSubtopic = learningPath.roadmap[topicIdx].subtopics[subtopicIdx + 1];
      if (revisionSubtopic && revisionSubtopic.type === 'revision') {
        revisionSubtopic.status = 'available';
        nextInfo = {
          type: 'subtopic',
          topicId,
          subtopicId: revisionSubtopic.id,
          title: revisionSubtopic.title,
          subtopicType: revisionSubtopic.type
        };
      }
    }

    console.log('[quiz submit] step 3 – saving learningPath');
    learningPath.overallProgress = calculateProgress(learningPath.roadmap);
    learningPath.lastActiveAt = new Date();
    learningPath.markModified('roadmap');
    await learningPath.save();
    console.log('[quiz submit] step 3 done – path saved');

    console.log('[quiz submit] success', {
      quizId,
      pathId,
      topicId,
      subtopicId,
      score,
      total,
      percentage,
      passed,
      nextInfo
    });

    res.json({
      score,
      total,
      percentage,
      passed,
      feedback,
      rootCauseAnalysis,
      nextInfo,
      confidenceScore,
      nextReviewAt: nextReview.nextReviewAt,
      message: passed
        ? percentage >= 80 ? 'Excellent! You mastered this topic.' : 'Good work! Moving to the next subtopic.'
        : 'Keep practicing! You need 60% to proceed. Review the content and try again.'
    });
  } catch (err) {
    console.error('[submit quiz] Error:', {
      message: err?.message,
      stack: err?.stack,
      quizId: req.params?.quizId,
      userId: req.user?.id,
      body: req.body
    });
    res.status(500).json({ error: 'Failed to submit quiz', detail: err?.message });
  }
});

// ─── GET /api/learning/dashboard ─────────────────────────────────────────────
// User's overall learning stats
router.get('/dashboard', async (req, res) => {
  try {
    const [paths, weakMemories, dueForReview, recentResults] = await Promise.all([
      LearningPath.find({ userId: req.user.id })
        .select('topic userLevel status overallProgress totalTopics completedTopics createdAt lastActiveAt')
        .sort({ lastActiveAt: -1 }),
      UserMemory.find({ userId: req.user.id, isWeak: true })
        .select('topicTitle subtopicTitle mainTopic confidenceScore lastReviewedAt'),
      UserMemory.find({
        userId: req.user.id,
        nextReviewAt: { $lte: new Date(Date.now() + 24 * 60 * 60 * 1000) }
      }).select('topicTitle subtopicTitle mainTopic confidenceScore nextReviewAt learningPathId'),
      LearningQuizResult.find({ userId: req.user.id })
        .sort({ createdAt: -1 }).limit(10)
        .select('topicId subtopicId percentage createdAt')
    ]);

    const activePaths = paths.filter(p => p.status === 'active');
    const completedPaths = paths.filter(p => p.status === 'completed');
    const strongMemories = await UserMemory.find({ userId: req.user.id, isStrong: true })
      .select('topicTitle subtopicTitle mainTopic confidenceScore');

    const totalQuizzes = await LearningQuizResult.countDocuments({ userId: req.user.id });
    const avgScore = recentResults.length > 0
      ? Math.round(recentResults.reduce((a, r) => a + r.percentage, 0) / recentResults.length)
      : 0;

    res.json({
      activePaths,
      completedPaths,
      totalPaths: paths.length,
      totalQuizzes,
      avgScore,
      weakTopics: weakMemories.slice(0, 10),
      strongTopics: strongMemories.slice(0, 10),
      dueForReview: dueForReview.slice(0, 10),
      recentActivity: recentResults
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard' });
  }
});

// ─── GET /api/learning/memory ─────────────────────────────────────────────────
// Spaced repetition memory data for a learning path
router.get('/memory/:pathId', async (req, res) => {
  try {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [dueToday, upcoming, mastered] = await Promise.all([
      UserMemory.find({
        userId: req.user.id,
        learningPathId: req.params.pathId,
        nextReviewAt: { $lte: tomorrow }
      }).select('topicTitle subtopicTitle confidenceScore nextReviewAt intervalDays isWeak').sort({ nextReviewAt: 1 }),
      UserMemory.find({
        userId: req.user.id,
        learningPathId: req.params.pathId,
        nextReviewAt: { $gt: tomorrow, $lte: nextWeek }
      }).select('topicTitle subtopicTitle confidenceScore nextReviewAt intervalDays').sort({ nextReviewAt: 1 }),
      UserMemory.find({
        userId: req.user.id,
        learningPathId: req.params.pathId,
        confidenceScore: { $gte: 80 }
      }).select('topicTitle subtopicTitle confidenceScore intervalDays').sort({ confidenceScore: -1 })
    ]);

    res.json({ dueToday, upcoming, mastered });
  } catch (err) {
    console.error('Memory error:', err);
    res.status(500).json({ error: 'Failed to fetch memory data' });
  }
});

// ─── DELETE /api/learning/paths/:id ──────────────────────────────────────────
router.delete('/paths/:id', async (req, res) => {
  try {
    const path = await LearningPath.findOne({ _id: req.params.id, userId: req.user.id });
    if (!path) return res.status(404).json({ error: 'Learning path not found' });

    await Promise.all([
      LearningPath.deleteOne({ _id: path._id }),
      TopicContent.deleteMany({ learningPathId: path._id }),
      LearningQuiz.deleteMany({ learningPathId: path._id }),
      LearningQuizResult.deleteMany({ learningPathId: path._id }),
      UserMemory.deleteMany({ learningPathId: path._id })
    ]);

    res.json({ success: true });
  } catch (err) {
    console.error('Delete path error:', err);
    res.status(500).json({ error: 'Failed to delete learning path' });
  }
});

module.exports = router;
