const defaultFrontendUrl = 'http://localhost:3000';

function getFrontendUrl(): string {
  return process.env.FRONTEND_URL ?? defaultFrontendUrl;
}

export default () => ({
  frontendUrl: getFrontendUrl(),
  frontendOrigin: process.env.FRONTEND_ORIGIN,
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
    cookieMaxAgeMs: Number(process.env.JWT_COOKIE_MAX_AGE_MS ?? 900_000),
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackUrl: process.env.GOOGLE_CALLBACK_URL,
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    imageAnalysisModel: process.env.OPENAI_IMAGE_ANALYSIS_MODEL,
    requestTimeoutMs: Number(process.env.OPENAI_REQUEST_TIMEOUT_MS ?? 30_000),
  },
  supabase: {
    url: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    storageBucket: process.env.SUPABASE_STORAGE_BUCKET ?? 'meal-images',
    requestTimeoutMs: Number(process.env.SUPABASE_REQUEST_TIMEOUT_MS ?? 10_000),
  },
  nodeEnv: process.env.NODE_ENV ?? 'development',
});
