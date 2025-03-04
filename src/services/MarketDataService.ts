import { io, Socket } from 'socket.io-client';

export interface MarketData {
    solPrice: number | null;
    rebalancePercentage: number;
    priceHistory: number[];
    portfolioValue: number;
    solBalance: number;
    usdtBalance: number;
    lastTradeTime?: Date | number;
    volatility?: number;
    momentum?: number;
}

class MarketDataService {
    private static instance: MarketDataService;
    private socket: Socket | null = null;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private reconnectDelay = 5000; // 5 secondes
    private marketUpdateCallback: ((data: Partial<MarketData>) => void) | null = null;
    private currentMarketData: MarketData | null = null;

    private constructor() {
        console.log('Initializing MarketDataService...');
        this.initializeSocket();
    }

    public static getInstance(): MarketDataService {
        if (!MarketDataService.instance) {
            MarketDataService.instance = new MarketDataService();
        }
        return MarketDataService.instance;
    }

    private initializeSocket() {
        try {
            if (this.socket) {
                this.socket.close();
                this.socket = null;
            }

            console.log('Setting up WebSocket connection...');
            this.socket = io('http://localhost:3001', {
                reconnection: true,
                reconnectionAttempts: this.maxReconnectAttempts,
                reconnectionDelay: this.reconnectDelay,
                timeout: 10000
            });

            this.socket.on('connect', () => {
                console.log('Connected to WebSocket server');
                this.reconnectAttempts = 0;
            });

            this.socket.on('disconnect', () => {
                console.log('Disconnected from WebSocket server');
                if (this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.reconnectAttempts++;
                    setTimeout(() => this.initializeSocket(), this.reconnectDelay);
                }
            });

            this.socket.on('error', (error) => {
                console.error('WebSocket error:', error);
            });

            this.socket.on('market_update', (data: Partial<MarketData>) => {
                console.log('Received market update:', data);
                if (this.marketUpdateCallback) {
                    this.marketUpdateCallback(data);
                }
            });

        } catch (error) {
            console.error('Error initializing socket:', error);
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                this.reconnectAttempts++;
                setTimeout(() => this.initializeSocket(), this.reconnectDelay);
            }
        }
    }

    public emitMarketUpdate(data: Partial<MarketData>) {
        try {
            if (!this.socket?.connected) {
                console.log('❌ Socket not connected, attempting to reconnect...');
                this.initializeSocket();
                return;
            }

            console.log('📤 Emitting market update:', data);
            this.socket.emit('market_update', data);

            if (this.marketUpdateCallback) {
                console.log('📨 Calling market update callback with data:', data);
                this.marketUpdateCallback(data);
            } else {
                console.log('⚠️ No market update callback registered');
            }

            // Mettre à jour les données actuelles
            this.currentMarketData = {
                ...this.currentMarketData,
                ...data
            } as MarketData;

        } catch (error) {
            console.error('❌ Error emitting market update:', error);
        }
    }

    public cleanup() {
        console.log('Cleaning up WebSocket connection...');
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
    }

    public onMarketUpdate(callback: (data: Partial<MarketData>) => void): void {
        console.log('✅ Setting up market update listener');
        this.marketUpdateCallback = callback;
    }

    public offMarketUpdate(): void {
        console.log('❌ Removing market update listener');
        this.marketUpdateCallback = null;
    }

    public getCurrentMarketData(): MarketData | null {
        return this.currentMarketData;
    }
}

export const marketDataService = MarketDataService.getInstance();
export default marketDataService; 