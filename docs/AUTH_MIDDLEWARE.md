Auth middleware pattern (standardized)

Purpose
- Provide a small, consistent, and safe JWT authentication middleware used across all services.
- Prevent accidental passing of Express `res`/`req` objects into data helpers which can leak sockets and cause circular JSON errors.

Contract (inputs / outputs)
- Input: Express `req`, `res`, `next` in middleware handlers.
- Token source: `x-auth-token` HTTP header (string).
- Output (on success): sets `req.user = decodedJwtPayload` and calls `next()`.
- Output (on failure): calls the project's centralized error handler `handleError(res, err)` with a structured error object.

Data shapes
- Decoded JWT (stored on `req.user`) is the decoded payload object returned by `jwt.verify` (typically contains `_id`, `role`, etc.).
- Error object thrown from `verifyToken` should be `{ status: <httpCode>, message: <string> }`.

Success criteria
- Valid token: request proceeds to the next handler and `req.user` is expanded.
- Invalid/missing/expired token: request returns a consistent 401 (or 403 for role mismatch) JSON response via `handleError`.

Implementation pattern (canonical)

1) verifyToken(req)
- Read token from header: `const token = req.header('x-auth-token')`.
- If missing: `throw { status: 401, message: 'Token missing: Authorization denied!' }`.
- Verify with: `jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] })`.
- On verification failure: `throw { status: 401, message: 'Token is not valid or expired' }`.
- On success: assign `req.user = decoded` and return `decoded`.

2) auth middleware
- Sync function: `const auth = (req, res, next) => { try { verifyToken(req); return next(); } catch (err) { return handleError(res, err); } }`.

3) authRole middleware
- Return a middleware that calls `verifyToken(req)` then checks `req.user.role` against an allowed array.
- If role is missing or not allowed, throw `{ status: 403, message: 'Unauthorized' }` (or 401 for expired session).
- Catch errors and forward to `handleError(res, err)`.

Common mistakes to avoid
- Do not pass `req` or `res` into helpers that return data (for example: `getFromService(url, res)` or `findXById(id, res)`), unless a helper is explicitly documented to accept `res` and perform `handleError` itself.
- Do not return or include `req`/`res` in JSON responses.
- Avoid `async` on `auth` unless you `await` something — prefer a synchronous pattern for simple token verification.

Examples

Canonical `verifyToken` snippet:

```js
const verifyToken = (req) => {
  const token = req.header('x-auth-token');
  if (!token) throw { status: 401, message: 'Token missing: Authorization denied!' };
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    req.user = decoded;
    return decoded;
  } catch (err) {
    throw { status: 401, message: 'Token is not valid or expired' };
  }
};
```

Canonical `auth` / `authRole` snippets:

```js
const auth = (req, res, next) => {
  try {
    verifyToken(req);
    return next();
  } catch (err) {
    return handleError(res, err);
  }
};

const authRole = (roles) => (req, res, next) => {
  try {
    verifyToken(req);
    if (!req.user) throw { status: 401, message: 'Session expired' };
    if (Array.isArray(roles) && roles.includes(req.user.role)) return next();
    throw { status: 403, message: 'Unauthorized' };
  } catch (err) {
    return handleError(res, err);
  }
};
```

Notes for reviewers and contributors
- When adding a new service, copy this pattern into `middlewares/auth.js` and wire it into routes using `auth` and `authRole` exports.
- If a helper intentionally uses `res` (to call `handleError` directly), document that expectation in the helper's JSDoc. Prefer returning errors and letting controllers call `handleError` where practical.
- Keep token algorithm(s) and secret management consistent across services via `process.env.JWT_SECRET` and documented algorithm list.

Test suggestions
- Unit test `verifyToken` with valid, expired, and malformed tokens to assert expected thrown error objects.
- Integration test: call a protected route without token, with invalid token, and with a valid token; assert HTTP 401/403 responses.

If you'd like, I can add a short linter rule or a simple grep-based CI check to warn when a helper call includes `res` as a data-argument (example: `getFromService(..., res)`).
