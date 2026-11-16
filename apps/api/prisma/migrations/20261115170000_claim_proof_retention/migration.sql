-- T-30: the document of a REJECTED claim is deleted 90 days after the decision
-- (ClaimDocumentCleanupJob, docs/07-security.md → «Сроки хранения»); the row stays.
ALTER TABLE "WaterClaim" ALTER COLUMN "proofFileKey" DROP NOT NULL;

-- Only a rejected claim may lose its document: a pending one still waits for a decision,
-- an approved one is the evidence the water was handed to the organization.
ALTER TABLE "WaterClaim" ADD CONSTRAINT claim_proof_kept
  CHECK ("proofFileKey" IS NOT NULL OR "status" = 'REJECTED');
