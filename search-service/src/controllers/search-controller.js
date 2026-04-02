const Search = require('../models/Search')
const logger = require('../utils/logger')


const searchPostController = async (req, res) => {
    logger.info('Search endpoint hit')
    try {
        const { query } = req.query;
        console.log('Search query:', query);  // Debug

        if (!query) {
            return res.status(400).json({
                success: false,
                message: "Query parameter is required"
            });
        }

        // Debug: Xem có bao nhiêu documents trong Search collection
        const totalCount = await Search.countDocuments();
        console.log('Total documents in Search:', totalCount);

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
        console.log('Search error:', error.message);
        console.log('Full error:', JSON.stringify(error, null, 2));
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