const mysql = require('mysql2/promise');

const DB_CONFIG = {
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'lanchonete_db'
};

async function conectarBanco() {
    try {
        const connection = await mysql.createConnection(DB_CONFIG);
        console.log('✅ Conexão com o banco de dados estabelecida.');
        return connection;
    } catch (error) {
        console.error('Erro ao conectar ao banco de dados:', error);
        throw new Error('Falha ao conectar ao banco de dados.');
    }
}

async function obterCardapio() {
    const connection = await conectarBanco();
    try {
        const [rows] = await connection.execute('SELECT * FROM cardapio');
        return rows;
    } catch (error) {
        console.error('Erro ao obter cardápio:', error);
        throw new Error('Não foi possível carregar o cardápio.');
    } finally {
        await connection.end();
    }
}

async function registrarLog(usuario, mensagem) {
    const connection = await conectarBanco();
    try {
        await connection.execute(
            'INSERT INTO logs (usuario, mensagem, data_hora) VALUES (?, ?, NOW())',
            [usuario, mensagem]
        );
    } catch (error) {
        console.error('Erro ao registrar log:', error);
    } finally {
        await connection.end();
    }
}

module.exports = { obterCardapio, registrarLog };