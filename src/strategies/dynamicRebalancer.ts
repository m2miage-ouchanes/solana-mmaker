import { Connection, PublicKey } from '@solana/web3.js';
import Decimal from 'decimal.js';
import axios from 'axios';
import { marketDataService } from '../services/MarketDataService';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

export class DynamicRebalancer {
  private emaPeriod: number;
  private volatilityThreshold: number;
  private maxSOLExposure: number;
  private priceHistory: number[] = [];
  private lastUpdate: Date = new Date();
  private updateInterval: number = 30 * 1000; // 30 secondes
  private lastPrice: number | null = null;
  private maxPriceHistoryLength: number = 100; // Garder les 100 derniers prix
  private priceUpdateTimer: NodeJS.Timeout | null = null;
  private walletAddress: PublicKey;

  constructor(
    private connection: Connection,
    walletAddress: PublicKey,
    config: {
      emaPeriod?: number;
      volatilityThreshold?: number;
      maxSOLExposure?: number;
    } = {}
  ) {
    this.emaPeriod = config.emaPeriod || 20;
    this.volatilityThreshold = config.volatilityThreshold || 0.15;
    this.maxSOLExposure = config.maxSOLExposure || 0.7;
    this.walletAddress = walletAddress;

    this.initializePriceUpdates();
  }

  private async initializePriceUpdates() {
    try {
      console.log('🔄 Initializing CoinGecko price updates...');

      // Get initial price
      await this.fetchSolanaPrice();

      // Set up polling for price updates
      this.priceUpdateTimer = setInterval(async () => {
        await this.fetchSolanaPrice();
      }, this.updateInterval);

      console.log('✅ Successfully set up price update polling');

    } catch (error) {
      console.error('❌ Error initializing price updates:', error);
      // Retry after 5 seconds
      console.log('🔄 Scheduling price updates retry in 5 seconds...');
      setTimeout(() => {
        console.log('🔄 Retrying price updates initialization...');
        this.initializePriceUpdates();
      }, 5000);
    }
  }

  private async fetchSolanaPrice() {
    try {
      const response = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
        params: {
          ids: 'solana',
          vs_currencies: 'usd'
        }
      });

