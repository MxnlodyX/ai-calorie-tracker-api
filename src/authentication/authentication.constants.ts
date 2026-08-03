export const AUTHENTICATION_ROUTE = 'authentications';

// The state cookie only needs to travel through the Google login endpoints.
// Deriving this path from the controller prefix prevents callback path drift.
export const GOOGLE_OAUTH_COOKIE_PATH = `/${AUTHENTICATION_ROUTE}/google`;
