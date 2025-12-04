/**
 * MINTEAR POKEMON NFTs CON IMAGENES IPFS
 * Ejecutar: node mintear-ipfs.js
 */

const {
    Client,
    AccountId,
    PrivateKey,
    TokenMintTransaction
} = require("@hashgraph/sdk");

// Configuración
const ACCOUNT_ID = "0.0.10154386";
const PRIVATE_KEY = "44b8bf5a91450183db491d3894a26c3e3372c8dd1329afd8503666bc11bdee8f";
const NFT_COLLECTION_ID = "0.0.10162863";
const METADATA_CID = "bafybeiefdry3phdktyoya6zqq3mncrxqloxchjt4fizznx3wvrnxz6cmz4";

// Pokémon a mintear
const POKEMON = [
    "1-pichu.json",
    "2-charmander.json",
    "3-squirtle.json",
    "4-bulbasaur.json",
    "5-mew.json",
    "6-dratini.json",
    "7-munchlax.json",
    "8-gastly.json"
];

async function main() {
    // Conectar a Hedera Mainnet
    const client = Client.forMainnet();
    const privateKey = PrivateKey.fromStringECDSA(PRIVATE_KEY);
    client.setOperator(AccountId.fromString(ACCOUNT_ID), privateKey);

    console.log("");
    console.log("========================================");
    console.log("🎮 MINTEAR POKEMON NFTs CON IPFS");
    console.log("========================================");
    console.log("");
    console.log("Colección: " + NFT_COLLECTION_ID);
    console.log("Metadata CID: " + METADATA_CID);
    console.log("");

    const newSerials = [];

    for (const pokemon of POKEMON) {
        const metadataUri = `ipfs://${METADATA_CID}/${pokemon}`;
        
        console.log(`🔮 Minteando ${pokemon}...`);
        console.log(`   Metadata: ${metadataUri}`);

        try {
            const mintTx = await new TokenMintTransaction()
                .setTokenId(NFT_COLLECTION_ID)
                .addMetadata(Buffer.from(metadataUri))
                .execute(client);

            const receipt = await mintTx.getReceipt(client);
            const serial = receipt.serials[0].toNumber();

            console.log(`   ✅ Serial #${serial}`);
            console.log("");

            newSerials.push({ pokemon: pokemon.replace('.json', ''), serial });

        } catch (error) {
            console.log(`   ❌ Error: ${error.message}`);
            console.log("");
        }
    }

    console.log("========================================");
    console.log("✅ MINTEO COMPLETADO");
    console.log("========================================");
    console.log("");
    console.log("NUEVOS SERIALES (actualiza el backend con estos):");
    console.log("");
    newSerials.forEach(p => {
        console.log(`   ${p.pokemon}: Serial #${p.serial}`);
    });
    console.log("");
    console.log("========================================");

    process.exit(0);
}

main();
