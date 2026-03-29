# NeuroTrack Learning Platform

A comprehensive, full-stack AI learning companion designed to enhance the educational experience. NeuroTrack integrates personalized learning paths, a Retrieval-Augmented Generation (RAG) powered chat workspace, and intelligent tools for auto-generating quizzes, flashcards, flowcharts, and YouTube transcript summaries.

---

## 🌟 Key Features

### 📊 Interactive Dashboard
A centralized hub for monitoring educational metrics and maintaining engagement.
- **Progress Tracking:** Provides real-time insights into user learning streaks, overall progress, completed quizzes, and average scores.
- **Activity Trends:** Visualizes user patterns and recent interactions to help learners stay consistent.
<div align="center">
  <img src="codecrafters-3.0/frontend/apps/web/public/dash.png" width="800" alt="Dashboard overview" style="margin-bottom: 20px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);"/>
  <br/>
  <img src="codecrafters-3.0/frontend/apps/web/public/dash2.png" width="800" alt="Progress and activity trends" style="border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);"/>
</div>

---

### 🗺️ Personalized Learning Paths
A structured, intuitive approach to navigating complex topics.
- **Topic Selection:** Users can choose focus areas and track per-topic statistics.
- **Intelligent Roadmaps:** Generates highly detailed, prerequisite-aware milestones ordered by priority.
- **Content Hub:** Curates targeted resources and embedded video material corresponding to each roadmap node.
<div align="center">
  <img src="codecrafters-3.0/frontend/apps/web/public/lern.png" width="800" alt="Learning topics" style="margin-bottom: 20px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);"/>
  <br/>
  <img src="codecrafters-3.0/frontend/apps/web/public/lern2.png" width="800" alt="Roadmap detail part 1" style="margin-bottom: 20px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);"/>
  <br/>
  <img src="codecrafters-3.0/frontend/apps/web/public/lern3.png" width="800" alt="Roadmap detail part 2" style="margin-bottom: 20px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);"/>
  <br/>
  <img src="codecrafters-3.0/frontend/apps/web/public/lern4.png" width="800" alt="Topic content and videos" style="border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);"/>
</div>

---

### 🧠 RAG-Powered Workspace
A highly interactive document analysis and synthesis engine.
- **Contextual Chat:** Upload resources to interact with an AI tutor that strictly grounds its responses using Approximate Nearest Neighbor (ANN) vector search and Gemini embeddings.
- **Auto-Generated Resources:** Dynamically creates quizzes, concept flowcharts, flashcards, and condensed last-minute revision bullet points from the uploaded documents.
<div align="center">
  <img src="codecrafters-3.0/frontend/apps/web/public/chat.png" width="800" alt="RAG chat" style="margin-bottom: 20px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);"/>
  <br/>
  <img src="codecrafters-3.0/frontend/apps/web/public/quiz%20based%20on%20chat.png" width="800" alt="Quiz from chat" style="margin-bottom: 20px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);"/>
  <br/>
  <img src="codecrafters-3.0/frontend/apps/web/public/flow%20based%20on%20chat.png" width="800" alt="Flowchart from chat" style="margin-bottom: 20px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);"/>
  <br/>
  <img src="codecrafters-3.0/frontend/apps/web/public/flash%20based%20on%20chat.png" width="800" alt="Flashcards from chat" style="margin-bottom: 20px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);"/>
  <br/>
  <img src="codecrafters-3.0/frontend/apps/web/public/last%20minute%20revision%20based%20on%20chat.png" width="800" alt="Last-minute revision" style="border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);"/>
</div>

---

### 📺 YouTube Transcript Q&A
Seamlessly integrate external media into the study session.
- **Video Processing:** Import YouTube links to fetch transcripts automatically.
- **Smart Quizzing & Context:** Ground AI assistance based on video content and discover intelligently suggested similar media.
<div align="center">
  <img src="codecrafters-3.0/frontend/apps/web/public/transcript.jpeg" width="800" alt="Transcript Q&A" style="border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);"/>
</div>

---

## 🏗️ Architecture Stack

- **Frontend Core:** Next.js 16 (Turbopack), React 19, NextAuth for secure authentication, and a Turborepo monorepo setup for modular UI components and theme switching.
- **Backend Services:** Built with Node.js & Express, utilizing JWT auth, Mongoose (MongoDB), Multer for file streaming, Nodemailer for secure email OTPs, and Cloudinary for media storage.
- **AI & Retrieval:** Powered by Google Gemini for 3072-dimensional embeddings and text generation. Employs Qdrant (with Pinecone fallback) for robust cosine-similarity vector storage and user/conversation-scoped ANN retrieval.
- **Utilities:** Integrated YouTube transcript parsers, PDF ingestion tools, jsPDF for frontend exporting, and live Mermaid.js rendering for logic flowcharts.

## 🔄 RAG Data Flow

1. **Ingestion:** Document upload → Text chunking → Embedding generation (`gemini-embedding-001`, 3072 dimensions).
2. **Storage:** Upsert embeddings to Qdrant/Pinecone with structured payload metadata (bound by `userId` and `conversationId`).
3. **Retrieval:** User prompts trigger top-K semantic matches → Assembled context → Inference (`gemini-3.1-flash-lite-preview`).
4. **Synthesis:** Context engine additionally feeds parallel streams mapping 15-question MCQs, customized flashcards, process flowcharts, and study summaries.

## 📂 Project Structure

- `backend/` — Express API router, MongoDB models, Auth middleware, and external service connectors (Gemini, Qdrant/Pinecone, Cloudinary).
- `frontend/apps/web/` — Next.js application core containing routing pages, customized React hooks, context providers, and public assets.
- `frontend/packages/ui/` — Monorepo library for shared UI components and CSS styling.
- `frontend/packages/eslint-config` & `typescript-config` — Standardized tooling environments.

---

## 🚀 Getting Started

### Prerequisites
- Runtime: Node.js (v20 or higher), npm
- Data Stores: MongoDB instance, Qdrant (or Pinecone) vector endpoint
- External APIs: Cloudinary account, Google Gemini API Key

### Backend Setup
1. Navigate to the backend service:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Environment Configuration: Create a `.env` file (see `.env.example`) and populate:
   `PORT`, `MONGO_URI`, `JWT_SECRET`, `GEMINI_API_KEY`, `QDRANT_URL`, `QDRANT_API_KEY`, `QDRANT_COLLECTION`, `CLOUDINARY_*`, `EMAIL_*`.
4. Start the server:
   ```bash
   npm run dev    # For development (Nodemon)
   npm start      # For production
   ```

### Frontend Setup
1. Navigate to the frontend UI workspace:
   ```bash
   cd frontend
   ```
2. Install dependencies via Turbo:
   ```bash
   npm install
   ```
3. Start the Next.js dev server:
   ```bash
   npm run dev
   ```
4. Access the platform at http://localhost:3000 to sign up and begin your session.

---

## 🛡️ Best Practices & Conventions
- **Vector Scoping:** All embeddings are rigorously scoped. Qdrant leverages payload indexing on `userId` and `conversationId` for optimized, segregated search results.
- **Image Referencing:** Documentation images reliably exist within `frontend/apps/web/public` and use dynamic rendering paths.
- **Quota Separation:** Highly recommended using `GEMINI_API_KEY_TRANSCRIPT` for YouTube workflows to distribute rate limits from core conversational queries.
