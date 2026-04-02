require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const mediaRoutes = require('./routes/media-routes');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./utils/logger');
const { connectToRabbitMQ, consumeEvent } = require('./utils/rabbitmq');
const { handlePostDeleted } = require('./eventHandlers/media-event-handlers');

const app = express();

const PORT = process.env.PORT || 3003;

mongoose
    .connect(process.env.MONGODB_URI)
    .then(() => logger.info('Connected to mongodb'))
    .catch(e => logger.error('Mongo connection error', e));

app.use(cors());
app.use(helmet());

app.use('/api/media', mediaRoutes);
app.use(errorHandler);

async function startServer() {
    try {
        await connectToRabbitMQ();

        //consume all the event
        await consumeEvent('post.deleted', handlePostDeleted);

        app.listen(PORT, () => {
            logger.info(`Media service is running on port ${PORT}`)
        })
    } catch (error) {
        logger.error('Failed to connect to server', error)
        process.exit(1)
    }
}

startServer();

//unhandled promise rejection
process.on("unhandledRejection", (reason, promise) => {
    logger.error("Unhandled Rejection at", promise, "reason:", reason);
});