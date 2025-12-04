/**
 * ============================================
 * POKÉSUCRE BACKEND - PAGOS EN HBAR
 * ============================================
 * 
 * Servidor para manejar:
 * - Recibir pagos en HBAR
 * - Transferir NFTs automáticamente
 * - Evoluciones después de 30 días
 * 
 * Ejecutar: node server.js
 */

const express = require('express');
const cors = require('cors');
const {
    Client,
    AccountId,
    PrivateKey,
    TransferTransaction,
    TokenId,
    NftId,
    TokenMintTransaction,
    TokenBurnTransaction,
    TokenAssociateTransaction,
    Hbar
} = require("@hashgraph/sdk");

require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// ============================================
// CONFIGURACIÓN
// ============================================
const CONFIG = {
    NFT_COLLECTION_ID: "0.0.10162863",
    TREASURY_ACCOUNT: process.env.HEDERA_ACCOUNT_ID || "0.0.10154386",
    IPFS_IMAGES: "bafybeifi5n34rqrecp6t6qpbgr7ekblnp23dgb66kk7327q3cwbask2cee",
    IPFS_METADATA_EVOLUTIONS: "bafybeigxvxoutk6mxxl2iq4xucsgkzkn3mhswxufdo5pvbpoo2hfu7f4ui",
    PORT: process.env.PORT || 3002
};

// Datos de Pokémon con precios en HBAR
const POKEMON_DATA = [
    { 
        serial: 17, 
        name: "Pichu", 
        evolvesTo: "Pikachu",
        evolveMetadata: "9-pikachu.json",
        cost: 5, // HBAR
        location: "Shibuya Crossing"
    },
    { 
        serial: 18, 
        name: "Charmander", 
        evolvesTo: "Charizard",
        evolveMetadata: "10-charizard.json",
        cost: 10,
        location: "Tokyo Tower"
    },
    { 
        serial: 19, 
        name: "Squirtle", 
        evolvesTo: "Blastoise",
        evolveMetadata: "11-blastoise.json",
        cost: 10,
        location: "Ueno Park Lake"
    },
    { 
        serial: 20, 
        name: "Bulbasaur", 
        evolvesTo: "Venusaur",
        evolveMetadata: "12-venusaur.json",
        cost: 10,
        location: "Shinjuku Gyoen"
    },
    { 
        serial: 21, 
        name: "Mew", 
        evolvesTo: "Mewtwo",
        evolveMetadata: "13-mewtwo.json",
        cost: 50,
        location: "Akihabara"
    },
    { 
        serial: 22, 
        name: "Dratini", 
        evolvesTo: "Dragonite",
        evolveMetadata: "14-dragonite.json",
        cost: 30,
        location: "Senso-ji Temple"
    },
    { 
        serial: 23, 
        name: "Munchlax", 
        evolvesTo: "Snorlax",
        evolveMetadata: "15-snorlax.json",
        cost: 8,
        location: "Yoyogi Park"
    },
    { 
        serial: 24, 
        name: "Gastly", 
        evolvesTo: "Gengar",
        evolveMetadata: "16-gengar.json",
        cost: 8,
        location: "Harajuku"
    }
];

// Base de datos en memoria de capturas (en producción usar DB real)
const captures = {};

// Cliente Hedera
let client;
let operatorKey;

// ============================================
// INICIALIZAR HEDERA
// ============================================
function initHedera() {
    const accountId = process.env.HEDERA_ACCOUNT_ID;
    const privateKeyStr = process.env.HEDERA_PRIVATE_KEY;
    
    if (!accountId || !privateKeyStr) {
        console.error("❌ Faltan HEDERA_ACCOUNT_ID o HEDERA_PRIVATE_KEY en .env");
        process.exit(1);
    }
    
    client = Client.forMainnet();
    operatorKey = PrivateKey.fromStringECDSA(privateKeyStr);
    client.setOperator(AccountId.fromString(accountId), operatorKey);
    
    console.log("✅ Conectado a Hedera Mainnet");
    console.log("   Treasury: " + accountId);
}

// ============================================
// RUTAS API
// ============================================

