const express = require('express');
const jwt = require('jsonwebtoken');
const app = express();
app.use(express.json());
app.set('view engine', 'ejs');

const { authenticateToken } = require('./auth');

app.get('/dashboard/pedidos', authenticateToken, async (req, res) => {
    res.render('pedidos', { pedidos: [] });
});

app.get('/dashboard/logs', authenticateToken, async (req, res) => {
    res.render('logs', { logs: [] });
});

app.listen(3000, () => {
    console.log('🌐 Dashboard rodando em http://localhost:3000');
});