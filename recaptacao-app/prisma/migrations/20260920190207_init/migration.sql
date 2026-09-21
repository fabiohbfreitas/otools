-- CreateTable
CREATE TABLE "Patient" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phones" TEXT NOT NULL,
    "primaryPhone" TEXT NOT NULL,
    "polo" TEXT NOT NULL,
    "specialty" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "observation" TEXT,
    "batchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "sheets" TEXT NOT NULL,
    "rows" INTEGER NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DefaultConfig" (
    "id" TEXT NOT NULL,
    "polo" TEXT NOT NULL,
    "specialty" TEXT NOT NULL,
    "vacancies" INTEGER NOT NULL,
    "timeSlots" TEXT NOT NULL,
    "local" TEXT NOT NULL DEFAULT '',
    "maps" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "DefaultConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "appointmentDate" TIMESTAMP(3) NOT NULL,
    "specialty" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignSlot" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "polo" TEXT NOT NULL,
    "vacancies" INTEGER NOT NULL,

    CONSTRAINT "CampaignSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignSlotTime" (
    "id" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "quota" INTEGER,

    CONSTRAINT "CampaignSlotTime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignPatient" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "polo" TEXT NOT NULL,

    CONSTRAINT "CampaignPatient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Patient_primaryPhone_key" ON "Patient"("primaryPhone");

-- CreateIndex
CREATE INDEX "Patient_polo_specialty_status_idx" ON "Patient"("polo", "specialty", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DefaultConfig_polo_specialty_key" ON "DefaultConfig"("polo", "specialty");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignSlot_campaignId_polo_key" ON "CampaignSlot"("campaignId", "polo");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignSlotTime_slotId_time_key" ON "CampaignSlotTime"("slotId", "time");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignPatient_campaignId_patientId_key" ON "CampaignPatient"("campaignId", "patientId");

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignSlot" ADD CONSTRAINT "CampaignSlot_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignSlotTime" ADD CONSTRAINT "CampaignSlotTime_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "CampaignSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignPatient" ADD CONSTRAINT "CampaignPatient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignPatient" ADD CONSTRAINT "CampaignPatient_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