// Estado del servidor
app.get('/status', (req, res) => {
    res.json({
        status: 'online',
        collection: CONFIG.NFT_COLLECTION_ID,
        treasury: CONFIG.TREASURY_ACCOUNT,
        pokemon: POKEMON_DATA.map(p => ({
            serial: p.serial,
            name: p.name,
            cost: p.cost + " HBAR",
            available: !captures[p.serial]
        }))
    });
});

// Obtener lista de Pokémon
app.get('/pokemon', (req, res) => {
    const list = POKEMON_DATA.map(p => ({
        serial: p.serial,
        name: p.name,
        evolvesTo: p.evolvesTo,
        cost: p.cost,
        location: p.location,
        captured: captures[p.serial] ? true : false,
        capturedBy: captures[p.serial]?.owner || null
    }));
    res.json(list);
});

// Obtener precio de un Pokémon
app.get('/pokemon/:serial/price', (req, res) => {
    const serial = parseInt(req.params.serial);
    const pokemon = POKEMON_DATA.find(p => p.serial === serial);
    
    if (!pokemon) {
        return res.status(404).json({ error: "Pokémon no encontrado" });
    }
    
    if (captures[serial]) {
        return res.status(400).json({ error: "Pokémon ya fue capturado" });
    }
    
    res.json({
        serial: pokemon.serial,
        name: pokemon.name,
        cost: pokemon.cost,
        treasury: CONFIG.TREASURY_ACCOUNT
    });
});

// Verificar pago y transferir NFT
app.post('/capture', async (req, res) => {
    const { serial, buyerAccountId, transactionId } = req.body;
    
    console.log("");
    console.log("🎯 Solicitud de captura:");
    console.log("   Pokémon Serial: #" + serial);
    console.log("   Comprador: " + buyerAccountId);
    console.log("   Transaction ID: " + transactionId);
    
    try {
        // Validar datos
        if (!serial || !buyerAccountId || !transactionId) {
            return res.status(400).json({ 
                error: "Faltan datos: serial, buyerAccountId, transactionId" 
            });
        }
        
        const pokemon = POKEMON_DATA.find(p => p.serial === parseInt(serial));
        if (!pokemon) {
            return res.status(404).json({ error: "Pokémon no encontrado" });
        }
        
        if (captures[serial]) {
            return res.status(400).json({ error: "Pokémon ya fue capturado" });
        }
        
        // Verificar el pago en Mirror Node
        console.log("   🔍 Verificando pago...");
        const paymentValid = await verifyPayment(transactionId, buyerAccountId, pokemon.cost);
        
        if (!paymentValid) {
            return res.status(400).json({ error: "Pago no válido o no encontrado" });
        }
        
        console.log("   ✅ Pago verificado!");
        
        // Transferir el NFT al comprador
        console.log("   📦 Transfiriendo NFT...");
        const transferResult = await transferNFT(buyerAccountId, serial);
        
        if (!transferResult.success) {
            return res.status(500).json({ error: transferResult.error });
        }
        
        // Registrar la captura
        captures[serial] = {
            owner: buyerAccountId,
            captureDate: Date.now(),
            transactionId: transactionId,
            transferTx: transferResult.transactionId
        };
        
        console.log("   🎉 ¡Captura exitosa!");
        console.log("");
        
        res.json({
            success: true,
            message: `¡${pokemon.name} capturado!`,
            pokemon: pokemon.name,
            serial: serial,
            owner: buyerAccountId,
            transferTransaction: transferResult.transactionId,
            evolvesTo: pokemon.evolvesTo,
            evolveDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        });
        
    } catch (error) {
        console.error("   ❌ Error:", error.message);
        res.status(500).json({ error: error.message });
    }
});

// Verificar si puede evolucionar
app.get('/evolve/:serial/check', (req, res) => {
    const serial = parseInt(req.params.serial);
    const capture = captures[serial];
    
    if (!capture) {
        return res.status(404).json({ error: "Este Pokémon no ha sido capturado" });
    }
    
    const pokemon = POKEMON_DATA.find(p => p.serial === serial);
    const daysSinceCapture = Math.floor((Date.now() - capture.captureDate) / (1000 * 60 * 60 * 24));
    const canEvolve = daysSinceCapture >= 30;
    
    res.json({
        serial: serial,
        name: pokemon.name,
        evolvesTo: pokemon.evolvesTo,
        captureDate: new Date(capture.captureDate).toISOString(),
        daysSinceCapture: daysSinceCapture,
        daysRemaining: canEvolve ? 0 : 30 - daysSinceCapture,
        canEvolve: canEvolve,
        owner: capture.owner
    });
});

