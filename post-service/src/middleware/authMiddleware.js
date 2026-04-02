const logger = require('../utils/logger');

// API Gateway → verify JWT, extract userId, truyền qua header x-user-id
// Post Service → chỉ đọc x-user-id từ header, không cần verify JWT lại
const authenticateRequest = (req, res, next) => {
    const userId = req.headers['x-user-id'];

    if (!userId) {
        logger.warn(`Access attempted without user ID`)
        return res.status(401).json({
            success: false,
            message: 'Authentication required! Please login to continue!'
        })
    }

    req.user = { userId }
    next()
}

module.exports = { authenticateRequest };