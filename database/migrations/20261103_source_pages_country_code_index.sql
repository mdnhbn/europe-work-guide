-- Index the source_pages foreign key so country deletes/updates and joins do not scan the table.
CREATE INDEX IF NOT EXISTS source_pages_country_code_idx
  ON public.source_pages (country_code);
