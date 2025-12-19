// sec/middleware.js
const { jsonError } = require("./utils");

function normalizePhone(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  if (raw.length > 20) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return "";
  return digits;
}

// Demo token check (phone:<digits>)
// NOTE: بعد میں آپ JWT پر جائیں تو یہی file replace ہوگی، باقی routes نہیں بدلیں گی۔
function requireAuth(req, res, next) {
  try {
    const auth = String(req.headers["authorization"] || "");
    if (!auth.toLowerCase().startsWith("bearer ")) {
      return jsonError(res, 401, "Missing token");
    }

    const token = auth.slice(7).trim(); // after "Bearer "
    if (!token) return jsonError(res, 401, "Invalid token");

    const idx = token.indexOf(":");
    if (idx === -1) return jsonError(res, 401, "Invalid token format");

    const prefix = token.substring(0, idx);
    const value = token.substring(idx + 1);

    if (prefix !== "phone") return jsonError(res, 401, "Invalid token format");

    const phone = normalizePhone(value);
    if (!phone) return jsonError(res, 401, "Invalid token phone");

    req.userPhone = phone;
    return next();
  } catch (e) {
    return jsonError(res, 401, "Unauthorized");
  }
}

// Always JSON 404 (Flutter Web must not receive HTML)
function notFound(req, res) {
  return jsonError(res, 404, `Route not found: ${req.method} ${req.path}`);
}

function errorHandler(err, req, res, next) {
  const msg = err?.message ? String(err.message) : "Server error";
  // اگر headers already sent ہوں تو express handle کرے
  if (res.headersSent) return next(err);
  return jsonError(res, 500, msg);
}

module.exports = { requireAuth, notFound, errorHandler };
