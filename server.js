import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, 'dist');

const MAX_ROOM_PLAYERS = 12;
const port = Number(process.env.PORT) || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

function staticPathPrefix() {
  const raw = process.env.VITE_BASE_PATH;
  if (raw === '/' || raw === '') return '';
  if (typeof raw === 'string' && raw.trim() !== '') {
    return raw.trim().replace(/\/$/, '');
  }
  return '/ColorGame';
}

function shouldServeStatic() {
  if (!fs.existsSync(path.join(distDir, 'index.html'))) return false;
  return (
    process.env.SERVE_STATIC === '1' || process.env.NODE_ENV === 'production'
  );
}

function mapRequestToDistFile(urlPath) {
  const prefix = staticPathPrefix();
  let p = urlPath.split('?')[0] || '/';

  if (prefix) {
    const withSlash = `${prefix}/`;
    if (p === prefix || p === `${prefix}/`) {
      p = '/';
    } else if (p.startsWith(withSlash)) {
      p = `/${p.slice(withSlash.length)}`;
    } else {
      return null;
    }
  }

  if (p === '/' || p === '') {
    return path.join(distDir, 'index.html');
  }

  const rel = p.replace(/^\/+/, '');
  const candidate = path.join(distDir, rel);
  const resolved = path.resolve(candidate);
  const root = path.resolve(distDir);
  if (!resolved.startsWith(root)) return null;

  if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
    return resolved;
  }
  return path.join(distDir, 'index.html');
}

const server = http.createServer((req, res) => {
  const urlPath = req.url?.split('?')[0] || '/';

  if (urlPath === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('ok');
    return;
  }

  if (
    shouldServeStatic() &&
    (req.method === 'GET' || req.method === 'HEAD')
  ) {
    const file = mapRequestToDistFile(urlPath);
    if (file) {
      const ext = path.extname(file);
      const type = MIME[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      fs.createReadStream(file).pipe(res);
      return;
    }
  }

  if (!shouldServeStatic() && urlPath === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(
      'Color Game WebSocket server. For site + multiplayer on one URL: npm run build, then NODE_ENV=production npm start (set VITE_BASE_PATH=/ on Render).',
    );
    return;
  }

  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });

const rooms = new Map(); // pin -> { hostPlayerId, nextPlayerId, players: [], gameState: {} }

function normalizePin(pin) {
  return String(pin ?? '').trim();
}

wss.on('connection', (ws) => {
  console.log('New connection');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      handleMessage(ws, data);
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message' }));
    }
  });

  ws.on('close', () => {
    for (const [pin, room] of rooms) {
      const index = room.players.findIndex((p) => p.ws === ws);
      if (index === -1) continue;

      const left = room.players[index];
      room.players.splice(index, 1);

      if (room.players.length === 0) {
        rooms.delete(pin);
        return;
      }

      if (left.id === room.hostPlayerId) {
        room.hostPlayerId = room.players[0].id;
      }

      broadcastPlayersAndHost(pin, room);
      return;
    }
  });
});

function handleMessage(ws, data) {
  switch (data.type) {
    case 'createRoom':
      createRoom(ws, data);
      break;
    case 'joinRoom':
      joinRoom(ws, data);
      break;
    case 'startGame':
      startGame(ws, data);
      break;
    case 'submitGuess':
      submitGuess(ws, data);
      break;
    case 'nextQuestion':
      nextQuestion(ws, data);
      break;
  }
}

function createRoom(ws, data) {
  let pin;
  do {
    pin = Math.floor(1000 + Math.random() * 9000).toString();
  } while (rooms.has(pin));

  const player = { id: 1, name: data.name || 'Player 1', ws, score: 0 };
  rooms.set(pin, {
    hostPlayerId: 1,
    nextPlayerId: 2,
    players: [player],
    gameState: {
      stage: 'waiting',
      difficultyIndex: data.difficultyIndex || 0,
      questionIndex: data.questionIndex || 0,
      currentQuestion: 0,
      questions: [],
      currentPlayerIndex: 0,
      targetColor: null,
      countdown: 3,
      startTime: null
    }
  });

  ws.send(
    JSON.stringify({
      type: 'roomCreated',
      pin,
      playerId: player.id,
      hostPlayerId: 1,
    })
  );
  broadcastPlayersAndHost(pin, rooms.get(pin));
}

function joinRoom(ws, data) {
  const pin = normalizePin(data.pin);
  const room = rooms.get(pin);
  if (!room) {
    ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
    return;
  }
  if (room.players.length >= MAX_ROOM_PLAYERS) {
    ws.send(
      JSON.stringify({
        type: 'error',
        message: `Room is full (max ${MAX_ROOM_PLAYERS} players)`,
      })
    );
    return;
  }

  const playerId = room.nextPlayerId++;
  const player = {
    id: playerId,
    name: data.name || `Player ${playerId}`,
    ws,
    score: 0,
  };
  room.players.push(player);

  ws.send(
    JSON.stringify({
      type: 'roomJoined',
      pin,
      playerId,
      hostPlayerId: room.hostPlayerId,
      gameState: room.gameState,
    })
  );
  broadcastPlayersAndHost(pin, room);
  console.log(`[join] room ${pin}: ${room.players.length} players (cap ${MAX_ROOM_PLAYERS})`);
}

