import { JupiterClient } from '../api/jupiter';
import { SOL_MINT_ADDRESS, USDT_MINT_ADDRESS, USDC_MINT_ADDRESS } from '../constants/constants';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import Decimal from 'decimal.js';
import { fromNumberToLamports } from '../utils/convert';
import { Connection, PublicKey } from '@solana/web3.js';
import { sleep } from '../utils/sleep';
import { DynamicRebalancer } from './dynamicRebalancer';
import { marketDataService } from '../services/MarketDataService';

// Constantes de temps en millisecondes
const DEFAULT_WAIT_TIME = 15 * 60 * 1000;        // 15 minutes
const MIN_WAIT_TIME = 5 * 60 * 1000;             // 5 minutes minimum
const MAX_WAIT_TIME = 60 * 60 * 1000;            // 1 heure maximum

// Constantes de trading
const DEFAULT_SLIPPAGE_BPS = 50;                 // 0.5% de slippage par défaut
const DEFAULT_PRICE_TOLERANCE = 0.02;             // 2% de tolérance par défaut
const MIN_PORTFOLIO_IMBALANCE = 0.02;            // 2% d'écart minimum pour trader

// Récupération et validation de MIN_TRADE_VALUE_USD depuis les variables d'environnement
function getMinTradeValueUSD(): number {
    const envValue = process.env.MIN_TRADE_VALUE_USD;
    if (!envValue) {
        console.error('❌ Erreur: MIN_TRADE_VALUE_USD doit être défini dans les variables d\'environnement');
        process.exit(1);
    }

    const value = parseFloat(envValue);
    if (isNaN(value) || value <= 0) {
        console.error(`❌ Erreur: MIN_TRADE_VALUE_USD doit être un nombre positif. Valeur reçue: ${envValue}`);
        process.exit(1);
    }

    console.log(`✅ MIN_TRADE_VALUE_USD configuré à: $${value}`);
    return value;
}

/**
 * Class for market making basic strategy
 */
export class MarketMaker {
    usdtToken: { address: string, symbol: string, decimals: number }
    solToken: { address: string, symbol: string, decimals: number }
    usdcToken: { address: string, symbol: string, decimals: number }
    waitTime: number
    slippageBps: number
    priceTolerance: number
    minTradeValueUSD: number
    minPortfolioImbalance: number
    rebalancePercentage: number
    dynamicRebalancer!: DynamicRebalancer
    private solBalance!: ReturnType<typeof Decimal.prototype.constructor>;
    private usdtBalance!: ReturnType<typeof Decimal.prototype.constructor>;
    private lastPrice: ReturnType<typeof Decimal.prototype.constructor> | null = null;
    private config: {
        emaPeriod?: number;
        volatilityThreshold?: number;
        maxSOLExposure?: number;
    };

    /**
     * Initializes a new instance of the MarketMaker class with default properties.
     */
    constructor(
        private connection: Connection,
        config: {
            emaPeriod?: number;
            volatilityThreshold?: number;
            maxSOLExposure?: number;
            waitTime?: number;
            slippageBps?: number;
            priceTolerance?: number;
            minTradeValueUSD?: number;
            minPortfolioImbalance?: number;
        } = {}
    ) {
        // Read decimals from the token mint addresses
        this.usdtToken = { address: USDT_MINT_ADDRESS, symbol: 'USDT', decimals: 6 };
        this.solToken = { address: SOL_MINT_ADDRESS, symbol: 'SOL', decimals: 9 };
        this.usdcToken = { address: USDC_MINT_ADDRESS, symbol: 'USDC', decimals: 6 };

        // Initialize trading parameters
        const configuredWaitTime = config.waitTime || DEFAULT_WAIT_TIME;
        this.waitTime = Math.min(Math.max(configuredWaitTime, MIN_WAIT_TIME), MAX_WAIT_TIME);
        this.slippageBps = config.slippageBps || DEFAULT_SLIPPAGE_BPS;
        this.priceTolerance = config.priceTolerance || DEFAULT_PRICE_TOLERANCE;
        this.minTradeValueUSD = config.minTradeValueUSD || getMinTradeValueUSD();
        this.minPortfolioImbalance = config.minPortfolioImbalance || MIN_PORTFOLIO_IMBALANCE;
        this.rebalancePercentage = 0.5; // Valeur initiale qui sera mise à jour dynamiquement
        this.config = {
            emaPeriod: config.emaPeriod || 20,
            volatilityThreshold: config.volatilityThreshold || 0.15,
            maxSOLExposure: config.maxSOLExposure || 0.7
        };

        // Log de la configuration
        console.log('\nConfiguration du Market Maker:');
        console.log(`- Intervalle d'évaluation: ${this.waitTime / 1000 / 60} minutes`);
        console.log(`- Valeur minimale de trade: $${this.minTradeValueUSD}`);
        console.log(`- Écart minimum pour trade: ${(this.minPortfolioImbalance * 100).toFixed(2)}%`);
        console.log(`- Slippage maximum: ${(this.slippageBps / 100).toFixed(2)}%\n`);

        this.solBalance = new Decimal(0);
        this.usdtBalance = new Decimal(0);
    }

