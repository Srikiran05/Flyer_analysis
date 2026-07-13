-- Create User Saved Filters Table
CREATE TABLE IF NOT EXISTS public.user_saved_filters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  criteria JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS for saved filters
ALTER TABLE public.user_saved_filters ENABLE ROW LEVEL SECURITY;

-- Policies for saved filters
CREATE POLICY "Users can manage their own saved filters"
  ON public.user_saved_filters
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create User Liked Offers Table
CREATE TABLE IF NOT EXISTS public.user_liked_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  offer_id BIGINT NOT NULL REFERENCES public.flyer_products(product_key_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, offer_id)
);

-- Enable RLS for liked offers
ALTER TABLE public.user_liked_offers ENABLE ROW LEVEL SECURITY;

-- Policies for liked offers
CREATE POLICY "Users can manage their own liked offers"
  ON public.user_liked_offers
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create User Offer Notes Table
CREATE TABLE IF NOT EXISTS public.user_offer_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  offer_id BIGINT NOT NULL REFERENCES public.flyer_products(product_key_id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, offer_id)
);

-- Enable RLS for offer notes
ALTER TABLE public.user_offer_notes ENABLE ROW LEVEL SECURITY;

-- Policies for offer notes
CREATE POLICY "Users can manage their own offer notes"
  ON public.user_offer_notes
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
