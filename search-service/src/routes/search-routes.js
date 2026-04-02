const express = require('express')
const { searchPostController } = require('../controllers/search-controller');
const { authenticateRequest } = require('../middleware/authMiddleware');
const { searchLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

router.use((req, res, next) => {
    console.log('=== SEARCH ROUTE MIDDLEWARE ===');
    console.log('URL:', req.url);
    console.log('Auth header:', req.headers.authorization);
    next();
});

router.use(authenticateRequest);

router.get('/posts', (req, res, next) => {
    console.log('=== GET /posts HIT ===');
    next();
}, searchLimiter, searchPostController);


module.exports = router;