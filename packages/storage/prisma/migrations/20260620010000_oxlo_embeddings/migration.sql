DROP INDEX IF EXISTS "ArtifactChunk_embedding_idx";
ALTER TABLE "ArtifactChunk"
  ALTER COLUMN "embedding" TYPE vector(1024)
  USING "embedding"::vector(1024);
CREATE INDEX "ArtifactChunk_embedding_idx"
  ON "ArtifactChunk" USING hnsw ("embedding" vector_cosine_ops);
