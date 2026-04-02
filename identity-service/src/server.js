require('dotenv').config();
const mongoose = require('mongoose');
const logger = require('./utils/logger');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { RateLimiterRedis } = require('rate-limiter-flexible');
const Redis = require('ioredis');
const { rateLimit } = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const routes = require('./routes/identity-service');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3001;


mongoose
    .connect(process.env.MONGODB_URI)
    .then(() => logger.info('Connected to mongodb'))
    .catch(e => logger.error('Mongo connection error', e));

const redisClient = new Redis(process.env.REDIS_URL)

//middleware
app.use(helmet())
app.use(cors())
app.use(express.json())

app.use((req, res, next) => {
    logger.info(`Received ${req.method} request to ${req.url}`);
    logger.info(`Request body, ${req.body}`);
    next();
});

//DDos protection and rate limiting
const rateLimiter = new RateLimiterRedis({
    storeClient: redisClient, //Dùng Redis làm backend để lưu số request từ mỗi IP
    keyPrefix: 'middleware', //Key trong Redis sẽ bắt đầu bằng middleware_
    points: 10, //Mỗi IP được 10 "điểm" (request)
    duration: 1 //Các điểm này reset lại sau 1 giây
})

app.use((req, res, next) => {
    rateLimiter.consume(req.ip) // Trừ 1 điểm từ IP này
        .then(() => next())     // Nếu còn điểm -> cho qua
        .catch(() => {          // Nếu hết điểm -> chặn
            logger.warn(`Rate limit exceeded for ip ${req.ip}`)
            res.status(429).json({
                success: false,
                message: "Too many requests"
            });
        });
});

// IP based rate limiting for sensitive endpoints
// Chống brute force password guessing
// Bảo vệ endpoints quan trọng (login, register, reset password)
// Ghi log attempt attack
// Lưu limit trong Redis (chia sẻ giữa các server)
const sensitiveEndpointsLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,   // Cửa sổ thời gian: 15 phút
    max: 50,                    // Cho phép tối đa 50 request
    standardHeaders: true,      // Gửi thông tin limit trong header
    legacyHeaders: false,       // Tắt header cũ
    handler: (req, res) => {    // Xử lý khi quá giới hạn
        logger.warn(`Sensitive endpoint rate limit exceeded for IP: ${req.ip}`);
        res.status(429).json({ success: false, message: "Too many requests" });
    },
    store: new RedisStore({  // Lưu trữ trong Redis
        sendCommand: (...args) => redisClient.call(...args),
    }),
});

app.use('/api/auth/register', sensitiveEndpointsLimiter)

// Routes
app.use('/api/auth', routes)

//error handler
app.use(errorHandler)


app.listen(PORT, () => {
    logger.info(`Identity service running on port ${PORT}`)
});

//unhandled promise rejection
//  Bắt lỗi bất ngờ từ Promise
//  Ghi log lỗi để debug
//  Ngăn ứng dụng crash im lặng
//  Cảnh báo lỗi trong production
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at', promise, "reason:", reason);
});