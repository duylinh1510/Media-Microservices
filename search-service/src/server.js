require('dotenv').config();
console.log('Search service starting...');
const express = require('express');
const mongoose = require('mongoose');
const Redis = require('ioredis');
const cors = require('cors');
const helmet = require('helmet');
const { connectToRabbitMQ, consumeEvent } = require('./utils/rabbitmq');
const searchRoutes = require('./routes/search-routes');
const { handlePostCreated, handlePostDeleted } = require('./eventHandlers/search-event-handlers');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3004;


mongoose
    .connect(process.env.MONGODB_URI)
    .then(async () => {
        logger.info('Connected to mongodb');
        // Đảm bảo text index được tạo
        const Search = require('./models/Search');
        await Search.createIndexes();
        logger.info('Search indexes created/verified');
    })
    .catch(e => logger.error('Mongo connection error', e));

const redisClient = new Redis(process.env.REDIS_URL);

//middleware
app.use(helmet())
app.use(cors())
app.use(express.json())

app.use((req, res, next) => {
    console.log('=== INCOMING REQUEST ===');
    console.log('Method:', req.method);
    console.log('URL:', req.url);
    console.log('Path:', req.path);
    console.log('Query:', req.query);
    console.log('Headers:', req.headers);
    logger.info(`Received ${req.method} request to ${req.url}`);
    next();
});


app.use('/api/search', (req, res, next) => {
    console.log('=== ROUTE MATCHED /api/search ===');
    next();
}, searchRoutes);

app.use((err, req, res, next) => {
    console.log('=== ERROR HANDLER ===');
    console.log('Error:', err);
    res.status(500).json({ error: err.message });
});

app.use(errorHandler);

async function startServer() {
    try {
        await connectToRabbitMQ();

        //consume the event / subscribe to the events
        await consumeEvent('post.created', handlePostCreated);
        await consumeEvent('post.deleted', handlePostDeleted);

        app.listen(PORT, () => {
            logger.info(`Search service is running on port ${PORT}`)
        })
    } catch (error) {
        logger.error(error, 'Failed to start search service')
        process.exit(1)
    }
}

startServer();



//unhandled promise rejection
process.on("unhandledRejection", (reason, promise) => {
    logger.error("Unhandled Rejection at", promise, "reason:", reason);
});