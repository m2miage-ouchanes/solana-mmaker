import React, { useState, useEffect } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import Dashboard from './components/Dashboard';
import { Container } from '@mui/material';
import { marketDataService, MarketData } from './services/MarketDataService';

const theme = createTheme({
    palette: {
        mode: 'light',
        primary: {
            main: '#1976d2',
        },
        secondary: {
            main: '#dc004e',
        },
    },
});

function App() {
    const [dashboardData, setDashboardData] = useState<MarketData>({
        solPrice: null,
        rebalancePercentage: 0.5,
        priceHistory: [],
        portfolioValue: 0,
        solBalance: 0,
        usdtBalance: 0,
        lastTradeTime: undefined,
        volatility: undefined,
        momentum: undefined,
    });

    // Log de l'état initial
    console.log('Initial dashboard data:', dashboardData);

    useEffect(() => {
        console.log('Setting up WebSocket connection...');

        // S'abonner aux mises à jour du market maker
        const handleMarketUpdate = (update: Partial<MarketData>) => {
            console.log('Received market update:', update);
            setDashboardData(prevData => {
                // Convertir lastTradeTime en Date si nécessaire
                let lastTradeTime = update.lastTradeTime;
                if (lastTradeTime) {
                    lastTradeTime = typeof lastTradeTime === 'number'
                        ? new Date(lastTradeTime)
                        : lastTradeTime;
                }

                const newData = {
                    ...prevData,
                    ...update,
                    lastTradeTime // Utiliser la version convertie
                };
                console.log('Updated dashboard data:', newData);
                return newData;
            });
        };

        marketDataService.onMarketUpdate(handleMarketUpdate);
        console.log('WebSocket listener set up');

        // Nettoyage lors du démontage du composant
        return () => {
            console.log('Cleaning up WebSocket connection...');
            marketDataService.offMarketUpdate();
        };
    }, []);

    // Préparer les données pour le Dashboard en s'assurant que lastTradeTime est une Date ou undefined
    const dashboardProps = {
        ...dashboardData,
        lastTradeTime: dashboardData.lastTradeTime instanceof Date
            ? dashboardData.lastTradeTime
            : (dashboardData.lastTradeTime ? new Date(dashboardData.lastTradeTime) : undefined)
    };

    // Log à chaque rendu
    console.log('Rendering with data:', dashboardData);

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <Container maxWidth="lg">
                <Dashboard {...dashboardProps} />
            </Container>
        </ThemeProvider>
    );
}

export default App; 