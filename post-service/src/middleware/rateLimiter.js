const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const Redis = require('ioredis');

const redis = new Redis(process.env.REDIS_URL);

const createPostLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    store: new RedisStore({
        sendCommand: (...args) => redis.call(...args)
    }),
    keyGenerator: (req) => req.ip,
    handler: (req, res) => {
        res.status(429).json({
            success: false,
            message: "Too many posts created. Please try again later"
        });
    }
});


const deletePostLimiter = rateLimit({
    windowMs: 15 * 60 * 100,
    max: 10,
    store: new RedisStore({
        sendCommand: (...args) => redis.call(...args)
    }),
    keyGenerator: (req) => req.ip,
    handler: (req, res) => {
        res.status(429).json({
            success: false,
            message: "Too many delete requests. Please try again later."
        });
    }
});

const getAllPostsLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 30,
    store: new RedisStore({
        sendCommand: (...args) => redis.call(...args)
    }),
    keyGenerator: (req) => req.ip,
    handler: (req, res) => {
        res.status(429).json({
            success: false,
            message: 'Too many requests. Please slow down.'
        });
    }
});