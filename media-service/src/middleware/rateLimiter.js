const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const Redis = require('ioredis');

const redis = new Redis(process.env.REDIS_URL);

const uploadMediaLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    store: new RedisStore({
        sendCommand: (...args) => redis.call(...args)
    }),
    keyGenerator: (req) => req.ip,
    handler: (req, res) => {
        res.status(429).json({
            success: false,
            message: "Too many media uploads. Please try again later"
        });
    }
});

module.exports = { uploadMediaLimiter };
