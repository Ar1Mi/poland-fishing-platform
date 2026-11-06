-- What an organization tells anglers about its connected water (T-23, FR-05): the season in its
-- own words and a photo (StorageService key). The import never touches them.
-- importedAt: when the catalogue fields of the row last came from an import (ADR-0007); the card
-- shows it as the date of the data, which updatedAt no longer is (claims and edits change it).
ALTER TABLE "FishingWater" ADD COLUMN     "importedAt" TIMESTAMPTZ(3),
ADD COLUMN     "photoKey" TEXT,
ADD COLUMN     "seasonInfo" TEXT;

-- Rows imported before the column: the last change is the best known date. An angler's suggestion
-- (USER, FR-25) never comes from an import.
UPDATE "FishingWater" SET "importedAt" = "updatedAt" WHERE "source" <> 'USER';
