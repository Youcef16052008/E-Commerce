-- L6.2 : recherche plein texte Postgres (aucune infrastructure nouvelle).
-- `unaccent` est STABLE : une colonne générée exige une fonction IMMUTABLE,
-- d'où le wrapper `biblio_unaccent` (dictionnaire fixe `unaccent`).
CREATE EXTENSION IF NOT EXISTS unaccent;--> statement-breakpoint
CREATE OR REPLACE FUNCTION biblio_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent', $1) $$;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "search_vector" "tsvector" GENERATED ALWAYS AS (
        setweight(to_tsvector('simple', biblio_unaccent(coalesce(title, ''))), 'A') ||
        setweight(to_tsvector('simple', biblio_unaccent(coalesce(author, ''))), 'B') ||
        setweight(to_tsvector('simple', biblio_unaccent(coalesce(description, ''))), 'C') ||
        setweight(to_tsvector('simple', biblio_unaccent(coalesce(genre, ''))), 'D')
      ) STORED;--> statement-breakpoint
CREATE INDEX "products_search_vector_idx" ON "products" USING gin ("search_vector");