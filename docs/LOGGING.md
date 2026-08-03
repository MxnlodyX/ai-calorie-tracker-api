# API Logging

The backend logs one final entry per HTTP request and numbered entries for each authentication step. Logs never include tokens, cookies, OAuth state, email addresses, user IDs, request bodies, or query strings.

## Google OAuth flow

Opening this URL starts the flow:

```text
http://localhost:4000/authentications/google
```

The login consists of two HTTP requests separated by the Google consent screen:

```text
Request 1: Browser -> Backend -> Google
Request 2: Google -> Backend callback -> Frontend
```

| Step | Action                    | Module             | What happens next                                                                 |
| ---: | ------------------------- | ------------------ | --------------------------------------------------------------------------------- |
|    1 | `redirect_to_google`      | `GoogleOAuthGuard` | Creates the state cookie and redirects the browser to Google                      |
|    2 | `validate_oauth_state`    | `GoogleOAuthGuard` | Google returns to the callback; the guard compares callback state with the cookie |
|    3 | `validate_google_profile` | `GoogleStrategy`   | Exchanges the Google code and accepts only a profile with a verified email        |
|    4 | `resolve_local_account`   | `AuthService`      | Loads an existing link or creates `User` and `GoogleAccount` records              |
|    5 | `issue_access_token`      | `AuthService`      | Signs the backend JWT                                                             |
|    6 | `create_login_session`    | `AuthController`   | Stores the JWT in the `access_token` HttpOnly cookie                              |
|    7 | `redirect_to_frontend`    | `AuthController`   | Redirects the browser to `FRONTEND_URL`                                           |

Example successful flow entry:

```text
{
  flow: 'google_oauth',
  step: 4,
  action: 'resolve_local_account',
  status: 'success',
  message: 'Existing Google account link and local user loaded'
}
```

If a step fails, the same step number and action are logged with `status: 'failed'`. Later steps will not appear, which identifies where the flow stopped.

## HTTP request log

Each request produces one final entry after NestJS knows the response status:

```text
{
  flow: 'http',
  step: 'request_completed',
  status: 'failed',
  message: 'HTTP request completed',
  statusCode: 401,
  durationMs: 8,
  method: 'GET',
  path: '/authentications/me'
}
```

Responses below `400` use `status: 'success'`. Responses from `400` upward use `status: 'failed'` and the warning log level.

## Authenticated requests

`GET /authentications/me` uses a separate flow:

| Step | Action                    | Meaning                                              |
| ---: | ------------------------- | ---------------------------------------------------- |
|    1 | `load_authenticated_user` | JWT is valid and its current database user is loaded |
|    2 | `return_current_user`     | The safe user fields are returned to the client      |

`POST /authentications/logout` logs flow `logout`, step `1`, action `clear_login_session` after clearing the cookie.
