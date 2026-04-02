require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Redis = require('ioredis');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const logger = require('./utils/logger');
const proxy = require('express-http-proxy');
const errorHandler = require("./middleware/errorhandler");
const validateToken = require('./middleware/authMiddleware');

const app = express();
const PORT = process.env.PORT || 3001;

const redisClient = new Redis(process.env.REDIS_URL);

app.use(helmet())
app.use(cors())
app.use(express.json())


// ==============================
// Helper tạo RedisStore
// ==============================
const createRedisStore = (prefix) => new RedisStore({
    sendCommand: (...args) => redisClient.call(...args),
    prefix,  // phân biệt key giữa các limiter trong Redis
});

// ==============================
// Global rate limit — tất cả endpoint
// ==============================
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        logger.warn(`Global rate limit exceeded for IP: ${req.ip}`);
        res.status(429).json({
            success: false,
            message: "Too many requests"
        });
    },
    store: createRedisStore('global:')
});

// ==============================
// Sensitive rate limit — Post endpoints
// ==============================
const createPostLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,                    // tối đa 10 bài/15 phút
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        logger.warn(`Create post rate limit exceeded for IP: ${req.ip}`);
        res.status(429).json({ success: false, message: "Too many posts created. Please try again later." });
    },
    store: createRedisStore('create_post:'),
});

const deletePostLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,                    // tối đa 10 lần xóa/15 phút
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        logger.warn(`Delete post rate limit exceeded for IP: ${req.ip}`);
        res.status(429).json({ success: false, message: "Too many delete requests. Please try again later." });
    },
    store: createRedisStore('delete_post:'),
});

const getAllPostsLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 30,                    // tối đa 30 lần/phút
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        logger.warn(`Get all posts rate limit exceeded for IP: ${req.ip}`);
        res.status(429).json({ success: false, message: "Too many requests. Please slow down." });
    },
    store: createRedisStore('get_all_posts:'),
});


app.use(globalLimiter);

app.use((req, res, next) => {
    logger.info(`Received ${req.method} request to ${req.url}`);
    logger.info(`Request body, ${req.body}`);
    next();
});

//Client gọi: /v1/auth/register → Backend nhận: /api/auth/register
const proxyOptions = {
    proxyReqPathResolver: (req) => {
        return req.originalUrl.replace(/^\/v1/, '/api')
    },
    proxyErrorHandler: (err, res, next) => {
        logger.error(`Proxy error: ${err.message}`);
        res.status(500).json({
            message: `Internal server error`, error: err.message
        })
    }
}

//setting up proxy for indentity service
// 1. Nhận request từ client
// 2. Thêm header Content-Type: application/json
// 3. Forward request tới IDENTITY_SERVICE_URL/login || IDENTITY_SERVICE_URL/register
// 4. Nhận response về, log status code
// 5. Trả response về cho client
app.use('/v1/auth', proxy(process.env.IDENTITY_SERVICE_URL, {
    ...proxyOptions,
    proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
        //Đảm bảo mọi request gửi tới Identity Service đều có header Content-Type: application/json.
        proxyReqOpts.headers["Content-Type"] = "application/json"
        return proxyReqOpts;
    },
    //Xử lý response trả về từ Identity Service
    userResDecorator: (proxyRes, proxyResData, userReq, userRes) => {
        logger.info(`Response from Identity service: ${proxyRes.statusCode} | ${userReq.method} ${userReq.path}`)
        return proxyResData
    }
}
));


// Post routes — áp dụng rate limit riêng theo method
app.post('/v1/posts/create-post', validateToken, createPostLimiter, proxy(process.env.POST_SERVICE_URL, {
    ...proxyOptions,
    proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
        proxyReqOpts.headers['Content-Type'] = 'application/json';
        proxyReqOpts.headers['x-user-id'] = srcReq.user.userId;
        return proxyReqOpts;
    }
}));

app.delete('/v1/posts/:id', validateToken, deletePostLimiter, proxy(process.env.POST_SERVICE_URL, {
    ...proxyOptions,
    proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
        proxyReqOpts.headers['Content-Type'] = 'application/json';
        proxyReqOpts.headers['x-user-id'] = srcReq.user.userId;
        return proxyReqOpts;
    }
}));

app.get('/v1/posts', validateToken, getAllPostsLimiter, proxy(process.env.POST_SERVICE_URL, {
    ...proxyOptions,
    proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
        proxyReqOpts.headers['Content-Type'] = 'application/json';
        proxyReqOpts.headers['x-user-id'] = srcReq.user.userId;
        return proxyReqOpts;
    }
}));

app.get('/v1/posts/:id', validateToken, proxy(process.env.POST_SERVICE_URL, {
    ...proxyOptions,
    proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
        proxyReqOpts.headers['Content-Type'] = 'application/json';
        proxyReqOpts.headers['x-user-id'] = srcReq.user.userId;
        return proxyReqOpts;
    }
}));


//setting up proxy for media services
app.use('/v1/media', validateToken, proxy(process.env.MEDIA_SERVICE_URL, {
    ...proxyOptions,
    proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
        proxyReqOpts.headers['x-user-id'] = srcReq.user.userId;
        const contentType = srcReq.headers['content-type'] || '';
        if (!contentType.startsWith('multipart/form-data')) {
            proxyReqOpts.headers['Content-Type'] = 'application/json';
        }

        return proxyReqOpts;
    }
}))

//setting up proxy for search services
app.get('/v1/search/posts', validateToken, (req, res, next) => {
    console.log('=== API GATEWAY SEARCH ROUTE HIT ===');
    console.log('SEARCH_SERVICE_URL:', process.env.SEARCH_SERVICE_URL);
    console.log('Original URL:', req.originalUrl);
    console.log('Path:', req.path);
    next();
},
    proxy(process.env.SEARCH_SERVICE_URL, {
        ...proxyOptions,
        proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
            proxyReqOpts.headers['Content-Type'] = 'application/json';
            proxyReqOpts.headers['x-user-id'] = srcReq.user.userId;
            return proxyReqOpts;
        },
        userResDecorator: (proxyRes, proxyResData, userReq, userRes) => {
            logger.info(
                `Response received from Search service: ${proxyRes.statusCode}`
            );

            return proxyResData;
        }
    }));

app.use(errorHandler);

app.listen(PORT, () => {
    logger.info(`API Gateway is running on port ${PORT}`);
    logger.info(`Identity service is running on port ${process.env.IDENTITY_SERVICE_URL}`);
    logger.info(`Post service is now running on ${process.env.POST_SERVICE_URL}`);
    logger.info(`Media service is now running on ${process.env.MEDIA_SERVICE_URL}`);
    logger.info(`Search service is now running on ${process.env.SEARCH_SERVICE_URL}`);
    logger.info(`Redis URL ${process.env.REDIS_URL}`)
})