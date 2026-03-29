const { GoogleGenerativeAI } = require('@google/generative-ai');

const apiKey = process.env.LEARNING_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
if (!apiKey) console.error('[learningService] No Gemini API key found!');

const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite-preview' });

// ─── SM-2 Spaced Repetition ───────────────────────────────────────────────────

function scoreToQuality(percentage) {
  if (percentage >= 90) return 5;
  if (percentage >= 80) return 4;
  if (percentage >= 70) return 3;
  if (percentage >= 60) return 2;
  if (percentage >= 40) return 1;
  return 0;
}

function calculateNextReview(memory, quizPercentage) {
  const q = scoreToQuality(quizPercentage);
  let ef = memory.easeFactor;
  ef = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  ef = Math.max(1.3, ef);

  let interval;
  let repetitionNumber = memory.repetitionNumber;

  if (q < 3) {
    interval = 1;
    repetitionNumber = 0;
  } else {
    if (repetitionNumber === 0) interval = 1;
    else if (repetitionNumber === 1) interval = 6;
    else interval = Math.round(memory.intervalDays * ef);
    repetitionNumber += 1;
  }

  return {
    easeFactor: ef,
    intervalDays: interval,
    repetitionNumber,
    nextReviewAt: new Date(Date.now() + interval * 24 * 60 * 60 * 1000)
  };
}

// ─── JSON Extraction Helper ───────────────────────────────────────────────────

