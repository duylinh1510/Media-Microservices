const logger = require('../utils/logger');
const Post = require('../models/Post');
const mongoose = require('mongoose');
const { validateCreatePost } = require('../utils/validation');
const { publishEvent } = require('../utils/rabbitmq');

// Hàm này có nhiệm vụ xóa toàn bộ cache liên quan đến posts trong Redis.
// Thường được gọi sau khi dữ liệu thay đổi (tạo, xóa), để cache cũ không trả về dữ liệu lỗi thời
async function invalidatePostCache(req, input) {
    // 1. Xóa cache của bài viết cụ thể
    const cachedKey = `post:${input}`; //// vd: "post:abc123"
    await req.redisClient.del(cachedKey);

    // 2. Xóa toàn bộ cache danh sách phân trang
    const keys = await req.redisClient.keys("posts:*"); //// vd: "posts:1:10", "posts:2:5"
    if (keys.length > 0) {
        await req.redisClient.del(keys)
    }
}


const createPost = async (req, res) => {
    logger.info('Create post endpoint hit...')
    try {
        //validate the schema
        const { error } = validateCreatePost(req.body);
        if (error) {
            logger.warn('Validation error', error.details[0].message)
            return res.status(400).json({
                success: false,
                message: error.details[0].message
            });
        }
        const { content, mediaIds } = req.body;
        const newlyCreatedPost = new Post({
            user: req.user.userId,
            content,
            mediaIds: mediaIds || []
        })

        await newlyCreatedPost.save();

        await publishEvent('post.created', {
            postId: newlyCreatedPost._id.toString(),
            userId: newlyCreatedPost.user.toString(),
            content: newlyCreatedPost.content,
            createdAt: newlyCreatedPost.createdAt,
        });

        await invalidatePostCache(req, newlyCreatedPost._id.toString());
        logger.info('Post created successfully')
        res.status(201).json({
            success: true,
            message: 'Post created successfully'
        })
    } catch (error) {
        logger.error('Error creating post', error)
        res.status(500).json({
            success: false,
            message: "Error creating post"
        });
    }
}

const getAllPosts = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const startIndex = (page - 1) * limit; //vị trí bắt đầu lấy dữ liệu trong database

        // Request /?page=2&limit=10
        //         ↓
        // Tính startIndex = 10
        //         ↓
        // Tạo cacheKey = "posts:2:10"
        //         ↓
        // Redis.get("posts:2:10")
        //    ├── Có dữ liệu → trả về ngay 
        //    └── Không có  → query DB → lưu Redis → trả về
        const cacheKey = `posts:${page}:${limit}`;
        const cachedPosts = await req.redisClient.get(cacheKey);

        //nếu có dữ liệu -> trả về ngay
        if (cachedPosts) {
            return res.json(JSON.parse(cachedPosts))
        }

        //nếu chưa có dữ liệu thì vào DB query
        const posts = await Post.find({}) // Lấy tất cả bài viết, không lọc điều kiện nào
            .sort({ createdAt: -1 })      // Sắp xếp theo thời gian tạo mới nhất lên đầu (-1 = descending)
            .skip(startIndex)             // Bỏ qua N bản ghi đầu tiên (phục vụ phân trang)
            .limit(limit);                // Chỉ lấy tối đa N bản ghi

        // Đếm toàn bộ số bài viết trong collection, không phân biệt trang -> Dùng để tính tổng số trang.
        // đây là 1 query riêng gửi tới DB → tốn thêm 1 lần truy vấn.
        const totalNumberOfPosts = await Post.countDocuments();

        const result = {
            posts,
            currentpage: page,
            totalPages: Math.ceil(totalNumberOfPosts / limit), //Math.ceil() -> làm tròn lên để không bỏ sót bài viết
            totalPosts: totalNumberOfPosts
        }

        //save your posts in redis cache, so the next time it will load quickly
        await req.redisClient.setex(cacheKey, 300, JSON.stringify(result));

        res.json(result);
    } catch (error) {
        logger.error('Error fetching posts', error)
        res.status(500).json({
            success: false,
            message: "Error fetching posts"
        });
    }
}

const getPost = async (req, res) => {
    try {
        const postId = req.params.id;
        const cachekey = `post:${postId}`;
        const cachedPost = await req.redisClient.get(cachekey);

        // nếu có post cần tìm trong Redis thì return
        if (cachedPost) {
            return res.json(JSON.parse(cachedPost))
        }

        // nếu không có trong Redis thì query vào DB và tìm
        const singlePostDetailsById = await Post.findById(postId);

        // nếu không có postId thì trả về Post not found
        if (!singlePostDetailsById) {
            return res.status(404).json({
                message: 'Post not found',
                success: false
            })
        }

        // nếu đã tìm thấy trong DB thì lưu vào Redis với thời gian là 1 tiếng
        await req.redisClient.setex(cachekey, 3600, JSON.stringify(singlePostDetailsById));

        // trả về data post đó
        res.json(singlePostDetailsById);
    } catch (error) {
        logger.error('Error fetching post', error)
        res.status(500).json({
            success: false,
            message: "Error fetching post by ID"
        });
    }
}

const deletePost = async (req, res) => {
    try {
        await invalidatePostCache(req, req.params.id);
        console.log('User from token:', req.user);
        console.log('Post ID:', req.params.id);
        console.log('User ID to search:', new mongoose.Types.ObjectId(req.user.userId));

        // Debug: Check what's actually in the database
        const postToCheck = await Post.findById(req.params.id);
        console.log('Post found:', postToCheck);
        console.log('Post user field:', postToCheck?.user);
        console.log('Post user field type:', typeof postToCheck?.user);
        console.log('Are they equal?', postToCheck?.user?.equals(new mongoose.Types.ObjectId(req.user.userId)));

        const post = await Post.findOneAndDelete({
            _id: req.params.id, // id của bài cần xóa
            user: new mongoose.Types.ObjectId(req.user.userId) // userId của bài đó -> chỉ có thể xóa bài của chính mình
        })

        if (!post) {
            return res.status(404).json({
                message: "Post not found",
                success: false
            });
        }

        //publish post delete method
        await publishEvent('post.deleted', {
            postId: post._id.toString(),
            userId: req.user.userId,
            mediaIds: post.mediaIds
        })


        res.json({
            message: "Post deleted successfully!"
        });
    } catch (error) {
        logger.error('Error deleting post', error)
        res.status(500).json({
            success: false,
            message: "Error deleting post"
        });
    }
}

module.exports = { createPost, getAllPosts, getPost, deletePost };