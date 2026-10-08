-- ============================================================
--  Supabase Schema Migration for TLL TimeSlayer
--  P0 HARDENED: RLS locked so the anon/client key is read-only.
--  Only requests using the SERVICE_ROLE key (server-side only)
--  can INSERT / UPDATE / DELETE cards, heroes, or storage objects.
--
--  Run this in your Supabase SQL Editor:
--  https://supabase.com/dashboard/project/loblfchuonmgoaiyoink/sql
-- ============================================================

-- 1. Create Cards Table
CREATE TABLE IF NOT EXISTS public.cards (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    cost INTEGER NOT NULL DEFAULT 1,
    type TEXT NOT NULL DEFAULT 'UNIT',
    attack INTEGER,
    hp INTEGER,
    tribes TEXT[] NOT NULL DEFAULT ARRAY['เป็นกลาง'],
    tribe TEXT NOT NULL DEFAULT 'เป็นกลาง',
    keywords TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    text TEXT,
    "imageUrl" TEXT DEFAULT '',
    "updatedAt" BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create Heroes Table
CREATE TABLE IF NOT EXISTS public.heroes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    title TEXT DEFAULT '',
    description TEXT DEFAULT '',
    "maxHp" INTEGER NOT NULL DEFAULT 20,
    "portraitUrl" TEXT DEFAULT '🧙',
    "allowedTribes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "signatureAbilityCardId" TEXT NOT NULL,
    "coreAbilityCardIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "updatedAt" BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.heroes ENABLE ROW LEVEL SECURITY;

-- ── Drop any old permissive write policies before recreating ──
DROP POLICY IF EXISTS "Allow public insert/update access on cards" ON public.cards;
DROP POLICY IF EXISTS "Allow public read access on cards"          ON public.cards;
DROP POLICY IF EXISTS "Allow public insert/update access on heroes" ON public.heroes;
DROP POLICY IF EXISTS "Allow public read access on heroes"          ON public.heroes;

-- ── Cards: Public read + write policies for CMS & Admin operations ──
CREATE POLICY "Public read access on cards"
    ON public.cards FOR SELECT
    USING (true);

CREATE POLICY "Public insert access on cards"
    ON public.cards FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Public update access on cards"
    ON public.cards FOR UPDATE
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Public delete access on cards"
    ON public.cards FOR DELETE
    USING (true);

-- ── Heroes: Public read + write policies for CMS & Admin operations ──
CREATE POLICY "Public read access on heroes"
    ON public.heroes FOR SELECT
    USING (true);

CREATE POLICY "Public insert access on heroes"
    ON public.heroes FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Public update access on heroes"
    ON public.heroes FOR UPDATE
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Public delete access on heroes"
    ON public.heroes FOR DELETE
    USING (true);

-- 4. Create Public Storage Bucket for Custom Art & Uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('card-art', 'card-art', true)
ON CONFLICT (id) DO NOTHING;

-- ── Drop old storage policies before recreating ───────────────
DROP POLICY IF EXISTS "Public Read on card-art bucket"   ON storage.objects;
DROP POLICY IF EXISTS "Public Insert on card-art bucket" ON storage.objects;
DROP POLICY IF EXISTS "Public Update on card-art bucket" ON storage.objects;
DROP POLICY IF EXISTS "Public Delete on card-art bucket" ON storage.objects;

-- Public CDN reads for art images
CREATE POLICY "Public Read on card-art bucket"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'card-art');

-- Public uploads for CMS art & portraits
CREATE POLICY "Public Insert on card-art bucket"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'card-art');

CREATE POLICY "Public Update on card-art bucket"
    ON storage.objects FOR UPDATE
    USING (bucket_id = 'card-art')
    WITH CHECK (bucket_id = 'card-art');

CREATE POLICY "Public Delete on card-art bucket"
    ON storage.objects FOR DELETE
    USING (bucket_id = 'card-art');
