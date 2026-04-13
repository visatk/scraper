export interface SchemaTemplate {
  id: string;
  name: string;
  emoji: string;
  description: string;
  prompt: string;
  schema: Record<string, unknown>;
  waitUntil?: "load" | "domcontentloaded" | "networkidle0" | "networkidle2";
}

export const TEMPLATES: SchemaTemplate[] = [
  {
    id: "ecommerce",
    name: "E-Commerce Product",
    emoji: "🛒",
    description: "Extract product details, price, availability",
    prompt: "Extract the main product information from this e-commerce page including name, price, availability, description, images, and ratings.",
    waitUntil: "networkidle2",
    schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        price: { type: "string" },
        currency: { type: "string" },
        original_price: { type: "string" },
        discount: { type: "string" },
        availability: { type: "string", enum: ["in_stock", "out_of_stock", "limited", "preorder", "unknown"] },
        rating: { type: "number" },
        review_count: { type: "integer" },
        description: { type: "string" },
        brand: { type: "string" },
        sku: { type: "string" },
        categories: { type: "array", items: { type: "string" } },
        images: { type: "array", items: { type: "string" } },
        specifications: {
          type: "array",
          items: {
            type: "object",
            properties: { key: { type: "string" }, value: { type: "string" } },
          },
        },
      },
      required: ["name", "price", "availability"],
    },
  },
  {
    id: "article",
    name: "News / Article",
    emoji: "📰",
    description: "Extract article metadata and content",
    prompt: "Extract the article's metadata and content structure.",
    schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        subtitle: { type: "string" },
        author: { type: "string" },
        published_date: { type: "string" },
        modified_date: { type: "string" },
        category: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        summary: { type: "string" },
        word_count: { type: "integer" },
        reading_time_minutes: { type: "integer" },
        canonical_url: { type: "string" },
        og_image: { type: "string" },
        key_points: { type: "array", items: { type: "string" } },
      },
      required: ["title", "author", "published_date"],
    },
  },
  {
    id: "job_listing",
    name: "Job Listing",
    emoji: "💼",
    description: "Extract job posting details",
    prompt: "Extract all relevant job posting information from this page.",
    schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        company: { type: "string" },
        location: { type: "string" },
        remote: { type: "boolean" },
        job_type: { type: "string", enum: ["full_time", "part_time", "contract", "freelance", "internship", "unknown"] },
        experience_level: { type: "string" },
        salary_range: {
          type: "object",
          properties: {
            min: { type: "number" },
            max: { type: "number" },
            currency: { type: "string" },
            period: { type: "string" },
          },
        },
        skills: { type: "array", items: { type: "string" } },
        responsibilities: { type: "array", items: { type: "string" } },
        requirements: { type: "array", items: { type: "string" } },
        benefits: { type: "array", items: { type: "string" } },
        apply_url: { type: "string" },
        posted_date: { type: "string" },
        deadline: { type: "string" },
      },
      required: ["title", "company"],
    },
  },
  {
    id: "real_estate",
    name: "Real Estate Listing",
    emoji: "🏠",
    description: "Extract property listing details",
    prompt: "Extract all property details from this real estate listing.",
    waitUntil: "networkidle2",
    schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        price: { type: "string" },
        price_type: { type: "string", enum: ["for_sale", "for_rent", "unknown"] },
        address: { type: "string" },
        city: { type: "string" },
        bedrooms: { type: "integer" },
        bathrooms: { type: "number" },
        area_sqft: { type: "number" },
        lot_size: { type: "string" },
        year_built: { type: "integer" },
        property_type: { type: "string" },
        features: { type: "array", items: { type: "string" } },
        agent_name: { type: "string" },
        agent_phone: { type: "string" },
        listing_id: { type: "string" },
      },
      required: ["title", "price"],
    },
  },
  {
    id: "social_profile",
    name: "Social / Profile Page",
    emoji: "👤",
    description: "Extract user/company profile information",
    prompt: "Extract profile information from this social or profile page.",
    schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        handle: { type: "string" },
        bio: { type: "string" },
        followers: { type: "integer" },
        following: { type: "integer" },
        posts_count: { type: "integer" },
        verified: { type: "boolean" },
        website: { type: "string" },
        location: { type: "string" },
        joined_date: { type: "string" },
        links: { type: "array", items: { type: "string" } },
      },
      required: ["name"],
    },
  },
  {
    id: "contact",
    name: "Contact Information",
    emoji: "📇",
    description: "Extract contact details from any page",
    prompt: "Extract all contact information from this page.",
    schema: {
      type: "object",
      properties: {
        company_name: { type: "string" },
        emails: { type: "array", items: { type: "string" } },
        phones: { type: "array", items: { type: "string" } },
        address: { type: "string" },
        city: { type: "string" },
        country: { type: "string" },
        website: { type: "string" },
        social_media: {
          type: "object",
          properties: {
            twitter: { type: "string" },
            linkedin: { type: "string" },
            facebook: { type: "string" },
            instagram: { type: "string" },
          },
        },
        business_hours: { type: "array", items: { type: "string" } },
      },
      required: ["company_name"],
    },
  },
  {
    id: "review",
    name: "Reviews & Ratings",
    emoji: "⭐",
    description: "Extract reviews and ratings",
    prompt: "Extract all reviews, ratings, and testimonials from this page.",
    waitUntil: "networkidle2",
    schema: {
      type: "object",
      properties: {
        product_name: { type: "string" },
        overall_rating: { type: "number" },
        total_reviews: { type: "integer" },
        rating_breakdown: {
          type: "object",
          properties: {
            five_star: { type: "integer" },
            four_star: { type: "integer" },
            three_star: { type: "integer" },
            two_star: { type: "integer" },
            one_star: { type: "integer" },
          },
        },
        reviews: {
          type: "array",
          items: {
            type: "object",
            properties: {
              author: { type: "string" },
              rating: { type: "number" },
              date: { type: "string" },
              title: { type: "string" },
              body: { type: "string" },
              verified_purchase: { type: "boolean" },
              helpful_count: { type: "integer" },
            },
          },
        },
      },
      required: ["overall_rating"],
    },
  },
  {
    id: "headings",
    name: "Page Structure",
    emoji: "📑",
    description: "Extract page headings and structure",
    prompt: "Extract the page title, all headings (h1-h6), and meta description to understand the page structure.",
    schema: {
      type: "object",
      properties: {
        page_title: { type: "string" },
        meta_description: { type: "string" },
        h1: { type: "array", items: { type: "string" } },
        h2: { type: "array", items: { type: "string" } },
        h3: { type: "array", items: { type: "string" } },
        links: {
          type: "array",
          items: {
            type: "object",
            properties: { text: { type: "string" }, href: { type: "string" } },
          },
        },
        word_count: { type: "integer" },
      },
      required: ["page_title"],
    },
  },
];

export function getTemplate(id: string): SchemaTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export const AI_MODELS = [
  {
    id: "workers_ai",
    name: "Workers AI (Llama 3.3 70B)",
    emoji: "☁️",
    description: "Default · Fast · Free tier",
    custom_ai: null,
  },
  {
    id: "claude_sonnet",
    name: "Claude Sonnet 4",
    emoji: "🧠",
    description: "Best quality · Requires Anthropic key",
    custom_ai: (key: string) => ({
      model: "anthropic/claude-sonnet-4-20250514",
      authorization: `Bearer ${key}`,
    }),
  },
  {
    id: "gpt4o",
    name: "GPT-4o",
    emoji: "🤖",
    description: "Great quality · Requires OpenAI key",
    custom_ai: (key: string) => ({
      model: "openai/gpt-4o",
      authorization: `Bearer ${key}`,
    }),
  },
] as const;

export type ModelId = (typeof AI_MODELS)[number]["id"];
