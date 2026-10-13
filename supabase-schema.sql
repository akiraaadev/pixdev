-- ==============================================================================
-- MEU PIX NFC — SCHEMA COMPLETO DO BANCO DE DADOS (SUPABASE POSTGRESQL)
-- ==============================================================================
-- Compatível com Supabase Auth e Row Level Security (RLS)
-- Execução idempotente com DROP/CREATE e comentários explicativos.

-- 1. EXTENSÕES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TABELA: PLANS (Planos da plataforma)
CREATE TABLE IF NOT EXISTS public.plans (
    id TEXT PRIMARY KEY, -- 'gratuito', 'essencial', 'profissional', 'empresarial'
    name TEXT NOT NULL,
    target_audience TEXT NOT NULL,
    price_cents INTEGER NOT NULL DEFAULT 0,
    max_links INTEGER NOT NULL DEFAULT 3, -- -1 para ilimitado
    max_establishments INTEGER NOT NULL DEFAULT 1,
    custom_branding BOOLEAN NOT NULL DEFAULT FALSE,
    nfc_management BOOLEAN NOT NULL DEFAULT FALSE,
    advanced_analytics BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Inserir planos padrão
INSERT INTO public.plans (id, name, target_audience, price_cents, max_links, max_establishments, custom_branding, nfc_management, advanced_analytics)
VALUES 
    ('gratuito', 'Gratuito', 'Para autônomos e testes iniciais', 0, 3, 1, false, false, false),
    ('essencial', 'Essencial', 'Para pequenos comércios e lojas locais', 2900, 20, 1, true, false, true),
    ('profissional', 'Profissional', 'Para comércios em expansão com plaquinhas NFC', 5900, -1, 3, true, true, true),
    ('empresarial', 'Empresarial', 'Para redes de franquias e gestão multiloja', 12900, -1, 10, true, true, true)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    target_audience = EXCLUDED.target_audience,
    price_cents = EXCLUDED.price_cents,
    max_links = EXCLUDED.max_links,
    max_establishments = EXCLUDED.max_establishments,
    custom_branding = EXCLUDED.custom_branding,
    nfc_management = EXCLUDED.nfc_management,
    advanced_analytics = EXCLUDED.advanced_analytics;

-- 3. TABELA: PROFILES (Perfis de usuários vinculados ao auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'merchant' CHECK (role IN ('admin', 'merchant')),
    plan_tier TEXT NOT NULL DEFAULT 'profissional' REFERENCES public.plans(id),
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 4. TABELA: ESTABLISHMENTS (Estabelecimentos / Lojas comerciais)
CREATE TABLE IF NOT EXISTS public.establishments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    owner_name TEXT NOT NULL,
    document TEXT NOT NULL, -- CPF ou CNPJ
    document_type TEXT NOT NULL CHECK (document_type IN ('cpf', 'cnpj')),
    phone TEXT NOT NULL,
    whatsapp TEXT,
    email TEXT NOT NULL,
    logo_url TEXT,
    city TEXT NOT NULL,
    address TEXT,
    slug TEXT NOT NULL UNIQUE, -- Identificador da URL: /p/farmacia-do-carro
    primary_color TEXT NOT NULL DEFAULT '#00B8A9',
    secondary_color TEXT NOT NULL DEFAULT '#7137E8',
    background_image_url TEXT,
    welcome_message TEXT DEFAULT 'Aproxime e pague rapidamente via Pix',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 5. TABELA: PIX_KEYS (Chaves Pix dos estabelecimentos)
CREATE TABLE IF NOT EXISTS public.pix_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
    key_type TEXT NOT NULL CHECK (key_type IN ('cpf', 'cnpj', 'email', 'phone', 'random')),
    key_value TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT 'Chave Principal',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 6. TABELA: PAYMENT_LINKS (Links de pagamento personalizados)
CREATE TABLE IF NOT EXISTS public.payment_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
    pix_key_id UUID NOT NULL REFERENCES public.pix_keys(id) ON DELETE RESTRICT,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    amount NUMERIC(10, 2), -- NULL para valor livre
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    visits_count INTEGER NOT NULL DEFAULT 0,
    txid TEXT DEFAULT '***',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 7. TABELA: NFC_TAGS (Plaquinhas NFC físicas vinculadas aos links)
CREATE TABLE IF NOT EXISTS public.nfc_tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tag_code TEXT NOT NULL UNIQUE, -- Identificador físico da plaquinha: NFC-FARMA-01
    establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
    payment_link_id UUID NOT NULL REFERENCES public.payment_links(id) ON DELETE RESTRICT,
    label TEXT NOT NULL, -- Ex: 'Balcão Caixa 1'
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    taps_count INTEGER NOT NULL DEFAULT 0,
    last_tap_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 8. TABELA: PAGE_VISITS (Registro de acessos e toques NFC)
CREATE TABLE IF NOT EXISTS public.page_visits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
    payment_link_id UUID REFERENCES public.payment_links(id) ON DELETE SET NULL,
    nfc_tag_id UUID REFERENCES public.nfc_tags(id) ON DELETE SET NULL,
    source TEXT NOT NULL CHECK (source IN ('direct_link', 'nfc_tap', 'qr_scan')),
    user_agent TEXT,
    ip_hash TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    date_str DATE DEFAULT CURRENT_DATE NOT NULL
);

-- 9. TABELA: SUBSCRIPTIONS (Assinaturas ativas)
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    plan_id TEXT NOT NULL REFERENCES public.plans(id),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'canceled')),
    current_period_end TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ==============================================================================
