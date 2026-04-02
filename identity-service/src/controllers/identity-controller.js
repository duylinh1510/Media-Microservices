//user registration

const logger = require('../utils/logger');
const User = require('../models/User');
const { validateRegistration, validateLogin } = require('../utils/validation')
const generateTokens = require('../utils/generateToken');
const RefreshToken = require('../models/RefreshToken');

const registerUser = async (req, res) => {
    logger.info('Registration endpoint hit...')
    try {

        //validate the schema
        const { error } = validateRegistration(req.body);
        if (error) {
            logger.warn('Validation error', error.details[0].message)
            return res.status(400).json({
                success: false,
                message: error.details[0].message
            });
        }
        const { email, password, username } = req.body;

        let user = await User.findOne({ $or: [{ email }, { username }] });
        if (user) {
            logger.warn('User already exists');
            return res.status(400).json({
                success: false,
                message: 'User already exists'
            });
        }

        user = new User({ username, email, password })
        await user.save()
        logger.info("User saved successfully", { userId: user._id });

        const { accessToken, refreshToken } = await generateTokens(user)

        res.status(201).json({
            success: true,
            message: 'User registered successfully!',
            accessToken,
            refreshToken
        })
    } catch (error) {
        logger.error('Registration error occured', error)
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        })
    }
};

//user login
const loginUser = async (req, res) => {
    logger.info("Login endpoint hit...");
    try {
        const { error } = validateLogin(req.body);
        if (error) {
            logger.warn('Validation error', error.details[0].message)
            return res.status(400).json({
                success: false,
                message: error.details[0].message
            });
        }
        const { email, password } = req.body;
        const user = await User.findOne({ email })

        if (!user) {
            logger.warn('Invalid user')
            return res.status(400).json({
                success: false,
                message: "Invalid credentials"
            })
        }

        //check valid password
        const isValidPassword = await user.comparePassword(password);

        if (!isValidPassword) {
            logger.warn('Invalid password')
            return res.status(400).json({
                success: false,
                message: "Invalid password"
            })
        }

        const { accessToken, refreshToken } = await generateTokens(user)
        res.json({
            accessToken,
            refreshToken,
            userId: user._id
        })
    } catch (error) {
        logger.error('Login error occured', error)
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

//refresh token
//Client gửi refreshToken  →  Kiểm tra hợp lệ  →  Cấp token mới  →  Xóa token cũ
const refreshTokenUser = async (req, res) => {
    logger.info("Refresh token endpoint hit...")
    try {
        //Client gửi lên refreshToken trong body. Nếu không có → trả về 400
        const { refreshToken } = req.body;
        if (!refreshToken) {
            logger.warn('Refresh token missing')
            return res.status(400).json({
                success: false,
                message: "Refresh token missing"
            })
        }

        //Kiểm tra token trong database
        const storedToken = await RefreshToken.findOne({ token: refreshToken })

        //Nếu không tìm thấy token -> token giả hoặc bị xóa
        //hoặc là token đã hết hạn thì trả về 401
        if (!storedToken || storedToken.expiresAt < new Date()) {
            logger.warn('Invalid or expired refresh token')
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired refresh token '
            })
        }

        //Dùng user ID lưu trong token để tìm user. Nếu không có → trả 401.
        const user = await User.findById(storedToken.user)

        if (!user) {
            logger.warn('User not found')
            return res.status(401).json({
                success: false,
                message: 'User not found'
            })
        }

        //Tạo ra cặp token hoàn toàn mới gồm accessToken + refreshToken.
        const { accessToken: newAccessToken, refreshToken: newRefreshToken } = await generateTokens(user);

        //Xóa token cũ & trả về token mới
        await RefreshToken.deleteOne({ _id: storedToken._id })
        logger.info(`Refresh token successful for user: ${user._id}`)
        res.json({
            success: true,
            accessToken: newAccessToken,
            refreshToken: newRefreshToken
        })

    } catch (error) {
        logger.error('Refresh token error occured', error)
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
}

//logout
const logoutUser = async (req, res) => {
    logger.info('Logout endpoint hit...');
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            logger.warn('Refresh token missing')
            return res.status(400).json({
                success: false,
                message: "Refresh token missing"
            })
        }

        await RefreshToken.deleteOne({ token: refreshToken })
        logger.info('Refresh Token deleted for logout')

        res.json({
            success: true,
            message: 'Logged out successfully!'
        })

    } catch (error) {
        logger.error('Error while logging out', error)
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
}


module.exports = { registerUser, loginUser, refreshTokenUser, logoutUser };