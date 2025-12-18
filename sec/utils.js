function jsonError(res, status, message, extra) {
  return res.status(status).json({
    success: false,
    message,
    ...(extra ? { extra } : {})
  });
}

function nowIso() {
  return new Date().toISOString();
}

module.exports = { jsonError, nowIso };