    /**
     * Run market making strategy
     * @param {JupiterClient} jupiterClient - JupiterClient object
     * @param {boolean} enableTrading - Enable trading
     * @returns {Promise<void>} - Promise object
     */
    async runMM(jupiterClient: JupiterClient, enableTrading: Boolean = false): Promise<void> {
        // Initialize dynamic rebalancer with configuration
        this.dynamicRebalancer = new DynamicRebalancer(
            this.connection,
            jupiterClient.getUserKeypair().publicKey,
            this.config
        );

        const tradePairs = [{ token0: this.solToken, token1: this.usdtToken }];
        console.log(`Stratégie démarrée avec intervalle de ${this.waitTime / 1000 / 60} minutes entre les évaluations`);

        while (true) {
            for (const pair of tradePairs) {
                await this.evaluateAndExecuteTrade(jupiterClient, pair, enableTrading);
            }

            const minutes = this.waitTime / 1000 / 60;
            console.log(`\nAttente de ${minutes} minute${minutes > 1 ? 's' : ''} avant la prochaine évaluation...`);
            await sleep(this.waitTime);
        }
    }

    /**
     * Evaluate and execute trade
     * @param {JupiterClient} jupiterClient - JupiterClient object
     * @param {any} pair - Pair object
     * @param {boolean} enableTrading - Enable trading
     * @returns {Promise<void>} - Promise object
     * 
     **/
    async evaluateAndExecuteTrade(jupiterClient: JupiterClient, pair: any, enableTrading: Boolean): Promise<void> {
        console.log('\n=== Évaluation du Trade ===');

        // Mise à jour des balances
        await this.updateBalances(jupiterClient);

        const token0Balance = await this.fetchTokenBalance(jupiterClient, pair.token0); // SOL balance
        const token1Balance = await this.fetchTokenBalance(jupiterClient, pair.token1); // USDT balance

        // Log current token balances
        console.log('\nBalances actuels:');
        console.log(`${pair.token0.symbol}: ${token0Balance.toString()}`);
        console.log(`${pair.token1.symbol}: ${token1Balance.toString()}`);

        // Get USD value for both tokens
        const token0Price = await this.getUSDValue(jupiterClient, pair.token0);
        const token1Price = await this.getUSDValue(jupiterClient, pair.token1);

        const token0Value = token0Balance.mul(token0Price);
        const token1Value = token1Balance.mul(token1Price);
        const totalPortfolioValue = token0Value.add(token1Value);

        console.log('\nValeurs en USD:');
        console.log(`${pair.token0.symbol}: $${token0Value.toString()}`);
        console.log(`${pair.token1.symbol}: $${token1Value.toString()}`);
        console.log(`Portfolio Total: $${totalPortfolioValue.toString()}`);

        // Get dynamic rebalance percentage based on market conditions
        const dynamicRatio = await this.dynamicRebalancer.calculateDynamicRatio();
        this.rebalancePercentage = dynamicRatio;

        console.log('\nMétriques de rebalancement:');
        console.log(`Ratio de rebalancement actuel: ${(this.rebalancePercentage * 100).toFixed(2)}% ${pair.token0.symbol}`);

        const currentRatio = token0Value.div(totalPortfolioValue);
        console.log(`Ratio actuel du portfolio: ${(currentRatio.toNumber() * 100).toFixed(2)}% ${pair.token0.symbol}`);

        const tradeNecessity = await this.determineTradeNecessity(jupiterClient, pair, token0Balance, token1Balance);
        const { tradeNeeded, solAmountToTrade, usdtAmountToTrade } = tradeNecessity!;

        if (tradeNeeded) {
            console.log('\n🔄 Trade nécessaire:');
            if (solAmountToTrade.gt(0)) {
                console.log(`Vente de ${solAmountToTrade.toString()} ${pair.token0.symbol} pour ${pair.token1.symbol}`);
                const lamportsAsString = fromNumberToLamports(solAmountToTrade.toNumber(), pair.token0.decimals).toString();
                const quote = await jupiterClient.getQuote(pair.token0.address, pair.token1.address, lamportsAsString, this.slippageBps);
                const swapTransaction = await jupiterClient.getSwapTransaction(quote);

                console.log(`Prix estimé: ${quote.outAmount.mul(100).toFixed(2)} ${pair.token1.symbol}`);
                console.log(`Slippage maximum: ${this.slippageBps / 100}%`);

                if (enableTrading) {
                    console.log('Exécution du trade...');
                    await jupiterClient.executeSwap(swapTransaction);
                    console.log('Trade exécuté avec succès');
                    // Mettre à jour lastTradeTime uniquement après un trade réussi
                    marketDataService.emitMarketUpdate({
                        lastTradeTime: new Date()
                    });
                } else {
                    console.log('⚠️ Trading désactivé - Simulation uniquement');
                }
            } else if (usdtAmountToTrade.gt(0)) {
                console.log(`Achat de ${pair.token0.symbol} pour ${usdtAmountToTrade.toString()} ${pair.token1.symbol}`);
                const lamportsAsString = fromNumberToLamports(usdtAmountToTrade.toNumber(), pair.token1.decimals).toString();
                const quote = await jupiterClient.getQuote(pair.token1.address, pair.token0.address, lamportsAsString, this.slippageBps);
                const swapTransaction = await jupiterClient.getSwapTransaction(quote);

                console.log(`Prix estimé: ${quote.outAmount.mul(100).toFixed(2)} ${pair.token0.symbol}`);
                console.log(`Slippage maximum: ${this.slippageBps / 100}%`);

                if (enableTrading) {
                    console.log('Exécution du trade...');
                    await jupiterClient.executeSwap(swapTransaction);
                    console.log('Trade exécuté avec succès');
                    // Mettre à jour lastTradeTime uniquement après un trade réussi
                    marketDataService.emitMarketUpdate({
                        lastTradeTime: new Date()
                    });
                } else {
                    console.log('⚠️ Trading désactivé - Simulation uniquement');
                }
            }
        } else {
            console.log('\n✅ Aucun trade nécessaire - Portfolio équilibré');
        }

        console.log('\n=== Fin de l\'évaluation ===\n');

        // Émettre la mise à jour des balances
        await this.updateBalances(jupiterClient);
    }