// Evolucionar Pokémon
app.post('/evolve', async (req, res) => {
    const { serial, ownerAccountId } = req.body;
    
    console.log("");
    console.log("✨ Solicitud de evolución:");
    console.log("   Serial: #" + serial);
    console.log("   Owner: " + ownerAccountId);
    
    try {
        const capture = captures[serial];
        
        if (!capture) {
            return res.status(404).json({ error: "Pokémon no capturado" });
        }
        
        if (capture.owner !== ownerAccountId) {
            return res.status(403).json({ error: "No eres el dueño de este Pokémon" });
        }
        
        const daysSinceCapture = Math.floor((Date.now() - capture.captureDate) / (1000 * 60 * 60 * 24));
        if (daysSinceCapture < 30) {
            return res.status(400).json({ 
                error: `Faltan ${30 - daysSinceCapture} días para evolucionar` 
            });
        }
        
        const pokemon = POKEMON_DATA.find(p => p.serial === serial);
        
        // 1. Mintear el Pokémon evolucionado
        console.log("   🔮 Minteando " + pokemon.evolvesTo + "...");
        const mintResult = await mintEvolved(pokemon);
        
        if (!mintResult.success) {
            return res.status(500).json({ error: mintResult.error });
        }
        
        // 2. Transferir el evolucionado al dueño
        console.log("   📦 Transfiriendo evolución...");
        const transferResult = await transferNFT(ownerAccountId, mintResult.serial);
        
        if (!transferResult.success) {
            return res.status(500).json({ error: transferResult.error });
        }
        
        // 3. Quemar el Pokémon base (opcional - el dueño lo tiene)
        // En este caso el dueño conserva ambos o se puede implementar quema
        
        console.log("   🎉 ¡Evolución completada!");
        console.log("");
        
        res.json({
            success: true,
            message: `¡${pokemon.name} evolucionó a ${pokemon.evolvesTo}!`,
            originalSerial: serial,
            evolvedSerial: mintResult.serial,
            evolvedName: pokemon.evolvesTo,
            transferTransaction: transferResult.transactionId
        });
        
    } catch (error) {
        console.error("   ❌ Error:", error.message);
        res.status(500).json({ error: error.message });
    }
});

// Obtener capturas de un usuario
app.get('/user/:accountId/pokemon', (req, res) => {
    const accountId = req.params.accountId;
    
    const userPokemon = Object.entries(captures)
        .filter(([serial, data]) => data.owner === accountId)
        .map(([serial, data]) => {
            const pokemon = POKEMON_DATA.find(p => p.serial === parseInt(serial));
            const daysSinceCapture = Math.floor((Date.now() - data.captureDate) / (1000 * 60 * 60 * 24));
            return {
                serial: parseInt(serial),
                name: pokemon.name,
                evolvesTo: pokemon.evolvesTo,
                captureDate: new Date(data.captureDate).toISOString(),
                daysSinceCapture: daysSinceCapture,
                canEvolve: daysSinceCapture >= 30
            };
        });
    
    res.json(userPokemon);
});

// ============================================
// FUNCIONES HEDERA
// ============================================

