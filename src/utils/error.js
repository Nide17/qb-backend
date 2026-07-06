/**
 * Normalize different error types into a consistent structure.
 */
function normalizeError(err) {
    if (err instanceof Error) return err;
    if (typeof err === "object") {
        const normalized = new Error(err.name || err.message || "Unknown error");
        normalized.status = err.status || 500;
        normalized.message = err.message;
        if (err.code) normalized.code = err.code;
        normalized.name = err.name || "Undefined error";
        if (err.email) normalized.email = err.email;
        return normalized;
    }
    const normalized = new Error(String(err));
    normalized.status = 500;
    return normalized;
}

const handleError = (res, err, statusOverride) => {

    const timestamp = new Date().toISOString();

    // Normalize errors thrown as raw objects
    const normalized = normalizeError(err);

    // Override status if provided
    const status = statusOverride || normalized.status || 500;

    // MongoDB Network Error
    if (normalized.name === "MongoNetworkError") {
        return res.status(503).json({
            success: false,
            message: "Database temporarily unreachable. Try again later.",
            code: "DB_CONNECTION_ERROR",
            timestamp
        });
    }

    // Invalid ObjectId / CastError
    if (normalized.name === "CastError") {
        const path = normalized.path || "unknown_field";

        return res.status(400).json({
            success: false,
            message: `Invalid value for field: ${path}`,
            code: "CAST_ERROR",
            timestamp
        });
    }

    // Validation Errors
    if (normalized.name === "ValidationError") {
        const errors = Object.values(normalized.errors || {}).map(e => ({
            field: e.path,
            message: e.message,
            value: e.value
        }));

        return res.status(400).json({
            success: false,
            message: "Validation failed",
            code: "VALIDATION_ERROR",
            errors,
            timestamp
        });
    }

    // Duplicate Key Error
    if (normalized.code === 11000) {
        const field = Object.keys(normalized.keyPattern || {})[0];

        return res.status(409).json({
            success: false,
            message: `${field} already exists`,
            code: "DUPLICATE_KEY",
            timestamp
        });
    }

    // JWT Errors
    if (normalized.name === "NoTokenLoadUserError") {
        return res.status(401).json({
            success: false,
            message: "No authentication token provided",
            code: "NO_TOKEN_LOAD_USER_ERROR",
            timestamp
        });
    }

    if (normalized.name === "JsonWebTokenError") {
        return res.status(401).json({
            success: false,
            message: "Invalid token",
            code: "INVALID_TOKEN",
            timestamp
        });
    }

    if (normalized.name === "TokenExpiredError") {
        return res.status(401).json({
            success: false,
            message: "Login expired. Please authenticate again.",
            code: "TOKEN_EXPIRED",
            timestamp
        });
    }

    // NOT_VERIFIED account error
    if (normalized.code === "NOT_VERIFIED") {
        return res.status(401).json({
            success: false,
            name: normalized.name || "Account not verified",
            message: normalized.message,
            code: "NOT_VERIFIED",
            email: normalized.email,
            timestamp
        });
    }

    // Axios Errors
    if (normalized.isAxiosError) {
        return handleAxiosError(res, normalized, timestamp);
    }

    // 404
    if (normalized.status === 404 || normalized.code === "ENOTFOUND") {
        return res.status(404).json({
            success: false,
            message: normalized.message || "Resource not found",
            code: "NOT_FOUND",
            timestamp
        });
    }

    // Custom BAD_REQUEST
    if (normalized.code === "BAD_REQUEST") {
        return res.status(400).json({
            success: false,
            message: normalized.message || "Bad request",
            code: "BAD_REQUEST",
            timestamp
        });
    }

    // ReferenceError
    if (normalized.name === "ReferenceError") {
        return res.status(400).json({
            success: false,
            message: normalized.message || "Reference error occurred",
            code: "REFERENCE_ERROR",
            timestamp
        });
    }

    // Default Fallback
    let defaultError;
    if (normalized.name) defaultError = { name: normalized.name };
    if (normalized.code) defaultError.code = normalized.code;
    if (normalized.message) defaultError.message = normalized.message;
    if (normalized.timestamp) defaultError.timestamp = normalized.timestamp;
    if (normalized.email) defaultError.email = normalized.email;
    if (normalized.errors) defaultError.errors = normalized.errors;
    return res.status(status).json(defaultError);
};

/**
 * Handle axios-specific errors
 */
function handleAxiosError(res, err, timestamp) {
    if (err.code === "ECONNREFUSED") {
        return res.status(503).json({
            success: false,
            message: err.message || "Dependency service unavailable",
            code: "SERVICE_UNAVAILABLE",
            timestamp
        });
    }

    if (err.code === "ECONNABORTED") {
        return res.status(503).json({
            success: false,
            message: err.message || "Request timed out. Refresh and try again.",
            code: "REQUEST_TIMEOUT",
            timestamp
        });
    }

    if (err.response?.data?.errors) {
        const list = err.response.data.errors.map(e => e.message);
        return res.status(err.response.status).json({
            success: false,
            message: `${list.length} errors occurred`,
            errors: list,
            code: `HTTP_${err.response.status}`,
            timestamp
        });
    }

    if (err.response) {
        return res.status(err.response.status).json({
            success: false,
            message: err.response.data?.message || err.message,
            code: `HTTP_${err.response.status}`,
            timestamp
        });
    }

    return res.status(500).json({
        success: false,
        message: "Unexpected network error",
        code: "NETWORK_ERROR",
        timestamp
    });
}

module.exports = { handleError };