    /**
     * Determines the necessity of a trade based on the current balance of two tokens and their USD values.
     * The goal is to maintain a dynamic ratio based on market conditions.
     */
    async determineTradeNecessity(jupiterClient: JupiterClient, pair: any, token0Balance: ReturnType<typeof Decimal.prototype.constructor>, token1Balance: ReturnType<typeof Decimal.prototype.constructor>) {
        // Get dynamic rebalance percentage based on market conditions
        const dynamicRatio = await this.dynamicRebalancer.calculateDynamicRatio();
        this.rebalancePercentage = dynamicRatio;

        const token0Price = await this.getUSDValue(jupiterClient, pair.token0);
        const token1Price = await this.getUSDValue(jupiterClient, pair.token1);

        const token0Value = token0Balance.mul(token0Price);
        const token1Value = token1Balance.mul(token1Price);
        const totalPortfolioValue = token0Value.add(token1Value);

        const targetToken0Value = totalPortfolioValue.mul(new Decimal(this.rebalancePercentage));
        const oneMinusRebalancePercentage = new Decimal(1).minus(new Decimal(this.rebalancePercentage));
        const targetToken1Value = totalPortfolioValue.mul(oneMinusRebalancePercentage);

        let solAmountToTrade = new Decimal(0);
        let usdtAmountToTrade = new Decimal(0);
        let tradeNeeded = false;

        // Calculer l'écart en pourcentage par rapport à la cible
        const currentRatio = token0Value.div(totalPortfolioValue);
        const targetRatio = new Decimal(this.rebalancePercentage);
        const ratioDeviation = currentRatio.sub(targetRatio).abs();

        // Vérifier si l'écart est suffisant pour justifier un trade
        if (ratioDeviation.gt(new Decimal(this.minPortfolioImbalance))) {
            if (token0Value.gt(targetToken0Value)) {
                const valueDiff = token0Value.sub(targetToken0Value);
                // Vérifier si la valeur du trade dépasse le minimum
                if (valueDiff.gt(new Decimal(this.minTradeValueUSD))) {
                    solAmountToTrade = valueDiff.div(token0Price);
                    tradeNeeded = true;
                    console.log(`\nÉcart de portfolio: ${ratioDeviation.mul(100).toFixed(2)}%`);
                    console.log(`Valeur du trade: $${valueDiff.toFixed(2)}`);
                } else {
                    console.log(`\nTrade ignoré: valeur ($${valueDiff.toFixed(2)}) inférieure au minimum ($${this.minTradeValueUSD})`);
                }
            } else if (token1Value.gt(targetToken1Value)) {
                const valueDiff = token1Value.sub(targetToken1Value);
                if (valueDiff.gt(new Decimal(this.minTradeValueUSD))) {
                    usdtAmountToTrade = valueDiff.div(token1Price);
                    tradeNeeded = true;
                    console.log(`\nÉcart de portfolio: ${ratioDeviation.mul(100).toFixed(2)}%`);
                    console.log(`Valeur du trade: $${valueDiff.toFixed(2)}`);
                } else {
                    console.log(`\nTrade ignoré: valeur ($${valueDiff.toFixed(2)}) inférieure au minimum ($${this.minTradeValueUSD})`);
                }
            }
        } else {
            console.log(`\nTrade ignoré: écart de ${ratioDeviation.mul(100).toFixed(2)}% inférieur au minimum ${(this.minPortfolioImbalance * 100).toFixed(2)}%`);
        }

        return { tradeNeeded, solAmountToTrade, usdtAmountToTrade };
    }

