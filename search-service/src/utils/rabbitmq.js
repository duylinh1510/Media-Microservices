const amqp = require('amqplib');
const logger = require('./logger');

let connection = null;
let channel = null;

const EXCHANGE_NAME = 'facebook_events'

async function connectToRabbitMQ() {
    try {
        connection = await amqp.connect(process.env.RABBITMQ_URL);
        channel = await connection.createChannel();

        await channel.assertExchange(EXCHANGE_NAME, 'topic', { durable: false })
        logger.info('Connected to RabbitMQ')
        return channel;
    } catch (error) {
        logger.error('Error connecting to RabbitMQ', error);
    }
}

// async function publishEvent(routingKey, message) {
//     if (!channel) {
//         await connectToRabbitMQ()
//     }

//     channel.publish(EXCHANGE_NAME, routingKey, Buffer.from(JSON.stringify(message)))
//     logger.info(`Event published: ${routingKey}`);
// }

//nhận vào routingKey, và 1 callback(hành động sau khi consumeEvent )
async function consumeEvent(routingKey, callback) {
    if (!channel) {
        await connectToRabbitMQ();
    }

    const q = await channel.assertQueue("", { exclusive: true });

    //hành động nối ống, chỉ bỏ những bức thư có nhãn routingKey vào hòm thư EXCHANGE_NAME
    await channel.bindQueue(q.queue, EXCHANGE_NAME, routingKey);
    channel.consume(q.queue, (msg) => {
        if (msg !== null) {
            // nhận thư và biến Buffer(mã nhị phân) thành chữ, từ chữ dịch lại thành Object ban đầu
            const content = JSON.parse(msg.content.toString());
            //đưa dữ liệu content cho hàm callback
            callback(content)
            //ký nhận rằng "bức thư" đã được gửi
            channel.ack(msg)
        }
    })

    logger.info(`Subscribed to event: ${routingKey}`);
}

module.exports = { connectToRabbitMQ, consumeEvent };