      if (response.data && response.data.solana && response.data.solana.usd) {
        this.lastPrice = response.data.solana.usd;
        this.updatePriceHistory();
        console.log(`✅ SOL price update from CoinGecko: $${this.lastPrice}`);
        this.emitPriceUpdate();
      } else {
        console.error('❌ Invalid price data from CoinGecko:', response.data);
      }
    } catch (error) {
      console.error('❌ Error fetching SOL price from CoinGecko:', error);
    }
  }

  private emitPriceUpdate() {
    if (this.lastPrice === null) return;

    const ema = this.calculateEMA(this.priceHistory);
    const volatility = this.calculateVolatility(this.priceHistory, ema);
    const momentum = this.calculateMomentum(this.priceHistory);
    const ratio = this.adjustRatioBasedOnMetrics(ema, volatility, momentum);

    // Récupérer les balances depuis le service de marché
    const currentMarketData = marketDataService.getCurrentMarketData();
    const solBalance = currentMarketData?.solBalance || 0;
    const usdtBalance = currentMarketData?.usdtBalance || 0;
    // Garder la dernière date de transaction si elle existe
    const lastTradeTime = currentMarketData?.lastTradeTime;

    // Calculer la valeur totale du portefeuille
    this.calculateTotalPortfolioValue()
      .then(portfolioValue => {
        console.log('📊 Emitting market update with data:', {
          solPrice: this.lastPrice,
          priceHistoryLength: this.priceHistory.length,
          volatility,
          momentum,
          ratio,
          lastTradeTime: lastTradeTime ? new Date(lastTradeTime).toISOString() : 'N/A',
          portfolioValue,
          solBalance,
          usdtBalance
        });

        marketDataService.emitMarketUpdate({
          solPrice: this.lastPrice,
          priceHistory: [...this.priceHistory],
          volatility: volatility,
          momentum: momentum,
          rebalancePercentage: ratio,
          lastTradeTime: lastTradeTime, // Conserver la date de la dernière transaction
          portfolioValue: portfolioValue,
          solBalance: solBalance,
          usdtBalance: usdtBalance
        });
      })
      .catch(error => {
        console.error('Error updating portfolio value:', error);
      });
  }

  private updatePriceHistory(): void {
    if (this.lastPrice !== null) {
      // Mettre à jour la date
      this.lastUpdate = new Date();

      // Ajouter le nouveau prix
      this.priceHistory.push(this.lastPrice);

      // Garder seulement les derniers prix
      if (this.priceHistory.length > this.maxPriceHistoryLength) {
        this.priceHistory = this.priceHistory.slice(-this.maxPriceHistoryLength);
      }

      // Log pour le débogage
      console.log(`Price history updated at ${this.lastUpdate.toISOString()}: ${this.priceHistory.length} prices stored`);
    }
  }

  async calculateDynamicRatio(): Promise<number> {
    await this.updatePriceHistory();
    const ema = this.calculateEMA(this.priceHistory);
    const volatility = this.calculateVolatility(this.priceHistory, ema);
    const momentum = this.calculateMomentum(this.priceHistory);
    const ratio = this.adjustRatioBasedOnMetrics(ema, volatility, momentum);

    // Émettre la mise à jour du ratio
    marketDataService.emitMarketUpdate({
      rebalancePercentage: ratio
    });

    return ratio;
  }

  private calculateEMA(prices: number[]): number {
    if (prices.length === 0) return 0;

    const k = 2 / (prices.length + 1);
    let ema = prices[0];

    for (let i = 1; i < prices.length; i++) {
      ema = prices[i] * k + ema * (1 - k);
    }

    return ema;
  }

  private calculateVolatility(prices: number[], ema: number): number {
    if (prices.length < 2) return 0;

    const squaredDiffs = prices.map(p => Math.pow((p - ema) / ema, 2));
    return Math.sqrt(squaredDiffs.reduce((a, b) => a + b) / prices.length);
  }

  private calculateMomentum(prices: number[]): number {
    if (prices.length < 2) return 0;

    const recentPrices = prices.slice(-5); // Use last 5 prices for momentum
    const priceChanges = recentPrices.map((price, i) =>
      i > 0 ? (price - recentPrices[i - 1]) / recentPrices[i - 1] : 0
    );

    return priceChanges.reduce((a, b) => a + b, 0) / (recentPrices.length - 1);
  }

  private adjustRatioBasedOnMetrics(ema: number, volatility: number, momentum: number): number {
    const baseRatio = 0.5; // Start with 50/50 distribution
    let adjustedRatio = baseRatio;

    // Adjust based on volatility
    if (volatility < this.volatilityThreshold) {
      // Lower volatility allows for more aggressive positions
      adjustedRatio += 0.1;
    } else {
      // Higher volatility suggests more conservative positions
      adjustedRatio -= 0.1;
    }

    // Adjust based on momentum
    if (momentum > 0) {
      // Positive momentum suggests increasing SOL position
      adjustedRatio += momentum * 0.2;
    } else {
      // Negative momentum suggests reducing SOL position
      adjustedRatio += momentum * 0.2;
    }

    // Ensure the ratio stays within bounds
    adjustedRatio = Math.max(1 - this.maxSOLExposure, Math.min(this.maxSOLExposure, adjustedRatio));

    return adjustedRatio;
  }

  private async getCurrentSOLPrice(): Promise<number | null> {
    return this.lastPrice;
  }

  private normalizePriceData(priceData: any): number | null {
    try {
      if (priceData.aggregate && typeof priceData.aggregate.price === 'number') {
        return priceData.aggregate.price;
      }
      return null;
    } catch (error) {
      console.error('Erreur de normalisation du prix:', error);
      return null;
    }
  }

  // Cleanup method to be called when the application shuts down
  public async cleanup() {
    if (this.priceUpdateTimer) {
      clearInterval(this.priceUpdateTimer);
      console.log('Price update polling stopped successfully');
    }
  }

  private async calculateTotalPortfolioValue(): Promise<number> {
    try {
      // Récupérer le solde SOL natif
      const solBalance = await this.connection.getBalance(this.walletAddress);
      const solValue = (solBalance / 1e9) * (this.lastPrice || 0); // Convertir les lamports en SOL

      // Récupérer le solde USDT
      const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
        this.walletAddress,
        { programId: TOKEN_PROGRAM_ID }
      );

      // Chercher le compte USDT
      const usdtAccount = tokenAccounts.value.find(account =>
        account.account.data.parsed.info.mint === "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB" // USDT
      );

      // Récupérer la valeur USDT (qui est déjà en USD)
      const usdtValue = usdtAccount
        ? (usdtAccount.account.data.parsed.info.tokenAmount.uiAmount || 0)
        : 0;

      const totalValue = solValue + usdtValue;

      console.log('Portfolio value breakdown:', {
        solValue: solValue.toFixed(2),
        usdtValue: usdtValue.toFixed(2),
        totalValue: totalValue.toFixed(2)
      });

      return totalValue;
    } catch (error) {
      console.error('Error calculating portfolio value:', error);
      return 0;
    }
  }

  private async executeTrade(side: 'buy' | 'sell', amount: ReturnType<typeof Decimal.prototype.constructor>) {
    // ... existing trade execution code ...
  }
}


