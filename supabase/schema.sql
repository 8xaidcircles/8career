-- 8Career スキーマ（要件定義書 v4.3 §7 準拠）
-- Supabase ダッシュボード → SQL Editor に貼り付けて実行する

-- =====================================================================
-- 7.1 user_profiles：ユーザーの現在地と目標
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.user_profiles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    current_job_title TEXT NOT NULL,
    experiences JSONB DEFAULT '[]'::jsonb,   -- PDL準拠: [{"title":"","company":"","start_date":"","end_date":""}]
    educations JSONB DEFAULT '[]'::jsonb,    -- PDL準拠: [{"school":"","majors":[],"degrees":[]}]
    skills TEXT[] DEFAULT '{}',
    qualifications TEXT[] DEFAULT '{}',      -- 任意入力。v4.3 の決定によりスコア計算には使用しない
    target_job_title TEXT NOT NULL,
    target_organization TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "自分のプロファイルだけ読める"
    ON public.user_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "自分のプロファイルだけ作れる"
    ON public.user_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "自分のプロファイルだけ更新できる"
    ON public.user_profiles FOR UPDATE USING (auth.uid() = user_id);

-- =====================================================================
-- 7.2 goal_intelligence：到達者統計（Goal Profile のキャッシュ）
--     ユーザーのリクエストごとに PDL を叩かず、必ずここを参照する
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.goal_intelligence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_title TEXT NOT NULL UNIQUE,
    sample_size INT NOT NULL,                                       -- 画面に必ず表示する母数 N
    skill_distributions JSONB NOT NULL DEFAULT '[]'::jsonb,         -- [{"name":"python","rate":78.0}]
    experience_distributions JSONB NOT NULL DEFAULT '[]'::jsonb,    -- [{"name":"data analyst","rate":37.0}]
    education_distributions JSONB NOT NULL DEFAULT '[]'::jsonb,     -- [{"name":"computer science","rate":31.0}]
    career_patterns JSONB DEFAULT '[]'::jsonb,                      -- Nemotron が生成する3つの到達パターン
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_goal_intelligence_title
    ON public.goal_intelligence(goal_title);

ALTER TABLE public.goal_intelligence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "統計データは誰でも読める"
    ON public.goal_intelligence FOR SELECT USING (true);

-- =====================================================================
-- 7.2.1 pdl_raw_profiles：PDL 生レスポンスの保管（クレジット保護）
--     1レコード = 1クレジット。取得したものは加工せずここに退避し、
--     出現率の集計は必ずこのテーブルからの再計算で行う
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.pdl_raw_profiles (
    pdl_id TEXT PRIMARY KEY,
    goal_title TEXT NOT NULL,
    raw JSONB NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_pdl_raw_profiles_goal
    ON public.pdl_raw_profiles(goal_title);

ALTER TABLE public.pdl_raw_profiles ENABLE ROW LEVEL SECURITY;
-- ポリシーを作らない = service_role 以外からは一切読めない（個人データのため）

-- =====================================================================
-- 7.3 canonical_skills：表記ゆれの正規化マッピング
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.canonical_skills (
    raw_name TEXT PRIMARY KEY,      -- PDL生データ例: "python 3", "python programming"
    canonical_name TEXT NOT NULL,   -- 正規化後: "Python"
    category TEXT                   -- 例: "Programming Language"
);

ALTER TABLE public.canonical_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "正規化テーブルは誰でも読める"
    ON public.canonical_skills FOR SELECT USING (true);
