const { jsonError } = require("./utils");

// Very simple token check (demo). For production use JWT.
function requireAuth(req, res, next) {
  const auth = String(req.headers["authorization"] || "");
  if (!auth.startsWith("Bearer ")) return jsonError(res, 401, "Missing token");

  const token = auth.slice("Bearer ".length).trim();
  if (!token) return jsonError(res, 401, "Invalid token");

  // token format: phone:xxxx
  const parts = token.split(":");
  if (parts.length !== 2 || parts[0] !== "phone") return jsonError(res, 401, "Invalid token format");

  req.userPhone = parts[1];
  return next();
}

// Always JSON 404 (so Flutter never receives HTML)
function notFound(req, res) {
  return jsonError(res, 404, `Route not found: ${req.method} ${req.path}`);
}

function errorHandler(err, req, res, next) {
  const msg = err?.message ? String(err.message) : "Server error";
  return jsonError(res, 500, msg);
}

module.exports = { requireAuth, notFound, errorHandler };
