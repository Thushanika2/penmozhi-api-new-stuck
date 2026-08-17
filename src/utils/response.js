function errorResponse(res, code, message, status = 400, extra = {}) {
  return res.status(status).json({ error_code: code, error: message, ...extra });
}

function messageResponse(res, code, message, status = 200, extra = {}) {
  return res.status(status).json({ message_code: code, message, ...extra });
}

function validationErrors(res, items, status = 400) {
  return res.status(status).json({
    errors: items.map(([code, message]) => ({ code, message })),
  });
}

module.exports = { errorResponse, messageResponse, validationErrors };
