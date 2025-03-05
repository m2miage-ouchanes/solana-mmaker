import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';

const app = express();
app.use(cors({
    origin: process.env.NODE_ENV === 'production' ? '*' : 'http://localhost:3000'
}));

// Servir les fichiers statiques du build React
app.use(express.static(path.join(__dirname, '../build')));

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: process.env.NODE_ENV === 'production' ? '*' : 'http://localhost:3000',
        methods: ["GET", "POST"]
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling']
});

io.on('connection', (socket) => {
    console.log('Client connected, ID:', socket.id);

    socket.on('market_update', (data) => {
        console.log('Received market update from client:', data);
        // Broadcast to all clients including sender
        io.emit('market_update', data);
        console.log('Broadcasted market update to all clients');
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected, ID:', socket.id);
    });

    socket.on('error', (error) => {
        console.error('Socket error:', error);
    });
});

// Log all connected clients every 5 seconds
setInterval(() => {
    const connectedClients = io.sockets.sockets.size;
    console.log(`Connected clients: ${connectedClients}`);
}, 5000);

// Route pour servir l'application React sur toutes les routes non-API
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../build', 'index.html'));
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 