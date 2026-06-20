CREATE EXTENSION IF NOT EXISTS vector;

CREATE TYPE "AgentStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
CREATE TYPE "AgentRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');
CREATE TYPE "ArtifactStatus" AS ENUM ('DRAFT', 'PUBLISHING', 'PUBLISHED', 'ARCHIVED');

CREATE TABLE "Agent" ("id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "instructions" TEXT NOT NULL, "model" TEXT NOT NULL, "status" "AgentStatus" NOT NULL DEFAULT 'DRAFT', "enabledTools" TEXT[] NOT NULL, "maxSteps" INTEGER NOT NULL DEFAULT 5, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL);
CREATE TABLE "AgentRun" ("id" TEXT PRIMARY KEY, "agentId" TEXT NOT NULL REFERENCES "Agent"("id") ON DELETE CASCADE, "status" "AgentRunStatus" NOT NULL DEFAULT 'RUNNING', "input" TEXT NOT NULL, "output" TEXT, "error" TEXT, "usage" JSONB, "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" TIMESTAMP(3));
CREATE TABLE "AgentRunStep" ("id" TEXT PRIMARY KEY, "runId" TEXT NOT NULL REFERENCES "AgentRun"("id") ON DELETE CASCADE, "position" INTEGER NOT NULL, "kind" TEXT NOT NULL, "toolName" TEXT, "input" JSONB, "output" JSONB, "error" TEXT, "durationMs" INTEGER, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE("runId", "position"));
CREATE TABLE "RunCitation" ("id" TEXT PRIMARY KEY, "runId" TEXT NOT NULL REFERENCES "AgentRun"("id") ON DELETE CASCADE, "title" TEXT NOT NULL, "url" TEXT NOT NULL, "snippet" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "RunFeedback" ("id" TEXT PRIMARY KEY, "runId" TEXT NOT NULL REFERENCES "AgentRun"("id") ON DELETE CASCADE, "rating" INTEGER NOT NULL, "correctedAnswer" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "RunFeedback_rating" CHECK ("rating" BETWEEN -1 AND 1));
CREATE TABLE "KnowledgeArtifact" ("id" TEXT PRIMARY KEY, "title" TEXT NOT NULL, "domain" TEXT NOT NULL, "description" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL);
CREATE TABLE "ArtifactVersion" ("id" TEXT PRIMARY KEY, "artifactId" TEXT NOT NULL REFERENCES "KnowledgeArtifact"("id") ON DELETE CASCADE, "version" INTEGER NOT NULL, "status" "ArtifactStatus" NOT NULL DEFAULT 'DRAFT', "content" TEXT NOT NULL, "contentHash" TEXT NOT NULL, "metadata" JSONB, "suiObjectId" TEXT, "transactionDigest" TEXT, "publishedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE("artifactId", "version"));
CREATE TABLE "ArtifactChunk" ("id" TEXT PRIMARY KEY, "artifactVersionId" TEXT NOT NULL REFERENCES "ArtifactVersion"("id") ON DELETE CASCADE, "position" INTEGER NOT NULL, "content" TEXT NOT NULL, "searchText" TEXT NOT NULL, "embedding" vector(1536), UNIQUE("artifactVersionId", "position"));
CREATE TABLE "AgentArtifact" ("agentId" TEXT NOT NULL REFERENCES "Agent"("id") ON DELETE CASCADE, "artifactId" TEXT NOT NULL REFERENCES "KnowledgeArtifact"("id") ON DELETE CASCADE, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY("agentId", "artifactId"));

CREATE INDEX "AgentRun_agentId_startedAt_idx" ON "AgentRun"("agentId", "startedAt");
CREATE INDEX "RunCitation_runId_idx" ON "RunCitation"("runId");
CREATE INDEX "ArtifactVersion_artifactId_status_idx" ON "ArtifactVersion"("artifactId", "status");
CREATE INDEX "ArtifactChunk_search_idx" ON "ArtifactChunk" USING GIN (to_tsvector('english', "searchText"));
CREATE INDEX "ArtifactChunk_embedding_idx" ON "ArtifactChunk" USING hnsw ("embedding" vector_cosine_ops);
