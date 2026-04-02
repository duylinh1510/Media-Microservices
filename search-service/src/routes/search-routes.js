const express = require('express')
const { searchPostController } = require('../controllers/search-controller');
const { authenticateRequest } = require('../middleware/authMiddleware');
const { searchLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

router.use(authenticateRequest);

router.get('/posts', searchLimiter, searchPostController);


module.exports = router;