async function verifyPayment(transactionId, fromAccount, expectedAmount) {
    try {
        // Convertir transaction ID al formato de Mirror Node
        // Formato: 0.0.XXXXX@SECONDS.NANOSECONDS -> 0.0.XXXXX-SECONDS-NANOSECONDS
        const parts = transactionId.split('@');
        if (parts.length !== 2) {
            console.log("   ⚠️ Formato de transactionId inválido");
            return false;
        }
        
        const accountPart = parts[0];
        const timePart = parts[1].replace('.', '-');
        const mirrorTxId = `${accountPart}-${timePart}`;
        
        // Consultar Mirror Node
        const url = `https://mainnet.mirrornode.hedera.com/api/v1/transactions/${mirrorTxId}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            console.log("   ⚠️ Transacción no encontrada en Mirror Node");
            // Esperar un poco y reintentar (Mirror Node tiene delay)
            await new Promise(r => setTimeout(r, 3000));
            const retry = await fetch(url);
            if (!retry.ok) return false;
            const retryData = await retry.json();
            return validateTransaction(retryData, fromAccount, expectedAmount);
        }
        
        const data = await response.json();
        return validateTransaction(data, fromAccount, expectedAmount);
        
    } catch (error) {
        console.error("   ❌ Error verificando pago:", error.message);
        return false;
    }
}

function validateTransaction(data, fromAccount, expectedAmount) {
    if (!data.transactions || data.transactions.length === 0) {
        return false;
    }
    
    const tx = data.transactions[0];
    
    // Verificar que fue exitosa
    if (tx.result !== 'SUCCESS') {
        console.log("   ⚠️ Transacción no exitosa:", tx.result);
        return false;
    }
    
    // Verificar transfers
    const transfers = tx.transfers || [];
    
    // Buscar transferencia del comprador al treasury
    const paymentToTreasury = transfers.find(t => 
        t.account === CONFIG.TREASURY_ACCOUNT && 
        t.amount >= expectedAmount * 100000000 // Convertir HBAR a tinybars
    );
    
    if (!paymentToTreasury) {
        console.log("   ⚠️ No se encontró pago suficiente al treasury");
        return false;
    }
    
    return true;
}

async function transferNFT(toAccount, serial) {
    try {
        const tokenId = TokenId.fromString(CONFIG.NFT_COLLECTION_ID);
        const nftId = new NftId(tokenId, serial);
        
        const transferTx = await new TransferTransaction()
            .addNftTransfer(tokenId, serial, CONFIG.TREASURY_ACCOUNT, toAccount)
            .execute(client);
        
        const receipt = await transferTx.getReceipt(client);
        
        return {
            success: true,
            transactionId: transferTx.transactionId.toString()
        };
        
    } catch (error) {
        // Si el error es que no está asociado, intentar asociar primero
        if (error.message.includes('TOKEN_NOT_ASSOCIATED')) {
            return {
                success: false,
                error: "El usuario debe asociar la colección NFT primero. Token ID: " + CONFIG.NFT_COLLECTION_ID
            };
        }
        
        return {
            success: false,
            error: error.message
        };
    }
}

async function mintEvolved(pokemon) {
    try {
        const metadata = `ipfs://${CONFIG.IPFS_METADATA_EVOLUTIONS}/${pokemon.evolveMetadata}`;
        
        const mintTx = await new TokenMintTransaction()
            .setTokenId(CONFIG.NFT_COLLECTION_ID)
            .addMetadata(Buffer.from(metadata))
            .execute(client);
        
        const receipt = await mintTx.getReceipt(client);
        const newSerial = receipt.serials[0].toNumber();
        
        return {
            success: true,
            serial: newSerial
        };
        
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

// ============================================
// INICIAR SERVIDOR
// ============================================
initHedera();

app.listen(CONFIG.PORT, () => {
    console.log("");
    console.log("========================================");
    console.log("🎮 POKÉSUCRE BACKEND");
    console.log("========================================");
    console.log("");
    console.log("   Puerto: " + CONFIG.PORT);
    console.log("   Colección: " + CONFIG.NFT_COLLECTION_ID);
    console.log("   Treasury: " + CONFIG.TREASURY_ACCOUNT);
    console.log("");
    console.log("   📍 Endpoints:");
    console.log("   GET  /status          - Estado del servidor");
    console.log("   GET  /pokemon         - Lista de Pokémon");
    console.log("   GET  /pokemon/:serial/price - Precio de un Pokémon");
    console.log("   POST /capture         - Capturar (después de pago)");
    console.log("   GET  /evolve/:serial/check - Verificar evolución");
    console.log("   POST /evolve          - Evolucionar");
    console.log("   GET  /user/:id/pokemon - Pokémon de un usuario");
    console.log("");
    console.log("🎯 Pokémon disponibles:");
    POKEMON_DATA.forEach(p => {
        console.log(`   #${p.serial} ${p.name} → ${p.evolvesTo} (${p.cost} HBAR)`);
    });
    console.log("");
    console.log("✅ Servidor listo!");
    console.log("");
});