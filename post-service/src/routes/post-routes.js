const express = require('express');
const { createPost, getAllPosts, getPost, deletePost } = require('../controllers/post-controller');
const { authenticateRequest } = require('../middleware/authMiddleware')
const { createPostLimiter, deletePostLimiter, getAllPostsLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

//middleware -> this will tell if the user is an auth user or not
router.use(authenticateRequest)

router.post('/create-post', createPostLimiter, createPost);
router.get('/all-posts', getAllPostsLimiter, getAllPosts);
router.get('/:id', getPost);
router.delete('/:id', deletePostLimiter, deletePost);
module.exports = router; 