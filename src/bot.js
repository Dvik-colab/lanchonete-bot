const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const mysql = require('mysql2/promise');
const stringSimilarity = require('string-similarity');
const { obterCardapio, registrarLog, registrarPedido } = require('./db');

// ================= CONFIGURAÇÕES =================
const CONFIG = {
    SIMILARITY_THRESHOLD: 0.7,
    MAX_SUGGESTIONS: 3,
    TIMEOUT_PEDIDO: 3600000, // 1 hora
    RESTAURANTE_ENDERECO: 'Rua Exemplo, 123, Cidade, Estado',
    LATITUDE: -23.55052,
    LONGITUDE: -46.633308,
    OSRM_API_URL: 'https://router.project-osrm.org/route/v1/driving/'
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
    if (msg.from.includes('@g.us')) {
        return msg.reply("❌ Desculpe, não atendemos pedidos em grupos. Por favor, envie sua mensagem diretamente.");
    }

    const usuario = msg.from;
    const texto = normalizarTexto(msg.body);

    try {
        await registrarLog(usuario, texto);

        if (texto.match(/cardapio|menu/)) {
            const cardapio = await obterCardapio();
            const menuFormatado = formatarCardapio(cardapio);
            return msg.reply(menuFormatado);
        }

        if (texto.match(/ajuda/)) {
            return msg.reply(gerarRespostaAjuda());
        }

        if (texto.match(/localizacao|onde/)) {
            return msg.reply(gerarRespostaLocalizacao());
        }

        if (texto.match(/confirmar/)) {
            return msg.reply("✅ Pedido confirmado! Estamos preparando seu lanche.");
        }

        if (texto.match(/cancelar/)) {
            return msg.reply("❌ Pedido cancelado. Se precisar, estou à disposição!");
        }

        if (texto.match(/entrega/)) {
            return msg.reply("🚚 Por favor, envie seu endereço completo para calcular a distância e o tempo estimado de entrega.");
        }

        // Verifica se é um endereço
        if (texto.includes(',')) {
            const distanciaTempo = await calcularDistanciaTempo(texto);
            if (distanciaTempo) {
                return msg.reply(`📍 Distância: ${distanciaTempo.distancia} km\n⏳ Tempo estimado: ${distanciaTempo.tempo} min`);
            } else {
                return msg.reply("❌ Não foi possível calcular a distância. Verifique o endereço e tente novamente.");
            }
        }

        // Processa pedido
        const cardapio = await obterCardapio();
        const itens = await processarPedido(cardapio, texto);

        if (itens.length === 0) {
            return msg.reply("🤔 Não entendi seu pedido. Tente novamente ou digite 'ajuda' para ver os comandos disponíveis.");
        }

        const total = itens.reduce((sum, item) => sum + (item.preco * item.quantidade), 0);
        await registrarPedido(usuario, itens);

        return msg.reply(gerarRespostaPedido(itens, total));
    } catch (error) {
        console.error('Erro:', error);
        return msg.reply("❌ Ops! Algo deu errado. Tente novamente ou entre em contato conosco.");
    }
});

client.initialize();

// ================= FUNÇÕES AUXILIARES =================

function normalizarTexto(texto) {
    return texto
        .normalize('NFD').replace(/[̀-\u036f]/g, '')
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

async function calcularDistanciaTempo(enderecoDestino) {
    try {
        const url = `${CONFIG.OSRM_API_URL}${CONFIG.LONGITUDE},${CONFIG.LATITUDE};${encodeURIComponent(enderecoDestino)}?overview=false`;
        const resposta = await axios.get(url);
        const dados = resposta.data.routes[0];
        return {
            distancia: (dados.distance / 1000).toFixed(2),
            tempo: Math.ceil(dados.duration / 60)
        };
    } catch (error) {
        console.error("Erro ao calcular rota:", error);
        return null;
    }
}

function formatarCardapio(cardapio) {
    return cardapio.map(c => 
        `*${c.categoria}*\n${cardapio.filter(i => i.categoria === c.categoria).map(i => `- ${i.nome} (R$ ${i.preco.toFixed(2)})`).join('\n')}`
    ).join('\n\n');
}

function gerarRespostaAjuda() {
    return "💬 Comandos disponíveis:\n\n📜 *Cardápio* - Veja o menu\n📍 *Localização* - Mostra onde estamos\n✅ *Confirmar* - Confirma pedido\n❌ *Cancelar* - Cancela pedido\n🚚 *Entrega* - Informe o endereço para cálculo de distância e tempo";
}

function gerarRespostaLocalizacao() {
    return `📍 Nossa localização:\nhttps://www.openstreetmap.org/?mlat=${CONFIG.LATITUDE}&mlon=${CONFIG.LONGITUDE}#map=17/${CONFIG.LATITUDE}/${CONFIG.LONGITUDE}`;
}

function gerarRespostaPedido(itens, total) {
    const itensFormatados = itens.map(i => `${i.quantidade}x ${i.nome}`).join(', ');
    return `🛒 Pedido registrado!\n📦 Itens: ${itensFormatados}\n💰 Total: R$ ${total.toFixed(2)}`;
}
