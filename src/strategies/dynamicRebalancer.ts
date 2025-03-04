import { Connection, PublicKey } from '@solana/web3.js';
import { Decimal } from 'decimal.js';
import {
  PythConnection,
  PriceStatus,
  PriceData,
  Product,
  getPythProgramKeyForCluster
} from '@pythnetwork/client';

export class DynamicRebalancer {
  private emaPeriod: number;
  private volatilityThreshold: number;
  private maxSOLExposure: number;
  private pythOraclePubkey: PublicKey;
  private priceHistory: number[] = [];
  private lastUpdate: number = 0;
  private updateInterval: number = 5 * 60 * 1000; // 5 minutes
  private pythConnection: PythConnection;
  private readonly SOL_USD_PRICE_FEED = 'H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJBG';
  private lastPrice: number | null = null;

  constructor(
    private connection: Connection,
    config: {
      emaPeriod?: number;
      volatilityThreshold?: number;
      maxSOLExposure?: number;
      pythOracle?: string;
    } = {}
  ) {
    this.emaPeriod = config.emaPeriod || 20;
    this.volatilityThreshold = config.volatilityThreshold || 0.15;
    this.maxSOLExposure = config.maxSOLExposure || 0.7;
    this.pythOraclePubkey = new PublicKey(
      config.pythOracle || this.SOL_USD_PRICE_FEED
    );

    // Initialize Pyth connection
    this.pythConnection = new PythConnection(
      connection,
      getPythProgramKeyForCluster('mainnet-beta')
    );
    this.initializePythConnection();
  }

  private async initializePythConnection() {
    try {
      await this.pythConnection.start();
      console.log('Successfully connected to Pyth Network');

      // Subscribe to price updates
      this.pythConnection.onPriceChange((product: Product, priceData: PriceData) => {
        if (product.priceAccountKey === this.pythOraclePubkey.toBase58() &&
          priceData.aggregate &&
          typeof priceData.aggregate.price === 'number') {
          this.lastPrice = priceData.aggregate.price;
          console.log(`SOL price update: $${this.lastPrice.toFixed(4)}`);
        }
      });

    } catch (error) {
      console.error('Error initializing Pyth connection:', error);
    }
  }

  async calculateDynamicRatio(): Promise<number> {
    await this.updatePriceHistory();
    const ema = this.calculateEMA(this.priceHistory);
    const volatility = this.calculateVolatility(this.priceHistory, ema);
    const momentum = this.calculateMomentum(this.priceHistory);

    return this.adjustRatioBasedOnMetrics(ema, volatility, momentum);
  }

  private async updatePriceHistory(): Promise<void> {
    const currentTime = Date.now();
    if (currentTime - this.lastUpdate < this.updateInterval) {
      return;
    }

    if (this.lastPrice !== null) {
      this.priceHistory.push(this.lastPrice);

      // Keep only the last emaPeriod prices
      if (this.priceHistory.length > this.emaPeriod) {
        this.priceHistory.shift();
      }

      this.lastUpdate = currentTime;
    }
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

  private normalizePriceData(priceData: PriceData): number | null {
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
    try {
      await this.pythConnection.stop();
      console.log('Pyth connection closed successfully');
    } catch (error) {
      console.error('Error closing Pyth connection:', error);
    }
  }
}


