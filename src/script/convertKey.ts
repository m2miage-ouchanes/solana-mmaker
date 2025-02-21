import bs58 from 'bs58';

/**
 * Convertit une clé privée Base58 en un tableau de nombres.
 * @param privateKeyBase58 - La clé privée au format Base58.
 * @returns Un tableau de nombres représentant la clé privée.
 */
export function convertBase58PrivateKeyToArray(privateKeyBase58: string): number[] {
    // Convertir la clé privée Base58 en tableau d'octets
    const privateKeyBytes: Uint8Array = bs58.decode(privateKeyBase58);

    // Convertir le tableau d'octets en tableau de nombres
    return Array.from(privateKeyBytes);
}
