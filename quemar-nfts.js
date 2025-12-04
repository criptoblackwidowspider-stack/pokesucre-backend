/**
 * QUEMAR NFTs SIN IMAGEN (Seriales 1-16)
 * Ejecutar: node quemar-nfts.js
 */

const {
    Client,
    AccountId,
    PrivateKey,
    TokenBurnTransaction
} = require("@hashgraph/sdk");

// Configuración
const ACCOUNT_ID = "0.0.10154386";
const PRIVATE_KEY = "44b8bf5a91450183db491d3894a26c3e3372c8dd1329afd8503666bc11bdee8f";
const NFT_COLLECTION_ID = "0.0.10162863";

// Seriales a quemar (1-16)
const SERIALS_TO_BURN = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];

async function main() {
    const client = Client.forMainnet();
    const privateKey = PrivateKey.fromStringECDSA(PRIVATE_KEY);
    client.setOperator(AccountId.fromString(ACCOUNT_ID), privateKey);

    console.log("");
    console.log("========================================");
    console.log("🔥 QUEMAR NFTs SIN IMAGEN");
    console.log("========================================");
    console.log("");
    console.log("Colección: " + NFT_COLLECTION_ID);
    console.log("Seriales a quemar: 1-16");
    console.log("");

    for (const serial of SERIALS_TO_BURN) {
        console.log(`🔥 Quemando Serial #${serial}...`);

        try {
            const burnTx = await new TokenBurnTransaction()
                .setTokenId(NFT_COLLECTION_ID)
                .setSerials([serial])
                .execute(client);

            const receipt = await burnTx.getReceipt(client);
            console.log(`   ✅ Quemado!`);

        } catch (error) {
            console.log(`   ❌ Error: ${error.message}`);
        }
    }

    console.log("");
    console.log("========================================");
    console.log("✅ COMPLETADO");
    console.log("========================================");
    console.log("");

    process.exit(0);
}

main();
