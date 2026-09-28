
-- ROLES
CREATE TYPE public.app_role AS ENUM ('user','seller','admin');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own roles readable" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role);
$$;

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profile self read" ON public.profiles FOR SELECT TO authenticated USING (auth.uid()=id);
CREATE POLICY "profile self write" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid()=id);
CREATE POLICY "profile self insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid()=id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.profiles(id, display_name) VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)));
  INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- PRODUCTS (public read)
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  brand TEXT NOT NULL,
  price INTEGER NOT NULL,
  original_price INTEGER,
  rating NUMERIC(2,1) DEFAULT 4.2,
  image_url TEXT NOT NULL,
  category TEXT NOT NULL, -- dress, top, bottom, ethnic, accessory-shoes, accessory-bag, accessory-jewelry, accessory-watch, outerwear
  color TEXT,
  pattern TEXT,
  fabric TEXT,
  sleeve TEXT,
  neckline TEXT,
  fit TEXT,
  length TEXT,
  style TEXT,
  occasion TEXT,
  gender TEXT DEFAULT 'women',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.products TO anon, authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products public read" ON public.products FOR SELECT TO anon, authenticated USING (true);

-- STYLELOOM ITEMS
CREATE TABLE public.styleloom_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  selected_attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, product_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.styleloom_items TO authenticated;
GRANT ALL ON public.styleloom_items TO service_role;
ALTER TABLE public.styleloom_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own styleloom" ON public.styleloom_items FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);

-- CART
CREATE TABLE public.cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  qty INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, product_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cart_items TO authenticated;
GRANT ALL ON public.cart_items TO service_role;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own cart" ON public.cart_items FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);

-- SWIPES
CREATE TABLE public.swipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('like','dislike')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.swipes TO authenticated;
GRANT ALL ON public.swipes TO service_role;
ALTER TABLE public.swipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own swipes" ON public.swipes FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);

-- DESIGN REQUESTS
CREATE TABLE public.design_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  prompt TEXT,
  signature TEXT NOT NULL, -- normalized key attributes for aggregation
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.design_requests TO authenticated;
GRANT ALL ON public.design_requests TO service_role;
ALTER TABLE public.design_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own design_requests" ON public.design_requests FOR SELECT TO authenticated USING (auth.uid()=user_id);
CREATE POLICY "insert own design_requests" ON public.design_requests FOR INSERT TO authenticated WITH CHECK (auth.uid()=user_id);
CREATE POLICY "seller reads all design_requests" ON public.design_requests FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'seller') OR public.has_role(auth.uid(),'admin'));

-- SEED PRODUCTS
INSERT INTO public.products (title, brand, price, original_price, image_url, category, color, pattern, fabric, sleeve, neckline, fit, length, style, occasion) VALUES
('Blush Floral Midi Dress','Anouk',1899,3299,'https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=800','dress','pink','floral','georgette','short','v-neck','a-line','midi','feminine','casual'),
('Ivory Ruffle Maxi Dress','Athena',2499,4999,'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=800','dress','white','solid','chiffon','sleeveless','round','flared','maxi','elegant','party'),
('Emerald Satin Slip Dress','Vero Moda',1799,3599,'https://images.unsplash.com/photo-1566174053879-31528523f8ae?w=800','dress','green','solid','satin','sleeveless','cowl','bodycon','midi','glamorous','party'),
('Mustard Cotton Wrap Dress','W',1599,2999,'https://images.unsplash.com/photo-1585487000160-6ebcfceb0d03?w=800','dress','yellow','solid','cotton','half','v-neck','wrap','midi','breezy','casual'),
('Black Puff-Sleeve Bodycon','Zara Style',2199,4299,'https://images.unsplash.com/photo-1571908599407-cdb918ed83bf?w=800','dress','black','solid','knit','puff','square','bodycon','mini','edgy','party'),
('Powder Blue Shirt Dress','Levis',1999,3499,'https://images.unsplash.com/photo-1618932260643-eee4a2f652a6?w=800','dress','blue','solid','linen','full','collar','regular','knee','minimal','office'),
('Coral Tiered Sundress','Global Desi',1499,2999,'https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=800','dress','coral','solid','cotton','sleeveless','sweetheart','tiered','midi','breezy','vacation'),
('Wine Velvet Cocktail Dress','FabAlley',2799,5499,'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=800','dress','red','solid','velvet','long','off-shoulder','bodycon','mini','glamorous','party'),
('Sage Linen Midi','H&M',1699,2999,'https://images.unsplash.com/photo-1583496661160-fb5886a13d44?w=800','dress','green','solid','linen','short','square','a-line','midi','minimal','office'),
('Pastel Pink Tulle Gown','AND',3499,6999,'https://images.unsplash.com/photo-1550639525-c97d455acf70?w=800','dress','pink','solid','tulle','sleeveless','sweetheart','flared','gown','elegant','wedding'),

