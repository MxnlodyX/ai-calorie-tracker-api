export default () => ({
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3000',
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
  nodeEnv: process.env.NODE_ENV ?? 'development',
});
