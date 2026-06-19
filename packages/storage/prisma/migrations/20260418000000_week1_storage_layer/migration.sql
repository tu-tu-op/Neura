-- CreateEnum
CREATE TYPE "DatasetEntrySourceType" AS ENUM ('TASK', 'CORRECTION');

-- CreateTable
CREATE TABLE "PlatformConfig" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskRecord" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "creatorAddress" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "metadataUri" TEXT,
    "metadataHash" TEXT,
    "chainId" INTEGER,
    "contractAddress" TEXT,
    "transactionHash" TEXT,
    "blockNumber" BIGINT,
    "logIndex" INTEGER,
    "insertedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorrectionRecord" (
    "id" TEXT NOT NULL,
    "correctionId" TEXT NOT NULL,
    "taskRecordId" TEXT NOT NULL,
    "submitterAddress" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "metadataUri" TEXT,
    "metadataHash" TEXT,
    "chainId" INTEGER,
    "contractAddress" TEXT,
    "transactionHash" TEXT,
    "blockNumber" BIGINT,
    "logIndex" INTEGER,
    "insertedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CorrectionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dataset" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "metadataUri" TEXT,
    "metadataHash" TEXT,
    "latestVersionNumber" INTEGER NOT NULL DEFAULT 0,
    "insertedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dataset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DatasetVersion" (
    "id" TEXT NOT NULL,
    "datasetRefId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "registeredBy" TEXT NOT NULL,
    "registeredAt" TIMESTAMP(3) NOT NULL,
    "metadataUri" TEXT,
    "metadataHash" TEXT,
    "immutableRef" TEXT NOT NULL,
    "chainId" INTEGER,
    "contractAddress" TEXT,
    "transactionHash" TEXT,
    "blockNumber" BIGINT,
    "logIndex" INTEGER,
    "insertedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DatasetVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DatasetEntry" (
    "id" TEXT NOT NULL,
    "datasetVersionId" TEXT NOT NULL,
    "sourceType" "DatasetEntrySourceType" NOT NULL,
    "position" INTEGER NOT NULL,
    "taskRecordId" TEXT,
    "correctionRecordId" TEXT,
    "metadataUri" TEXT,
    "metadataHash" TEXT,
    "insertedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DatasetEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformConfig_key_key" ON "PlatformConfig"("key");

-- CreateIndex
CREATE UNIQUE INDEX "TaskRecord_taskId_key" ON "TaskRecord"("taskId");

-- CreateIndex
CREATE INDEX "TaskRecord_creatorAddress_createdAt_idx" ON "TaskRecord"("creatorAddress", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CorrectionRecord_correctionId_key" ON "CorrectionRecord"("correctionId");

-- CreateIndex
CREATE INDEX "CorrectionRecord_taskRecordId_submittedAt_correctionId_idx" ON "CorrectionRecord"("taskRecordId", "submittedAt", "correctionId");

-- CreateIndex
CREATE UNIQUE INDEX "Dataset_datasetId_key" ON "Dataset"("datasetId");

-- CreateIndex
CREATE INDEX "Dataset_createdBy_createdAt_idx" ON "Dataset"("createdBy", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DatasetVersion_datasetRefId_versionNumber_key" ON "DatasetVersion"("datasetRefId", "versionNumber");

-- CreateIndex
CREATE INDEX "DatasetVersion_datasetRefId_versionNumber_idx" ON "DatasetVersion"("datasetRefId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "DatasetEntry_datasetVersionId_position_key" ON "DatasetEntry"("datasetVersionId", "position");

-- CreateIndex
CREATE INDEX "DatasetEntry_taskRecordId_idx" ON "DatasetEntry"("taskRecordId");

-- CreateIndex
CREATE INDEX "DatasetEntry_correctionRecordId_idx" ON "DatasetEntry"("correctionRecordId");

-- AddForeignKey
ALTER TABLE "CorrectionRecord" ADD CONSTRAINT "CorrectionRecord_taskRecordId_fkey" FOREIGN KEY ("taskRecordId") REFERENCES "TaskRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetVersion" ADD CONSTRAINT "DatasetVersion_datasetRefId_fkey" FOREIGN KEY ("datasetRefId") REFERENCES "Dataset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetEntry" ADD CONSTRAINT "DatasetEntry_datasetVersionId_fkey" FOREIGN KEY ("datasetVersionId") REFERENCES "DatasetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetEntry" ADD CONSTRAINT "DatasetEntry_taskRecordId_fkey" FOREIGN KEY ("taskRecordId") REFERENCES "TaskRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetEntry" ADD CONSTRAINT "DatasetEntry_correctionRecordId_fkey" FOREIGN KEY ("correctionRecordId") REFERENCES "CorrectionRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
