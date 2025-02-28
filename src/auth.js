const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const JWT_SECRET = 'sua_chave_secreta_aqui';

const ADMIN_CREDENTIALS = {
    username: 'admin',
    password: '$2b$10$EixZaSA0nX7QJ4lD9TqZOeWz6vF5pL0tO8z8yUZ1jY0vK1m2n3o4p' // Senha: 'senha123'
};

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ message: 'Acesso negado.' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: 'Token inválido.' });
        req.user = user;
        next();
    });
}

module.exports = { authenticateToken };