('Cream Silk Blouse','Mango',1299,2499,'https://images.unsplash.com/photo-1564257577154-75bcc7ad5b6c?w=800','top','white','solid','silk','long','collar','regular','regular','minimal','office'),
('Terracotta Crop Top','Only',799,1499,'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=800','top','orange','solid','cotton','short','round','fitted','cropped','casual','casual'),
('Navy Oversized Shirt','Roadster',999,1999,'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=800','top','blue','solid','cotton','long','collar','oversized','regular','minimal','casual'),
('Lavender Cami','Trendyol',699,1299,'https://images.unsplash.com/photo-1485518882345-15568b007407?w=800','top','purple','solid','satin','sleeveless','v-neck','fitted','regular','elegant','date'),

('High-Waist Wide Leg Jeans','Levis',1799,2999,'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=800','bottom','blue','solid','denim',null,null,'wide','full','casual','casual'),
('Beige Pleated Trousers','Marks & Spencer',1999,3499,'https://images.unsplash.com/photo-1509551388413-e18d0ac5d495?w=800','bottom','beige','solid','polyester',null,null,'straight','full','minimal','office'),
('Black Cargo Pants','H&M',1499,2799,'https://images.unsplash.com/photo-1552902865-b72c031ac5ea?w=800','bottom','black','solid','cotton',null,null,'relaxed','full','edgy','casual'),
('Denim Mini Skirt','Forever 21',899,1799,'https://images.unsplash.com/photo-1583496661160-fb5886a13d44?w=800','bottom','blue','solid','denim',null,null,'fitted','mini','casual','casual'),

('Rose Gold Anarkali','Biba',3499,6999,'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=800','ethnic','pink','embellished','georgette','long','round','flared','floor','festive','wedding'),
('Indigo Block Print Kurta','Fabindia',1599,2999,'https://images.unsplash.com/photo-1583391733956-6c78276477e2?w=800','ethnic','blue','printed','cotton','three-quarter','round','regular','knee','ethnic','casual'),
('Emerald Silk Saree','Sabyasachi Ins.',5999,11999,'https://images.unsplash.com/photo-1610030006687-467d3c19c78e?w=800','ethnic','green','embellished','silk',null,null,'draped','floor','festive','wedding'),
('Mustard Sharara Set','Libas',2899,5499,'https://images.unsplash.com/photo-1594617661206-2f6d4a2b0d68?w=800','ethnic','yellow','printed','georgette','three-quarter','v-neck','flared','floor','festive','festive'),

('Nude Block Heels','Steve Madden',2499,3999,'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=800','accessory-shoes','beige','solid','leather',null,null,null,null,'elegant','party'),
('White Sneakers','Nike',3499,4999,'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800','accessory-shoes','white','solid','canvas',null,null,null,null,'casual','casual'),
('Black Strappy Sandals','Charles & Keith',2999,4999,'https://images.unsplash.com/photo-1603487742131-4160ec999306?w=800','accessory-shoes','black','solid','leather',null,null,null,null,'glamorous','party'),

('Beige Tote Bag','Zouk',1499,2999,'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=800','accessory-bag','beige','solid','leather',null,null,null,null,'minimal','office'),
('Emerald Clutch','Accessorize',1299,2499,'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=800','accessory-bag','green','embellished','satin',null,null,null,null,'glamorous','party'),
('Tan Crossbody','Hidesign',1899,3499,'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800','accessory-bag','brown','solid','leather',null,null,null,null,'casual','casual'),

('Gold Hoop Earrings','Zaveri Pearls',699,1499,'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=800','accessory-jewelry','gold','solid','metal',null,null,null,null,'minimal','all'),
('Pearl Drop Earrings','Zariin',1299,2499,'https://images.unsplash.com/photo-1611085583191-a3b181a88401?w=800','accessory-jewelry','white','solid','pearl',null,null,null,null,'elegant','wedding'),
('Statement Kundan Set','Tribe Amrapali',3999,7999,'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=800','accessory-jewelry','gold','embellished','metal',null,null,null,null,'festive','wedding'),

('Rose Gold Analog Watch','Fossil',6999,11999,'https://images.unsplash.com/photo-1524592094714-0f0654e20314?w=800','accessory-watch','gold','solid','metal',null,null,null,null,'elegant','office'),
('Minimalist Leather Watch','Daniel Wellington',7999,13999,'https://images.unsplash.com/photo-1523170335258-f5ed11844a49?w=800','accessory-watch','brown','solid','leather',null,null,null,null,'minimal','all'),

('Beige Longline Shrug','Vero Moda',1499,2999,'https://images.unsplash.com/photo-1544441893-675973e31985?w=800','outerwear','beige','solid','knit','long','open','regular','long','minimal','casual'),
('Black Cropped Blazer','Zara Style',2999,5499,'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=800','outerwear','black','solid','wool','long','collar','fitted','cropped','edgy','office'),

('Men Navy Blazer','Van Heusen',3999,7999,'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800','dress','blue','solid','wool','long','collar','fitted','regular','minimal','office'),
('Men White Kurta','Manyavar',2499,4999,'https://images.unsplash.com/photo-1622519407650-3df9883f76a5?w=800','ethnic','white','solid','cotton','long','collar','regular','knee','ethnic','wedding');

UPDATE public.products SET gender='men' WHERE title LIKE 'Men %';
