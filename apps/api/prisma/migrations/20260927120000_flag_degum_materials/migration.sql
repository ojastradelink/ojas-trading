-- Degum materials created by hand after the unified-deals migration were left
-- un-flagged, so their deals never reached the Degum section. Flag the known
-- crude-degummed-SBO codes (CDSBO / CSBDO, letters only) and any product named
-- "crude … degummed". New products get the same default in ProductsService.
UPDATE "products" SET "isDegum" = true
WHERE "isDegum" = false
  AND (
    upper(regexp_replace("code", '[^A-Za-z]', '', 'g')) IN ('CDSBO', 'CSBDO')
    OR ("name" ILIKE '%crude%' AND "name" ILIKE '%degum%')
  );