function extractJSON(text) {
  const cleaned = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
  const firstBrace = cleaned.search(/[\[{]/);
  const lastBrace = Math.max(cleaned.lastIndexOf(']'), cleaned.lastIndexOf('}'));
  if (firstBrace === -1 || lastBrace === -1) throw new Error('No JSON found in response');
  return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
}

function normalizeQuizQuestions(questions) {
  if (!Array.isArray(questions)) return [];

  return questions
    .map((q, index) => {
      const rawOptions = Array.isArray(q?.options) ? q.options.filter(Boolean).map(String) : [];
      const options = rawOptions.slice(0, 4);

      while (options.length < 4) {
        options.push(`Option ${String.fromCharCode(65 + options.length)}`);
      }

      const rawCorrectIndex = Number.isInteger(q?.correctIndex) ? q.correctIndex : 0;
      const correctIndex = rawCorrectIndex >= 0 && rawCorrectIndex < 4 ? rawCorrectIndex : 0;

      return {
        question: String(q?.question || `Practice question ${index + 1}`),
        options,
        correctIndex,
        explanation: String(q?.explanation || 'Review the related concept and try this again.')
      };
    })
    .filter(q => q.question.trim() && q.options.length === 4);
}

function normalizeSeverity(value) {
  const v = String(value || '').toLowerCase();
  if (['high', 'medium', 'low'].includes(v)) return v;
  return 'medium';
}

function normalizeConfidence(value) {
  const v = String(value || '').toLowerCase();
  if (['high', 'medium', 'low'].includes(v)) return v;
  return 'medium';
}

function extractLooseObjectBlocks(text) {
  if (typeof text !== 'string') return [];
  return text.match(/\{[^{}]*\}/g) || [];
}

function readLooseStringField(block, key) {
  if (typeof block !== 'string') return '';
  const reQuoted = new RegExp(`${key}\\s*:\\s*['\"]([^'\\"]+)['\"]`, 'i');
  const quoted = block.match(reQuoted);
  if (quoted?.[1]) return quoted[1].trim();

  const reBare = new RegExp(`${key}\\s*:\\s*([^,}]+)`, 'i');
  const bare = block.match(reBare);
  return bare?.[1] ? bare[1].trim().replace(/^['\"]|['\"]$/g, '') : '';
}

function readLooseNumberField(block, key) {
  const value = readLooseStringField(block, key);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toObjectArray(value) {
  if (Array.isArray(value)) return value;

  if (value && typeof value === 'object') {
    return [value];
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === 'object') return [parsed];
    } catch {
      // fall through to loose parser
    }

    return extractLooseObjectBlocks(trimmed);
  }

  return [];
}

function normalizeGraphNodes(input, fallbackNodes = []) {
  const mapped = toObjectArray(input)
    .map(item => {
      if (typeof item === 'string') {
        const id = readLooseStringField(item, 'id');
        const label = readLooseStringField(item, 'label');
        const type = readLooseStringField(item, 'type');
        if (!id || !label) return null;
        return { id, label, type: type || 'prerequisite' };
      }

      if (!item || typeof item !== 'object') return null;
      const id = String(item.id || '').trim();
      const label = String(item.label || '').trim();
      const type = String(item.type || 'prerequisite').trim();
      if (!id || !label) return null;
      return { id, label, type };
    })
    .filter(Boolean);

  return mapped.length ? mapped : fallbackNodes;
}

function normalizeGraphEdges(input, fallbackEdges = []) {
  const mapped = toObjectArray(input)
    .map(item => {
      if (typeof item === 'string') {
        const from = readLooseStringField(item, 'from');
        const to = readLooseStringField(item, 'to');
        const reason = readLooseStringField(item, 'reason');
        const weight = readLooseNumberField(item, 'weight');
        if (!from || !to) return null;
        return {
          from,
          to,
          reason: reason || 'Related concept dependency',
          weight: Number.isFinite(weight) ? weight : 1
        };
      }

      if (!item || typeof item !== 'object') return null;
      const from = String(item.from || '').trim();
      const to = String(item.to || '').trim();
      if (!from || !to) return null;

      const weight = Number(item.weight);
      return {
        from,
        to,
        reason: String(item.reason || 'Related concept dependency'),
        weight: Number.isFinite(weight) ? weight : 1
      };
    })
    .filter(Boolean);

  return mapped.length ? mapped : fallbackEdges;
}

function normalizeMisconceptionBreakdown(input, fallback = []) {
  const mapped = toObjectArray(input)
    .map(item => {
      if (!item || typeof item !== 'object') return null;
      const label = String(item.label || item.misconception || '').trim();
      if (!label) return null;
      const count = Number(item.count);
      return {
        label,
        count: Number.isFinite(count) ? count : 1,
        severity: normalizeSeverity(item.severity)
      };
    })
    .filter(Boolean);

  return mapped.length ? mapped : fallback;
}

function normalizeWeakSubtopics(input, fallback = []) {
  const mapped = toObjectArray(input)
    .map(item => {
      if (!item || typeof item !== 'object') return null;
      const subtopicId = String(item.subtopicId || '').trim();
      const subtopicTitle = String(item.subtopicTitle || item.title || '').trim();
      if (!subtopicId || !subtopicTitle) return null;

      const score = Number(item.score);
      const attempts = Number(item.attempts);
      const confidence = Number(item.confidence);

      return {
        subtopicId,
        subtopicTitle,
        score: Number.isFinite(score) ? score : 50,
        attempts: Number.isFinite(attempts) ? attempts : 1,
        confidence: Number.isFinite(confidence) ? confidence : 50
      };
    })
    .filter(Boolean);

  return mapped.length ? mapped : fallback;
}

function createFallbackRootCauseAnalysis(payload = {}) {
  const {
    mainTopic = '',
    topicTitle = '',
    subtopicTitle = '',
    percentage = 0,
    wrongAnswers = [],
    prerequisiteCandidates = []
  } = payload;

  const misconceptionMap = new Map();
  const wrongAnswerAnalyses = wrongAnswers.map((item, idx) => {
    const reason = item?.correctExplanation
      ? 'Concept application mismatch'
      : 'Core concept confusion';

    misconceptionMap.set(reason, (misconceptionMap.get(reason) || 0) + 1);

    return {
      questionIndex: Number.isInteger(item?.questionIndex) ? item.questionIndex : idx,
      question: String(item?.question || `Question ${idx + 1}`),
      selectedOption: String(item?.selectedOption || 'Not answered'),
      correctOption: String(item?.correctOption || 'N/A'),
      misconception: reason,
      whyWrong: String(item?.correctExplanation || 'Your selected option did not match the expected concept.'),
      ragExplanation: String(item?.correctExplanation || 'Revisit the concept summary and compare solved examples.'),
      confidence: 'medium'
    };
  });

  const misconceptionBreakdown = Array.from(misconceptionMap.entries()).map(([label, count]) => ({
    label,
    count,
    severity: count >= 2 ? 'high' : 'medium'
  }));

  const prerequisiteGaps = prerequisiteCandidates.slice(0, 3).map((item, index) => ({
    topic: String(item?.subtopicTitle || item?.title || `Prerequisite ${index + 1}`),
    reason: 'Low prior performance suggests this prerequisite needs reinforcement.',
    severity: Number(item?.score || 0) < 50 ? 'high' : 'medium',
    confidence: Number.isFinite(Number(item?.score)) ? Math.max(30, Math.min(95, Number(item.score))) : 55
  }));

  const remediationPlan = [
    {
      step: 1,
      title: `Review prerequisite for ${subtopicTitle || 'this subtopic'}`,
      description: 'Revisit foundational definitions and one worked example before retrying.',
      recommendedProblems: 5,
      successMetric: 'Score at least 70% on checkpoint questions.'
    },
    {
      step: 2,
      title: `Practice ${subtopicTitle || 'target concept'}`,
      description: 'Solve mixed practice with focus on operation order and concept selection.',
      recommendedProblems: 10,
      successMetric: 'Achieve 8/10 correct with clear solution steps.'
    },
    {
      step: 3,
      title: 'Retry the quiz',
      description: 'Take the quiz again and compare mistakes against this analysis.',
      recommendedProblems: 5,
      successMetric: 'Reach at least 80% and reduce repeated mistake types.'
    }
  ];

  const weakSubtopics = prerequisiteCandidates.slice(0, 5).map((item, index) => ({
    subtopicId: String(item?.subtopicId || `weak-${index + 1}`),
    subtopicTitle: String(item?.subtopicTitle || item?.title || `Weak area ${index + 1}`),
    score: Number.isFinite(Number(item?.score)) ? Number(item.score) : 50,
    attempts: Number.isFinite(Number(item?.attempts)) ? Number(item.attempts) : 1,
    confidence: Number.isFinite(Number(item?.confidenceScore)) ? Number(item.confidenceScore) : 50
  }));

  const graphNodes = [
    { id: 'main-topic', label: mainTopic || topicTitle || 'Main Topic', type: 'topic' },
    { id: 'target-subtopic', label: subtopicTitle || 'Current Subtopic', type: 'target' },
    ...prerequisiteGaps.map((gap, index) => ({
      id: `prereq-${index + 1}`,
      label: gap.topic,
      type: 'prerequisite'
    })),
    ...misconceptionBreakdown.map((m, index) => ({
      id: `mis-${index + 1}`,
      label: m.label,
      type: 'misconception'
    }))
  ];

  const graphEdges = [
    { from: 'main-topic', to: 'target-subtopic', reason: 'Current learning target', weight: 1 },
    ...prerequisiteGaps.map((gap, index) => ({
      from: `prereq-${index + 1}`,
      to: 'target-subtopic',
      reason: gap.reason,
      weight: gap.severity === 'high' ? 3 : 2
    })),
    ...misconceptionBreakdown.map((m, index) => ({
      from: 'target-subtopic',
      to: `mis-${index + 1}`,
      reason: 'Observed from wrong answers',
      weight: m.severity === 'high' ? 3 : 2
    }))
  ];

  return {
    summary: percentage >= 60
      ? `You passed ${subtopicTitle || 'this subtopic'}, but there are still conceptual gaps to tighten.`
      : `You need reinforcement in ${subtopicTitle || 'this subtopic'} before moving forward confidently.`,
    likelyRootCause: misconceptionBreakdown[0]?.label || 'Foundational concept confusion',
    misconceptions: misconceptionBreakdown,
    prerequisiteGaps,
    wrongAnswerAnalyses,
    remediationPlan,
    visualData: {
      misconceptionBreakdown,
      weakSubtopics,
      prerequisiteGraph: {
        nodes: graphNodes,
        edges: graphEdges
      }
    },
    generatedBy: 'fallback-engine',
    generatedAt: new Date()
  };
}

function normalizeRootCauseAnalysis(raw = {}, payload = {}) {
  const fallback = createFallbackRootCauseAnalysis(payload);

  const misconceptions = Array.isArray(raw?.misconceptions)
    ? raw.misconceptions
      .map(item => ({
        label: String(item?.label || item?.misconception || '').trim(),
        count: Number.isFinite(Number(item?.count)) ? Number(item.count) : 1,
        severity: normalizeSeverity(item?.severity)
      }))
      .filter(item => item.label)
    : [];

  const prerequisiteGaps = Array.isArray(raw?.prerequisiteGaps)
    ? raw.prerequisiteGaps
      .map(item => ({
        topic: String(item?.topic || '').trim(),
        reason: String(item?.reason || 'Prerequisite gap detected.').trim(),
        severity: normalizeSeverity(item?.severity),
        confidence: Number.isFinite(Number(item?.confidence)) ? Number(item.confidence) : 60
      }))
      .filter(item => item.topic)
    : [];

  const wrongAnswerAnalyses = Array.isArray(raw?.wrongAnswerAnalyses)
    ? raw.wrongAnswerAnalyses
      .map((item, idx) => ({
        questionIndex: Number.isFinite(Number(item?.questionIndex)) ? Number(item.questionIndex) : idx,
        question: String(item?.question || '').trim(),
        selectedOption: String(item?.selectedOption || 'Not answered'),
        correctOption: String(item?.correctOption || 'N/A'),
        misconception: String(item?.misconception || 'Concept confusion').trim(),
        whyWrong: String(item?.whyWrong || 'The selected option does not match the expected reasoning.').trim(),
        ragExplanation: String(item?.ragExplanation || item?.whyWrong || '').trim(),
        confidence: normalizeConfidence(item?.confidence)
      }))
      .filter(item => item.question)
    : [];

  const remediationPlan = Array.isArray(raw?.remediationPlan)
    ? raw.remediationPlan
      .map((item, idx) => ({
        step: Number.isFinite(Number(item?.step)) ? Number(item.step) : idx + 1,
        title: String(item?.title || `Step ${idx + 1}`),
        description: String(item?.description || 'Follow this intervention step.'),
        recommendedProblems: Number.isFinite(Number(item?.recommendedProblems))
          ? Number(item.recommendedProblems)
          : 5,
        successMetric: String(item?.successMetric || 'Improve understanding before retry.')
      }))
      .filter(item => item.title)
    : [];

  const visualData = raw?.visualData && typeof raw.visualData === 'object'
    ? raw.visualData
    : {};

  return {
    summary: String(raw?.summary || fallback.summary),
    likelyRootCause: String(raw?.likelyRootCause || fallback.likelyRootCause),
    misconceptions: misconceptions.length ? misconceptions : fallback.misconceptions,
    prerequisiteGaps: prerequisiteGaps.length ? prerequisiteGaps : fallback.prerequisiteGaps,
    wrongAnswerAnalyses: wrongAnswerAnalyses.length ? wrongAnswerAnalyses : fallback.wrongAnswerAnalyses,
    remediationPlan: remediationPlan.length ? remediationPlan : fallback.remediationPlan,
    visualData: {
      misconceptionBreakdown: normalizeMisconceptionBreakdown(
        visualData?.misconceptionBreakdown,
        fallback.visualData.misconceptionBreakdown
      ),
      weakSubtopics: normalizeWeakSubtopics(
        visualData?.weakSubtopics,
        fallback.visualData.weakSubtopics
      ),
      prerequisiteGraph: {
        nodes: normalizeGraphNodes(
          visualData?.prerequisiteGraph?.nodes,
          fallback.visualData.prerequisiteGraph.nodes
        ),
        edges: normalizeGraphEdges(
          visualData?.prerequisiteGraph?.edges,
          fallback.visualData.prerequisiteGraph.edges
        )
      }
    },
    generatedBy: 'gemini-root-cause-engine',
    generatedAt: new Date()
  };
}

async function analyzeQuizRootCauses(payload) {
  const {
    mainTopic,
    topicTitle,
    subtopicTitle,
    userLevel,
    score,
    total,
    percentage,
    wrongAnswers = [],
    prerequisiteCandidates = [],
    weakMemories = [],
    ragContext = []
  } = payload || {};

  if (!Array.isArray(wrongAnswers) || wrongAnswers.length === 0) {
    return {
      summary: 'Great work. No incorrect answers were found, so no root-cause gaps detected.',
      likelyRootCause: 'None',
      misconceptions: [],
      prerequisiteGaps: [],
      wrongAnswerAnalyses: [],
      remediationPlan: [{
        step: 1,
        title: 'Move to the next subtopic',
        description: 'Maintain momentum and continue to the next available learning node.',
        recommendedProblems: 3,
        successMetric: 'Keep scores above 80% for consistency.'
      }],
      visualData: {
        misconceptionBreakdown: [],
        weakSubtopics: [],
        prerequisiteGraph: {
          nodes: [{ id: 'target-subtopic', label: subtopicTitle || 'Current Subtopic', type: 'target' }],
          edges: []
        }
      },
      generatedBy: 'root-cause-engine',
      generatedAt: new Date()
    };
  }

  const prompt = `You are a precise educational diagnostician.

Analyze quiz mistakes and produce a root-cause analysis for this learner.

Learner context:
- Main topic: ${mainTopic}
- Topic: ${topicTitle}
- Subtopic: ${subtopicTitle}
- Learner level: ${userLevel}
- Score: ${score}/${total} (${percentage}%)

Wrong answers JSON:
${JSON.stringify(wrongAnswers, null, 2)}

Prerequisite candidates JSON:
${JSON.stringify(prerequisiteCandidates, null, 2)}

Weak memory signals JSON:
${JSON.stringify(weakMemories, null, 2)}

RAG context snippets JSON:
${JSON.stringify(ragContext, null, 2)}

Rules:
- Diagnose misconceptions, not just weak topics.
- Trace probable prerequisite gaps.
- Give actionable intervention steps.
- For each wrong answer, add a short "ragExplanation" grounded in the provided context snippets.
- Keep language student-friendly and specific.
- Return ONLY valid JSON, no markdown.

Return object shape:
{
  "summary": "...",
  "likelyRootCause": "...",
  "misconceptions": [
    { "label": "...", "count": 2, "severity": "high" }
  ],
  "prerequisiteGaps": [
    { "topic": "...", "reason": "...", "severity": "high", "confidence": 78 }
  ],
  "wrongAnswerAnalyses": [
    {
      "questionIndex": 0,
      "question": "...",
      "selectedOption": "...",
      "correctOption": "...",
      "misconception": "...",
      "whyWrong": "...",
      "ragExplanation": "...",
      "confidence": "medium"
    }
  ],
  "remediationPlan": [
    {
      "step": 1,
      "title": "...",
      "description": "...",
      "recommendedProblems": 5,
      "successMetric": "..."
    }
  ],
  "visualData": {
    "misconceptionBreakdown": [
      { "label": "...", "count": 2, "severity": "high" }
    ],
    "weakSubtopics": [
      { "subtopicId": "...", "subtopicTitle": "...", "score": 40, "attempts": 2, "confidence": 45 }
    ],
    "prerequisiteGraph": {
      "nodes": [
        { "id": "...", "label": "...", "type": "topic|target|prerequisite|misconception" }
      ],
      "edges": [
        { "from": "...", "to": "...", "reason": "...", "weight": 1 }
      ]
    }
  }
}`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const parsed = extractJSON(text);
    return normalizeRootCauseAnalysis(parsed, payload);
  } catch (err) {
    console.warn('[root-cause-engine] fallback due to generation issue:', err?.message || err);
    return createFallbackRootCauseAnalysis(payload);
  }
}

// ─── Assessment Generation ────────────────────────────────────────────────────

async function generateAssessmentQuestions(topic) {
  const prompt = `You are an educational assessment expert. Generate exactly 10 multiple-choice questions to assess a user's existing knowledge of "${topic}".

Distribution:
- 3 easy questions (fundamental concepts, definitions)
- 4 medium questions (applied knowledge, relationships)
- 3 hard questions (advanced concepts, deep understanding)

Return ONLY a valid JSON array with exactly 10 objects, no other text:
[
  {
    "id": "q1",
    "question": "Question text here?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctIndex": 0,
    "difficulty": "easy",
    "subtopic": "Related subtopic name",
    "explanation": "Brief explanation of why this answer is correct"
  }
]`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const questions = extractJSON(text);

  if (!Array.isArray(questions) || questions.length < 8) {
    throw new Error('Invalid assessment questions generated');
  }

  return questions.slice(0, 10).map((q, i) => ({
    id: q.id || `q${i + 1}`,
    question: q.question,
    options: q.options,
    correctIndex: q.correctIndex,
    difficulty: q.difficulty || (i < 3 ? 'easy' : i < 7 ? 'medium' : 'hard'),
    subtopic: q.subtopic || topic,
    explanation: q.explanation || ''
  }));
}

// ─── Level Classification ─────────────────────────────────────────────────────

async function classifyUserLevel(topic, score, easyCorrect, mediumCorrect, hardCorrect) {
  const prompt = `A user took a 10-question knowledge assessment on "${topic}".

Results:
- Total score: ${score}% (easy: ${easyCorrect}/3, medium: ${mediumCorrect}/4, hard: ${hardCorrect}/3)

Classify the user and return ONLY valid JSON, no other text:
{
  "level": "beginner",
  "explanation": "2-3 sentence explanation of the classification",
  "strengths": ["list of topics the user seems to know well"],
  "weaknesses": ["list of topics the user needs to work on"],
  "recommendation": "Brief personalized learning recommendation"
}

Classification rules:
- "beginner": score < 40% OR easyCorrect < 2
- "intermediate": score 40-74% OR strong on easy/medium but weak on hard
- "advanced": score >= 75% with hardCorrect >= 2`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  return extractJSON(text);
}

// ─── Roadmap Generation ───────────────────────────────────────────────────────

async function generateRoadmap(topic, level, weaknesses = []) {
  const weaknessNote = weaknesses.length > 0
    ? `\nThe user's weak areas: ${weaknesses.join(', ')}. Include dedicated topics for these.`
    : '';

  const prompt = `Create a personalized learning roadmap for a ${level} learner who wants to study "${topic}".${weaknessNote}

Requirements:
- 8 to 12 main topics, ordered from foundational to advanced
- Each topic has 3 to 5 subtopics
- Topics should be sequential, each building on the previous
- Appropriate for a ${level} level learner

Return ONLY a valid JSON object, no other text:
{
  "topics": [
    {
      "id": "topic-1",
      "title": "Topic Title",
      "description": "1-2 sentence description of what this topic covers",
      "order": 1,
      "difficulty": "beginner",
      "estimatedTime": "2-3 hours",
      "subtopics": [
        {
          "id": "topic-1-sub-1",
          "title": "Subtopic Title",
          "description": "1 sentence description"
        }
      ]
    }
  ]
}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const parsed = extractJSON(text);

  if (!parsed.topics || !Array.isArray(parsed.topics)) {
    throw new Error('Invalid roadmap generated');
  }

  return parsed.topics;
}

// ─── Topic Content Generation ─────────────────────────────────────────────────

async function generateTopicContent(
  mainTopic,
  topicTitle,
  subtopicTitle,
  level,
  options = {}
) {
  const { contentType = 'standard', sourceSubtopicTitle = '', revisionReason = '' } = options;

  const standardPrompt = `Generate comprehensive learning content for:

Main Subject: ${mainTopic}
Topic: ${topicTitle}
Subtopic: ${subtopicTitle}
Learner Level: ${level}

Write educational content for a ${level} learner. Structure it as:

## ${subtopicTitle}

[Clear explanation of core concepts - 3-4 paragraphs]

### Key Concepts
[Key concepts as a bulleted list]

### Practical Example
[1-2 concrete, real-world examples with explanation]

### Common Misconceptions
[Address 1-2 common misconceptions if applicable]

### Summary
[1-paragraph summary]

After the main content, on separate lines add:
KEYPOINTS:
- key point 1
- key point 2
- key point 3
- key point 4
- key point 5

YOUTUBE_QUERY: [best YouTube search query to find a video about this subtopic]`;

  const revisionPrompt = `Generate concise revision content for:

Main Subject: ${mainTopic}
Topic: ${topicTitle}
Revision Subtopic: ${subtopicTitle}
Original weak area: ${sourceSubtopicTitle || subtopicTitle}
Learner Level: ${level}
Reason for revision: ${revisionReason || 'Needs reinforcement'}

This is NOT a full lesson. This is a quick revision sheet.

Output structure:
## ${subtopicTitle}

### 60-Second Recap
- 5 to 7 short bullets of only the most important facts/concepts.

### Must Remember
- 3 common mistakes or confusion points with one-line corrections.

### Rapid Check
- 3 very short self-check questions (without answers) to test recall.

### Quick Summary
- 3 to 4 lines only.

After the main content, on separate lines add:
KEYPOINTS:
- key point 1
- key point 2
- key point 3
- key point 4
- key point 5

YOUTUBE_QUERY: [best concise revision search query for this exact weak area]`;

  const prompt = contentType === 'revision' ? revisionPrompt : standardPrompt;

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  // Extract key points
  const keyPointsMatch = text.match(/KEYPOINTS:\s*([\s\S]*?)(?=YOUTUBE_QUERY:|$)/i);
  const youtubeMatch = text.match(/YOUTUBE_QUERY:\s*(.+)/i);

  const keyPoints = keyPointsMatch
    ? keyPointsMatch[1].split('\n').map(l => l.replace(/^[-*•]\s*/, '').trim()).filter(Boolean)
    : [];

  const youtubeSearchQuery = youtubeMatch
    ? youtubeMatch[1].trim()
    : `${subtopicTitle} ${mainTopic} tutorial`;

  // Clean content - remove the KEYPOINTS and YOUTUBE_QUERY sections
  const content = text
    .replace(/KEYPOINTS:\s*[\s\S]*?(?=YOUTUBE_QUERY:|$)/i, '')
    .replace(/YOUTUBE_QUERY:\s*.+/i, '')
    .trim();

  return { content, keyPoints, youtubeSearchQuery };
}

// ─── Topic Quiz Generation ────────────────────────────────────────────────────

async function generateTopicQuiz(mainTopic, topicTitle, subtopicTitle, level) {
  const prompt = `Generate a 5-question quiz for:

Main Subject: ${mainTopic}
Topic: ${topicTitle}
Subtopic: ${subtopicTitle}
Learner Level: ${level}

Requirements:
- Test practical understanding, not memorization
- Questions progressively increase in difficulty
- Each question has exactly 4 options
- One clearly correct answer per question

Return ONLY a valid JSON array with exactly 5 objects, no other text:
[
  {
    "question": "Question text?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctIndex": 0,
    "explanation": "Why this answer is correct and others are wrong"
  }
]`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const questions = normalizeQuizQuestions(extractJSON(text));

  if (!Array.isArray(questions) || questions.length < 4) {
    throw new Error('Invalid quiz generated');
  }

  return questions.slice(0, 5).map(q => ({
    question: q.question,
    options: q.options,
    correctIndex: q.correctIndex,
    explanation: q.explanation || ''
  }));
}

// ─── Adaptive Content Adjustment ─────────────────────────────────────────────

function getAdaptedLevel(userLevel, recentScores) {
  if (recentScores.length === 0) return userLevel;
  const avg = recentScores.reduce((a, b) => a + b, 0) / recentScores.length;
  const levels = ['beginner', 'intermediate', 'advanced'];
  const idx = levels.indexOf(userLevel);
  if (avg < 50 && idx > 0) return levels[idx - 1];
  if (avg > 85 && idx < 2) return levels[idx + 1];
  return userLevel;
}

function createRevisionSubtopic({ topicId, sourceSubtopic, revisionNumber, reason }) {
  const revisionSuffix = `rev-${revisionNumber}`;

  return {
    id: `${sourceSubtopic.id}-${revisionSuffix}`,
    title: `Revision: ${sourceSubtopic.title}`,
    description: reason === 'quiz-failed'
      ? `A focused reinforcement step for ${sourceSubtopic.title} after a failed quiz attempt.`
      : `A confidence-building review step for ${sourceSubtopic.title}.`,
    type: 'revision',
    adaptive: true,
    sourceSubtopicId: sourceSubtopic.sourceSubtopicId || sourceSubtopic.id,
    unlockReason: reason,
    status: 'available',
    quizAttempts: 0,
    contentGenerated: false
  };
}

function ensureRevisionSubtopic(topic, currentSubtopic, reason) {
  if (!topic || !currentSubtopic) return null;
  if (currentSubtopic.type && currentSubtopic.type !== 'core') return null;

  const sourceSubtopicId = currentSubtopic.sourceSubtopicId || currentSubtopic.id;
  const existingRevisionIdx = topic.subtopics.findIndex(sub =>
    sub.type === 'revision'
    && (sub.sourceSubtopicId || sub.id) === sourceSubtopicId
    && sub.status !== 'completed'
  );

  if (existingRevisionIdx !== -1) {
    const existingRevision = topic.subtopics[existingRevisionIdx];
    if (existingRevision.status === 'locked') existingRevision.status = 'available';
    return existingRevision;
  }

  const currentIdx = topic.subtopics.findIndex(sub => sub.id === currentSubtopic.id);
  if (currentIdx === -1) return null;

  const revisionCount = topic.subtopics.filter(sub =>
    sub.type === 'revision' && (sub.sourceSubtopicId || sub.id) === sourceSubtopicId
  ).length;

  const revisionSubtopic = createRevisionSubtopic({
    topicId: topic.id,
    sourceSubtopic: currentSubtopic,
    revisionNumber: revisionCount + 1,
    reason
  });

  topic.subtopics.splice(currentIdx + 1, 0, revisionSubtopic);
  return revisionSubtopic;
}

// ─── Progress Calculation ─────────────────────────────────────────────────────

function calculateProgress(roadmap) {
  const totalSubtopics = roadmap.reduce(
    (sum, t) => sum + t.subtopics.filter(s => (s.type || 'core') === 'core').length,
    0
  );
  const completedSubtopics = roadmap.reduce(
    (sum, t) => sum + t.subtopics.filter(
      s => (s.type || 'core') === 'core' && s.status === 'completed'
    ).length,
    0
  );
  return totalSubtopics > 0 ? Math.round((completedSubtopics / totalSubtopics) * 100) : 0;
}

module.exports = {
  generateAssessmentQuestions,
  classifyUserLevel,
  generateRoadmap,
  generateTopicContent,
  generateTopicQuiz,
  analyzeQuizRootCauses,
  calculateNextReview,
  getAdaptedLevel,
  createRevisionSubtopic,
  ensureRevisionSubtopic,
  calculateProgress
};
