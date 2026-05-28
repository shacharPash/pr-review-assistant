# Product Requirements Document (PRD): Local-First PR Review Assistant
## 1. Overview
A lightweight, zero-configuration local web application designed to optimize the Code Review process for a Java backend team. The application runs entirely on localhost, prioritizing security by utilizing existing local GitHub authentication. It leverages Claude to reduce cognitive load by providing context and structured reading paths, while utilizing a professional code editor interface for the actual human review.
## 2. Architecture & Tech Stack
 * **Execution:** 100% Localhost. No code is stored or sent to external servers (other than the AI API).
 * **Backend:** Node.js (e.g., Express or Vite API) - Acts as a bridge to execute local CLI commands.
 * **Frontend:** React / Vite.
 * **Editor Component:** Monaco Editor (to provide an IntelliJ-like side-by-side diff experience).
 * **Integrations:**
   * GitHub CLI (gh tool) to fetch PR diffs and metadata using the user's existing local session.
   * Claude API (or local claude-code CLI execution) for AI processing.
## 3. Core Features
### 3.1. One-Click PR Ingestion
 * A simple UI where the user inputs a GitHub PR ID or URL.
 * The backend securely fetches the PR diff, commit messages, and Jira ticket mentions via local GitHub CLI/API.
### 3.2. AI Context & TL;DR
 * Generates a concise, high-level summary (max 3-4 bullet points) explaining the business logic and *why* the changes were made.
 * **Constraint:** The AI must not attempt to "approve" or "review" the code. Its sole purpose is to onboard the human reviewer.
### 3.3. Guided Reading Order
 * The AI analyzes the diff and determines the most logical sequence to read the files (e.g., Interface \rightarrow Implementation \rightarrow Tests).
 * The UI presents a clickable sidebar navigating the files according to this recommended flow, overriding default alphabetical sorting.
### 3.4. IntelliJ-Style Diff Viewer
 * Utilizes Monaco Editor to render high-quality, side-by-side or inline diffs with Java syntax highlighting.
 * **Smart Filtering:** Automatically collapses or tags "noise" (e.g., auto-generated files, simple import additions, or pure whitespace changes) so the reviewer can focus on the core logic.
### 3.5. Visual Flow Diagram
 * The AI generates a Mermaid.js syntax block representing any architectural changes, data flow, or call stacks introduced in the PR.
 * The UI natively renders the Mermaid diagram above the file diffs.
## 4. Initialization & Setup Requirements
 * **Zero Config:** The app should require no database setup or complex environment variables beyond an Anthropic/Claude API key (if not using the local CLI proxy).
 * Startup should be a single command (e.g., npm run dev), immediately spinning up the localhost server and opening the browser.