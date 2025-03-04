import { Connection, PublicKey } from '@solana/web3.js';
import { Decimal } from 'decimal.js';

export class DynamicRebalancer {
  private emaPeriod: number;
  private volatilityThreshold: number;
  private maxSOLExposure: number;
  private pythOraclePubkey: PublicKey;

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
      config.pythOracle || 'H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJBG'
    );
  }

  async calculateDynamicRatio(): Promise<number> {
    const priceHistory = await this.fetchPriceHistory();
    const ema = this.calculateEMA(priceHistory);
    const volatility = this.calculateVolatility(priceHistory, ema);
    
    return this.adjustRatioBasedOnVolatility(ema, volatility);
  }

  private async fetchPriceHistory(): Promise<number[]> {
    // Implémentation réelle avec Pyth Network
    const latestPrice = await this.getCurrentSOLPrice();
    return Array.from({ length: this.emaPeriod }, () => latestPrice);
  }

  private async getCurrentSOLPrice(): Promise<number> {
    // Code d'intégration Pyth Network ici
    return 150.25; // Valeur exemple
  }

  private calculateEMA(prices: number[]): number {
    const multiplier = 2 / (this.emaPeriod + 1);
    return prices.reduce((ema, price) => 
      (price - ema) * multiplier + ema, prices[0]);
  }

  private calculateVolatility(prices: number[], ema: number): number {
    const squaredDiffs = prices.map(p => Math.pow((p - ema)/ema, 2));
    return Math.sqrt(squaredDiffs.reduce((a, b) => a + b) / prices.length);
  }

  private adjustRatioBasedOnVolatility(ema: number, volatility: number): number {
    const baseRatio = 0.5;
    const trendStrength = (this.getCurrentSOLPrice() - ema) / ema;
    
    let adjustedRatio = baseRatio;
    if (volatility < this.volatilityThreshold) {
      adjustedRatio += (this.volatilityThreshold - volatility) * trendStrength * 2;
    } else {
      adjustedRatio -= (volatility - this.volatilityThreshold) * Math.abs(trendStrength);
    }

    return Math.max(
      1 - this.maxSOLExposure,
      Math.min(this.maxSOLExposure, adjustedRatio)
    );
  }
}