function startGame(ws, data) {
  const pin = normalizePin(data.pin);
  const room = rooms.get(pin);
  if (!room) return;

  const player = room.players.find((p) => p.ws === ws);
  if (!player || player.id !== room.hostPlayerId) {
    ws.send(
      JSON.stringify({
        type: 'error',
        message: 'Only the host can start the game',
      })
    );
    return;
  }
  if (room.players.length < 2) {
    ws.send(
      JSON.stringify({
        type: 'error',
        message: 'Need at least 2 players to start',
      })
    );
    return;
  }

  const questionCount = [3, 5, 7][room.gameState.questionIndex];
  room.gameState.questions = Array.from({ length: questionCount }, () => ({
    targetColor: randomColor(),
    answers: []
  }));
  room.gameState.stage = 'countdown';
  room.gameState.currentQuestion = 0;
  room.gameState.countdown = 3;
  room.gameState.startTime = Date.now();

  broadcastToRoom(pin, {
    type: 'gameStarted',
    gameState: room.gameState,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score,
    })),
  });
}

function submitGuess(ws, data) {
  const pin = normalizePin(data.pin);
  const room = rooms.get(pin);
  if (!room) return;

  const player = room.players.find((p) => p.ws === ws);
  if (!player) return;

  const question = room.gameState.questions[room.gameState.currentQuestion];
  if (!question) return;
  const difference = Math.abs(question.targetColor.r - data.guess.r) +
                     Math.abs(question.targetColor.g - data.guess.g) +
                     Math.abs(question.targetColor.b - data.guess.b);
  const averageDiff = difference / 3;
  const percentDifference = (averageDiff / 255) * 100;
  const accuracyThreshold = [20, 15, 10][room.gameState.difficultyIndex];
  const earnedPoint = percentDifference <= accuracyThreshold;

  if (earnedPoint) {
    player.score += 1;
  }

  if (question.answers.some((a) => a.playerId === player.id)) {
    ws.send(
      JSON.stringify({
        type: 'error',
        message: 'You already submitted for this question',
      })
    );
    return;
  }

  question.answers.push({
    playerId: player.id,
    guess: data.guess,
    earnedPoint,
    percentDifference: Math.round(percentDifference),
  });

  if (question.answers.length >= room.players.length) {
    room.gameState.stage = 'feedback';
    broadcastToRoom(pin, {
      type: 'questionResult',
      questionIndex: room.gameState.currentQuestion,
      answers: question.answers,
      players: room.players.map((p) => ({
        id: p.id,
        name: p.name,
        score: p.score,
      })),
    });
  } else {
    ws.send(JSON.stringify({ type: 'waitingForOther' }));
  }
}

function nextQuestion(ws, data) {
  const pin = normalizePin(data.pin);
  const room = rooms.get(pin);
  if (!room) return;

  const player = room.players.find((p) => p.ws === ws);
  if (!player || player.id !== room.hostPlayerId) {
    ws.send(
      JSON.stringify({
        type: 'error',
        message: 'Only the host can go to the next question',
      })
    );
    return;
  }

  room.gameState.currentQuestion += 1;
  if (room.gameState.currentQuestion >= room.gameState.questions.length) {
    // Game over
    room.gameState.stage = 'finished';
    const winner = room.players.reduce((prev, current) => (prev.score > current.score) ? prev : current);
    broadcastToRoom(pin, {
      type: 'gameFinished',
      winner: { id: winner.id, name: winner.name, score: winner.score },
      players: room.players.map((p) => ({
        id: p.id,
        name: p.name,
        score: p.score,
      })),
    });
  } else {
    room.gameState.stage = 'countdown';
    room.gameState.countdown = 3;
    broadcastToRoom(pin, { type: 'nextQuestion', gameState: room.gameState });
  }
}

function broadcastPlayersAndHost(pin, room) {
  broadcastToRoom(pin, {
    type: 'playersUpdate',
    players: room.players.map((p) => ({ id: p.id, name: p.name })),
    hostPlayerId: room.hostPlayerId,
  });
}

function broadcastToRoom(pin, message) {
  const room = rooms.get(normalizePin(pin));
  if (!room) return;
  room.players.forEach((player) => {
    player.ws.send(JSON.stringify(message));
  });
}

function randomColor() {
  return {
    r: Math.floor(Math.random() * 256),
    g: Math.floor(Math.random() * 256),
    b: Math.floor(Math.random() * 256)
  };
}

server.listen(port, '0.0.0.0', () => {
  const staticOn = shouldServeStatic();
  console.log(
    `Color Game on 0.0.0.0:${port} — WebSocket + HTTP (max ${MAX_ROOM_PLAYERS} players).`,
  );
  if (staticOn) {
    const base = staticPathPrefix() || '/';
    console.log(`Serving static app from dist/ (public path prefix: ${base || '/'}).`);
  }
  if (!process.env.PORT) {
    console.log(
      'Local dev: npm run dev. API-only: npm run server. Full stack test: VITE_BASE_PATH=/ NODE_ENV=production npm start (after npm run build).',
    );
  }
});