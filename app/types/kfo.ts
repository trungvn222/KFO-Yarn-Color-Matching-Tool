export interface KfoProduct {
  variant_id: string;
  product_name: string;
  handle: string;
  position: number;
  image_url?: string;
}

export interface KfoCombination {
  objectID: string;
  name: string;
  image_url: string;
  position: number;
  tags: string[];
  colors: string[];
  products: KfoProduct[];
}

export interface KfoColor {
  objectID: string;
  name: string;
  hex: string;
  image_url?: string;
  description?: string;
}

export interface KfoTag {
  objectID: string;
  name: string;
  slug: string;
  color: string;
  image_url?: string;
  description?: string;
}

export interface ShopifyVariant {
  id: string;
  title: string;
  product_title: string;
  product_id: string;
}
