import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 8080 });

const rooms = new Map(); // pin -> { players: [], gameState: {} }

wss.on('connection', (ws) => {
  console.log('New connection');

  ws.on('message', (message) => {
    const data = JSON.parse(message.toString());
    handleMessage(ws, data);
  });

  ws.on('close', () => {
    // Handle disconnect
    for (const [pin, room] of rooms) {
      const index = room.players.findIndex(p => p.ws === ws);
      if (index !== -1) {
        room.players.splice(index, 1);
        broadcastToRoom(pin, { type: 'playerLeft', players: room.players.map(p => ({ id: p.id, name: p.name })) });
        if (room.players.length === 0) {
          rooms.delete(pin);
        }
      }
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

  ws.send(JSON.stringify({ type: 'roomCreated', pin, playerId: player.id }));
  broadcastToRoom(pin, { type: 'playersUpdate', players: rooms.get(pin).players.map(p => ({ id: p.id, name: p.name })) });
}

function joinRoom(ws, data) {
  const room = rooms.get(data.pin);
  if (!room) {
    ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
    return;
  }
  if (room.players.length >= 2) {
    ws.send(JSON.stringify({ type: 'error', message: 'Room full' }));
    return;
  }

  const playerId = room.players.length + 1;
  const player = { id: playerId, name: data.name || `Player ${playerId}`, ws, score: 0 };
  room.players.push(player);

  ws.send(JSON.stringify({ type: 'roomJoined', pin: data.pin, playerId, gameState: room.gameState }));
  broadcastToRoom(data.pin, { type: 'playersUpdate', players: room.players.map(p => ({ id: p.id, name: p.name })) });

  if (room.players.length === 2) {
    broadcastToRoom(data.pin, { type: 'readyToStart' });
  }
}

function startGame(ws, data) {
  const room = rooms.get(data.pin);
  if (!room) return;

  const questionCount = [3, 5, 7][room.gameState.questionIndex];
  room.gameState.questions = Array.from({ length: questionCount }, () => ({
    targetColor: randomColor(),
    answers: []
  }));
  room.gameState.stage = 'countdown';
  room.gameState.currentQuestion = 0;
  room.gameState.countdown = 3;
  room.gameState.startTime = Date.now();

  broadcastToRoom(data.pin, { type: 'gameStarted', gameState: room.gameState, players: room.players.map(p => ({ id: p.id, name: p.name, score: p.score })) });
}

function submitGuess(ws, data) {
  const room = rooms.get(data.pin);
  if (!room) return;

  const player = room.players.find(p => p.ws === ws);
  if (!player) return;

  const question = room.gameState.questions[room.gameState.currentQuestion];
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

  question.answers.push({
    playerId: player.id,
    guess: data.guess,
    earnedPoint,
    percentDifference: Math.round(percentDifference)
  });

  // Check if both players answered
  if (question.answers.length === 2) {
    room.gameState.stage = 'feedback';
    broadcastToRoom(data.pin, {
      type: 'questionResult',
      questionIndex: room.gameState.currentQuestion,
      answers: question.answers,
      players: room.players.map(p => ({ id: p.id, name: p.name, score: p.score }))
    });
  } else {
    // Wait for other player
    ws.send(JSON.stringify({ type: 'waitingForOther' }));
  }
}

function nextQuestion(ws, data) {
  const room = rooms.get(data.pin);
  if (!room) return;

  room.gameState.currentQuestion += 1;
  if (room.gameState.currentQuestion >= room.gameState.questions.length) {
    // Game over
    room.gameState.stage = 'finished';
    const winner = room.players.reduce((prev, current) => (prev.score > current.score) ? prev : current);
    broadcastToRoom(data.pin, {
      type: 'gameFinished',
      winner: { id: winner.id, name: winner.name, score: winner.score },
      players: room.players.map(p => ({ id: p.id, name: p.name, score: p.score }))
    });
  } else {
    room.gameState.stage = 'countdown';
    room.gameState.countdown = 3;
    broadcastToRoom(data.pin, { type: 'nextQuestion', gameState: room.gameState });
  }
}

function broadcastToRoom(pin, message) {
  const room = rooms.get(pin);
  if (!room) return;
  room.players.forEach(player => {
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

console.log('WebSocket server running on port 8080');