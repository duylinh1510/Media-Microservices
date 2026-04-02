const Search = require('../models/Search')
const logger = require('../utils/logger')


const searchPostController = async (req, res) => {
    logger.info('Search endpoint hit')
    try {
        const { query } = req.query;

        if (!query) {
            return res.status(400).json({
                success: false,
                message: "Query parameter is required"
            });
        }

        const results = await Search.find(
            {
                $text: { $search: query }
            },
            {
                score: { $meta: 'textScore' }
            }
        ).sort({ score: { $meta: 'textScore' } }).limit(10);

        res.json(results);
    } catch (error) {
        logger.error('Error while searching post', error)
        res.status(500).json({
            success: false,
            message: "Error while searching post",
            error: error.message,
            code: error.code,
            codeName: error.codeName
        });
    }
}

module.exports = { searchPostController };