import { Keypair } from '@solana/web3.js';
import dotenv from 'dotenv';
import { convertBase58PrivateKeyToArray } from './script/convertKey';

dotenv.config();

// Load keypair from file
function loadKeypairFromFile(): Keypair {
    try {
        const SECRET_KEY = process.env.USER_KEYPAIR;
        const secretKeyArray = convertBase58PrivateKeyToArray(SECRET_KEY || '');
        return Keypair.fromSecretKey(Uint8Array.from(secretKeyArray));
    } catch (error) {
        console.error(`Erreur lors du chargement de la clé privée à partir de`, error);
        process.exit(1);
    }
}

// Derive keypair from seed and derivation path
/*function deriveKeypairFromSeed(seed: Buffer, derivationPath: string): Keypair {
    const derivedSeed = derivePath(derivationPath, seed.toString('hex')).key;
    const keypair = nacl.sign.keyPair.fromSeed(derivedSeed);
    return Keypair.fromSecretKey(new Uint8Array([...keypair.secretKey]));
}*/

// Load keypair from mnemonic
/*function loadKeypairFromMnemonic(mnemonic: string, derivationPath: string = "m/44'/501'/0'/0'"): Keypair {
    const seed = bip39.mnemonicToSeedSync(mnemonic);
    return deriveKeypairFromSeed(seed, derivationPath);
}*/

// Get user keypair, optionally using a derivation path
export function getUserKeypair(): Keypair {
    const keypair = loadKeypairFromFile();
    /* if (derivationPath) {
         const seed = keypair.secretKey.slice(0, 32); // Assume the seed is the first 32 bytes of the secret key
         return deriveKeypairFromSeed(Buffer.from(seed), derivationPath);
     }*/
    return keypair;
}

// Main function to load keypair
export function loadKeypair(): Keypair {
    if (process.env.USER_KEYPAIR) {
        return getUserKeypair();
    } else {
        console.error('Private key or mnemonic not found');
        console.error('Please set SOLANA_MNEMONIC or USER_KEYPAIR environment variable');
        process.exit(1);
    }
}