-- ÍNDICES PARA PERFORMANCE
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_establishments_slug ON public.establishments(slug);
CREATE INDEX IF NOT EXISTS idx_establishments_user_id ON public.establishments(user_id);
CREATE INDEX IF NOT EXISTS idx_pix_keys_establishment ON public.pix_keys(establishment_id);
CREATE INDEX IF NOT EXISTS idx_payment_links_slug ON public.payment_links(slug);
CREATE INDEX IF NOT EXISTS idx_payment_links_establishment ON public.payment_links(establishment_id);
CREATE INDEX IF NOT EXISTS idx_nfc_tags_code ON public.nfc_tags(tag_code);
CREATE INDEX IF NOT EXISTS idx_nfc_tags_establishment ON public.nfc_tags(establishment_id);
CREATE INDEX IF NOT EXISTS idx_page_visits_date ON public.page_visits(date_str, establishment_id);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.establishments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pix_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nfc_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Profiles: usuários leem e editam seu próprio perfil. Admins leem todos.
CREATE POLICY "Users can read own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- Establishments: donos gerenciam seus estabelecimentos; público pode ler por slug (para checkout)
CREATE POLICY "Public read establishments by slug" ON public.establishments
    FOR SELECT USING (true);

CREATE POLICY "Users manage own establishments" ON public.establishments
    FOR ALL USING (auth.uid() = user_id OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- Pix Keys: Dono do estabelecimento ou admin pode gerenciar. Público pode ler chave ativa do link.
CREATE POLICY "Public read active pix keys" ON public.pix_keys
    FOR SELECT USING (is_active = true);

CREATE POLICY "Users manage own establishment pix keys" ON public.pix_keys
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.establishments e 
            WHERE e.id = establishment_id 
            AND (e.user_id = auth.uid() OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin')
        )
    );

-- Payment Links: Público pode ler links ativos. Donos gerenciam os seus.
CREATE POLICY "Public read active payment links" ON public.payment_links
    FOR SELECT USING (is_active = true);

CREATE POLICY "Users manage own payment links" ON public.payment_links
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.establishments e 
            WHERE e.id = establishment_id 
            AND (e.user_id = auth.uid() OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin')
        )
    );

-- NFC Tags: Público pode ler plaquinhas ativas para redirecionamento. Donos gerenciam.
CREATE POLICY "Public read active nfc tags" ON public.nfc_tags
    FOR SELECT USING (status = 'active');

CREATE POLICY "Users manage own nfc tags" ON public.nfc_tags
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.establishments e 
            WHERE e.id = establishment_id 
            AND (e.user_id = auth.uid() OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin')
        )
    );

-- Page Visits: Qualquer um pode inserir visita (ao escanear ou tocar no NFC). Donos leem suas métricas.
CREATE POLICY "Anyone can register page visit" ON public.page_visits
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Users read own establishment visits" ON public.page_visits
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.establishments e 
            WHERE e.id = establishment_id 
            AND (e.user_id = auth.uid() OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin')
        )
    );

-- ==============================================================================
-- TRIGGER PARA CRIAÇÃO AUTOMÁTICA DE PERFIL QUANDO O USUÁRIO CADASTRA NO AUTH
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, name, role, plan_tier)
    VALUES (
        new.id,
        new.email,
        COALESCE(new.raw_user_meta_data->>'name', 'Usuário Meu Pix'),
        COALESCE(new.raw_user_meta_data->>'role', 'merchant'),
        'profissional'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
