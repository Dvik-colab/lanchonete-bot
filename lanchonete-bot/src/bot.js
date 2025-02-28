const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const mysql = require('mysql2/promise');
const stringSimilarity = require('string-similarity');

// Importar funções de banco de dados
const { obterCardapio, registrarLog } = require('./db');

// ================= CONFIGURAÇÕES =================
const CONFIG = {
    SIMILARITY_THRESHOLD: 0.7,
    MAX_SUGGESTIONS: 3,
    TIMEOUT_PEDIDO: 3600000, // 1 hora
    GOOGLE_MAPS_API_KEY: 'SUA_API_KEY_AQUI',
    RESTAURANTE_ENDERECO: 'Rua Exemplo, 123, Cidade, Estado'
};

// ================= WHATSAPP CLIENT =================
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', qr => qrcode.generate(qr, { small: true }));
client.on('ready', async () => {
    console.log('🤖 Bot pronto!');
    await registrarLog('BOT', 'Bot iniciado.');
});

client.on('message', async msg => {
    if (msg.fromMe) return;
    const usuario = msg.from;
    const texto = normalizarTexto(msg.body);

    try {
        await registrarLog(usuario, texto);

        if (texto.match(/cardapio|menu/)) {
            const cardapio = await obterCardapio();
            const menuFormatado = cardapio.map(c => 
                `*${c.categoria}*\n${cardapio.filter(i => i.categoria === c.categoria).map(i => `- ${i.nome} (R$ ${i.preco.toFixed(2)})`).join('\n')}`
            ).join('\n\n');
            return msg.reply(menuFormatado);
        }

        if (texto.match(/ajuda/)) {
            return msg.reply("Ajuda disponível!");
        }

        if (texto.match(/confirmar/)) {
            return msg.reply("Pedido confirmado!");
        }

        if (texto.match(/cancelar/)) {
            return msg.reply("Pedido cancelado.");
        }

        const cardapio = await obterCardapio();
        const itens = await processarPedido(cardapio, texto);

        if (itens.length === 0) {
            return msg.reply("Não entendi seu pedido.");
        }

        const total = itens.reduce((sum, item) => sum + (item.preco * item.quantidade), 0);
        return msg.reply(` Pedido registrado! Total: R$ ${total.toFixed(2)}`);
    } catch (error) {
        console.error('Erro:', error);
        return msg.reply("Erro ao processar pedido.");
    }
});

client.initialize();

function normalizarTexto(texto) {
    return texto
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

async function processarPedido(cardapio, texto) {
    const regexQuantidade = /(\d+)\s*(?:unidade|unidades|x)?\s*([a-z\s]+)/gi;
    const itens = [];
    let match;

    while ((match = regexQuantidade.exec(texto)) !== null) {
        const quantidade = parseInt(match[1]);
        const termoItem = match[2].trim();
        const item = encontrarItem(cardapio, termoItem);

        if (item) {
            itens.push({ ...item, quantidade });
        }
    }

    return itens;
}

function encontrarItem(cardapio, texto) {
    const textoNormalizado = normalizarTexto(texto);
    let melhorMatch = { score: 0, item: null };
    for (const item of cardapio) {
        const termos = [item.nome, ...(item.synonyms ? item.synonyms.split(',') : [])];
        
        for (const termo of termos) {
            const termoNormalizado = normalizarTexto(termo);
            const score = stringSimilarity.compareTwoStrings(textoNormalizado, termoNormalizado);
            
            if (score > melhorMatch.score && score >= CONFIG.SIMILARITY_THRESHOLD) {
                melhorMatch = {
                    score,
                    item: item
                };
            }
        }
    }
    return melhorMatch.item;
}