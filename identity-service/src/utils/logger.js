const winston = require('winston');

const logger = winston.createLogger({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    //format log
    format: winston.format.combine(
        winston.format.timestamp(), //Thêm timestamp
        winston.format.errors({ stack: true }), // Ghi cả stack trace của error
        winston.format.splat(), // Hỗ trợ string interpolation
        winston.format.json() // Format JSON
    ),
    defaultMeta: { service: 'identity-service' },
    //Nơi ghi log
    transports: [
        // Console (Terminal) - ghi log dạng màu sắc, dễ đọc
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(), // màu sắc
                winston.format.simple() // format đơn giản
            ),
        }),
        //File error.log - ghi CHỈ log error
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        // File combined.log - ghi TẤT CẢ log
        new winston.transports.File({ filename: 'combined.log' })
    ],
});

module.exports = logger;