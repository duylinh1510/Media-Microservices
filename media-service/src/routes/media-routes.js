const express = require('express');
const multer = require('multer');

const { uploadMedia, getAllMedias } = require('../controllers/media-controller');
const { authenticateRequest } = require('../middleware/authMiddleware');
const logger = require('../utils/logger');
const { uploadMediaLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

//configure multer for file upload
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024
    }
}).single('file')

router.post('/upload', authenticateRequest, uploadMediaLimiter, (req, res, next) => {
    upload(req, res, function (err) {
        // MulterError (vd: file quá lớn)  → 400
        console.log('req.file:', req.file);        // ← thêm dòng này
        console.log('req.body:', req.body);        // ← thêm dòng này
        console.log('Content-Type:', req.headers['content-type']); // ← thêm dòng này
        if (err instanceof multer.MulterError) {
            logger.error('Multer error while uploading:', err)
            return res.status(400).json({
                message: 'Multer error while uploading',
                error: err.message,
                stack: err.stack
            })
        }

        // Lỗi khác (vd: sai file type)    → 400
        if (err) {
            logger.error('Unknown error while uploading:', err)
            return res.status(400).json({
                message: err.message
            })
        }

        // Thành công → next() -> uploadMedia controller -> Upload Cloudinary + lưu MongoDB
        next();
    })
}, uploadMedia);

router.get('/get', authenticateRequest, getAllMedias);


module.exports = router;