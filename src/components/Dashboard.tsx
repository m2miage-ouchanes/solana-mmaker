import React from 'react';
import {
    Box,
    Card,
    CardContent,
    Grid,
    Typography,
    CircularProgress,
    Paper,
    useTheme,
} from '@mui/material';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts';

interface DashboardProps {
    solPrice: number | null;
    rebalancePercentage: number;
    priceHistory: number[];
    portfolioValue: number;
    solBalance: number;
    usdtBalance: number;
    lastTradeTime?: Date;
    volatility?: number;
    momentum?: number;
}

const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    }).format(value);
};

const Dashboard: React.FC<DashboardProps> = ({
    solPrice,
    rebalancePercentage,
    priceHistory,
    portfolioValue,
    solBalance,
    usdtBalance,
    lastTradeTime,
    volatility,
    momentum,
}) => {
    const theme = useTheme();

    // Log des props reçues
    console.log('Dashboard received props:', {
        solPrice,
        rebalancePercentage,
        portfolioValue,
        solBalance,
        usdtBalance,
        lastTradeTime,
        volatility,
        momentum,
        priceHistoryLength: priceHistory.length
    });

    const chartData = priceHistory.map((price, index) => ({
        time: index,
        price: price,
    }));

    return (
        <Box sx={{ flexGrow: 1, p: 3 }}>
            <Grid container spacing={3}>
                {/* Prix SOL actuel */}
                <Grid item xs={12} md={3}>
                    <Card>
                        <CardContent>
                            <Typography color="textSecondary" gutterBottom>
                                Prix SOL/USD
                            </Typography>
                            <Typography variant="h4">
                                {solPrice ? formatCurrency(solPrice) : <CircularProgress size={20} />}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>

                {/* Ratio de rebalancement */}
                <Grid item xs={12} md={3}>
                    <Card>
                        <CardContent>
                            <Typography color="textSecondary" gutterBottom>
                                Ratio SOL/USDT
                            </Typography>
                            <Typography variant="h4">
                                {(rebalancePercentage * 100).toFixed(1)}%
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>

                {/* Valeur totale du portfolio */}
                <Grid item xs={12} md={3}>
                    <Card>
                        <CardContent>
                            <Typography color="textSecondary" gutterBottom>
                                Valeur Portfolio
                            </Typography>
                            <Typography variant="h4">
                                {formatCurrency(portfolioValue)}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>

                {/* Dernier trade */}
                <Grid item xs={12} md={3}>
                    <Card>
                        <CardContent>
                            <Typography color="textSecondary" gutterBottom>
                                Dernier Trade
                            </Typography>
                            <Typography variant="h6">
                                {lastTradeTime
                                    ? new Intl.DateTimeFormat('fr-FR', {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        second: '2-digit'
                                    }).format(lastTradeTime)
                                    : 'Aucun trade'}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>

                {/* Graphique des prix */}
                <Grid item xs={12}>
                    <Paper sx={{ p: 2 }}>
                        <Typography variant="h6" gutterBottom>
                            Historique des prix SOL/USD
                        </Typography>
                        <Box sx={{ height: 300 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="time" />
                                    <YAxis domain={['auto', 'auto']} />
                                    <Tooltip
                                        formatter={(value: number) => [formatCurrency(value), 'Prix']}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="price"
                                        stroke={theme.palette.primary.main}
                                        dot={false}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </Box>
                    </Paper>
                </Grid>

                {/* Métriques supplémentaires */}
                <Grid item xs={12} md={6}>
                    <Card>
                        <CardContent>
                            <Typography variant="h6" gutterBottom>
                                Balances
                            </Typography>
                            <Grid container spacing={2}>
                                <Grid item xs={6}>
                                    <Typography color="textSecondary">SOL</Typography>
                                    <Typography variant="h6">{solBalance.toFixed(4)}</Typography>
                                </Grid>
                                <Grid item xs={6}>
                                    <Typography color="textSecondary">USDT</Typography>
                                    <Typography variant="h6">{usdtBalance.toFixed(2)}</Typography>
                                </Grid>
                            </Grid>
                        </CardContent>
                    </Card>
                </Grid>

                {/* Indicateurs de marché */}
                <Grid item xs={12} md={6}>
                    <Card>
                        <CardContent>
                            <Typography variant="h6" gutterBottom>
                                Indicateurs
                            </Typography>
                            <Grid container spacing={2}>
                                <Grid item xs={6}>
                                    <Typography color="textSecondary">Volatilité</Typography>
                                    <Typography variant="h6">
                                        {volatility ? `${(volatility * 100).toFixed(2)}%` : 'N/A'}
                                    </Typography>
                                </Grid>
                                <Grid item xs={6}>
                                    <Typography color="textSecondary">Momentum</Typography>
                                    <Typography variant="h6">
                                        {momentum ? `${(momentum * 100).toFixed(2)}%` : 'N/A'}
                                    </Typography>
                                </Grid>
                            </Grid>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>
        </Box>
    );
};

export default Dashboard; 