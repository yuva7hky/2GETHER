import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config/index.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';
import { roomRoutes } from './routes/roomRoutes.js';
import { movieRoutes } from './routes/movieRoutes.js';
import { profileRoutes } from './routes/profileRoutes.js';
import { setupSocketHandler } from './socket/socketHandler.js';

const app = express();
const server = http.createServer(app);

const checkOrigin = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
  // Allow all valid origins (Vercel, localhost, custom domains) for seamless multiplayer & mobile connectivity
  callback(null, true);
};

// Socket.IO configuration with CORS
const io = new Server(server, {
  cors: {
    origin: checkOrigin,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingInterval: 10000,
  pingTimeout: 5000,
});

// Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disabled for Three.js WebGL and custom video sources
}));

app.use(cors({
  origin: checkOrigin,
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Apply rate limiter to general API
app.use('/api', apiLimiter);

// API Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    project: '2GETHER',
    tagline: 'Two Hearts. One Theatre. One Movie.',
    time: new Date().toISOString(),
    services: {
      supabaseConfigured: config.hasSupabase,
      r2Configured: config.hasR2,
    },
  });
});

// Routes
app.use('/api/rooms', roomRoutes);
app.use('/api/movies', movieRoutes);
app.use('/api/profiles', profileRoutes);

// Error Handling Middleware
app.use(errorHandler);

// Setup Real-time Sockets
setupSocketHandler(io);

// Graceful Shutdown
function handleShutdown(signal: string) {
  console.log(`\n[Server] Received ${signal}. Gracefully shutting down...`);
  server.close(() => {
    console.log('[Server] HTTP and Socket server closed.');
    process.exit(0);
  });
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

server.listen(config.PORT, '0.0.0.0', () => {
  console.log(`
  ==============================================================
   🎬 2GETHER Server Running
   Tagline: "Two Hearts. One Theatre. One Movie."
   Port: ${config.PORT}
   Mode: ${config.NODE_ENV}
   Client URL: ${config.CLIENT_URL}
   Supabase: ${config.hasSupabase ? 'Connected' : 'Dev Local Mode'}
   Cloudflare R2: ${config.hasR2 ? 'Connected' : 'Dev Local Mode'}
  ==============================================================
  `);
});