    /**
     * Fetch token balance
     * @param {JupiterClient} jupiterClient - JupiterClient object
     * @param {any} token - Token object
     * @returns {Promise<Decimal>} - Token balance
     */
    async fetchTokenBalance(jupiterClient: JupiterClient, token: { address: string; symbol: string; decimals: number; }): Promise<ReturnType<typeof Decimal.prototype.constructor>> {
        const connection = jupiterClient.getConnection();
        const publicKey = jupiterClient.getUserKeypair().publicKey;

        let balance = token.address === SOL_MINT_ADDRESS
            ? await connection.getBalance(publicKey)
            : await this.getSPLTokenBalance(connection, publicKey, new PublicKey(token.address));

        return new Decimal(balance).div(new Decimal(10).pow(token.decimals));
    }

    /**
     * Get SPL token balance.
     * @param connection Solana connection object.
     * @param walletAddress Wallet public key.
     * @param tokenMintAddress Token mint public key.
     * @returns Token balance as a Decimal.
     */
    async getSPLTokenBalance(connection: Connection, walletAddress: PublicKey, tokenMintAddress: PublicKey): Promise<ReturnType<typeof Decimal.prototype.constructor>> {
        const accounts = await connection.getParsedTokenAccountsByOwner(walletAddress, { programId: TOKEN_PROGRAM_ID });
        const accountInfo = accounts.value.find((account: any) => account.account.data.parsed.info.mint === tokenMintAddress.toBase58());
        return accountInfo ? new Decimal(accountInfo.account.data.parsed.info.tokenAmount.amount) : new Decimal(0);
    }

    /**
     * Get USD value of a token.
     * @param jupiterClient JupiterClient object.
     * @param token Token object.
     * @returns USD value of the token as a Decimal.
     */
    async getUSDValue(jupiterClient: JupiterClient, token: any): Promise<ReturnType<typeof Decimal.prototype.constructor>> {
        const quote = await jupiterClient.getQuote(token.address, this.usdcToken.address, fromNumberToLamports(1, token.decimals).toString(), this.slippageBps);
        return new Decimal(quote.outAmount).div(new Decimal(10).pow(this.usdcToken.decimals));
    }

    private async updateBalances(jupiterClient: JupiterClient) {
        try {
            // Mise à jour des balances
            const solBalance = await this.fetchTokenBalance(jupiterClient, this.solToken);
            const usdtBalance = await this.fetchTokenBalance(jupiterClient, this.usdtToken);

            this.solBalance = solBalance;
            this.usdtBalance = usdtBalance;

            // Émettre la mise à jour des balances
            const solValue = this.lastPrice ? this.solBalance.mul(this.lastPrice).toNumber() : 0;
            const totalValue = solValue + this.usdtBalance.toNumber();

            console.log('Emitting balance update:', {
                solBalance: this.solBalance.toNumber(),
                usdtBalance: this.usdtBalance.toNumber(),
                portfolioValue: totalValue
            });

            marketDataService.emitMarketUpdate({
                solBalance: this.solBalance.toNumber(),
                usdtBalance: this.usdtBalance.toNumber(),
                portfolioValue: totalValue
            });
        } catch (error) {
            console.error('Error updating balances:', error);
        }
    }

    private async executeTrade(side: 'buy' | 'sell', amount: ReturnType<typeof Decimal.prototype.constructor>) {
        // ... existing trade execution code ...

        // Émettre la mise à jour du dernier trade
        marketDataService.emitMarketUpdate({
            lastTradeTime: new Date()
        });
    }
}
