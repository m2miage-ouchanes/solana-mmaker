import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"]
    },
    pingTimeout: 60000,
    pingInterval: 25000
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

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
    console.log(`WebSocket server running on port ${PORT}`);
}); 