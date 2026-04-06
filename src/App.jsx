import { useState, useEffect, useRef } from 'react'
import './App.css'

function App() {
  const difficulties = ['Easy', 'Medium', 'Hard']
  const questionLabels = ['3 Questions', '5 Questions', '7 Questions']
  const difficultySeconds = [5, 3, 1]
  const accuracyThresholds = [20, 15, 10]

  const [difficultyIndex, setDifficultyIndex] = useState(0)
  const [questionIndex, setQuestionIndex] = useState(0)
  const [stage, setStage] = useState('setup')
  const [countdown, setCountdown] = useState(3)
  const [currentQuestion, setCurrentQuestion] = useState(1)
  const [score, setScore] = useState(0)
  const [targetColor, setTargetColor] = useState({ r: 0, g: 0, b: 0 })
  const [guessColor, setGuessColor] = useState({ r: 1, g: 1, b: 1 })
  const [feedback, setFeedback] = useState(null)
  const [startTime, setStartTime] = useState(null)
  const [elapsedTime, setElapsedTime] = useState(0)

  // Multiplayer state
  const [ws, setWs] = useState(null)
  const [roomPin, setRoomPin] = useState('')
  const [playerId, setPlayerId] = useState(null)
  const [players, setPlayers] = useState([])
  const [multiplayerGameState, setMultiplayerGameState] = useState(null)
  const [waitingForOther, setWaitingForOther] = useState(false)
  const [leaderboard, setLeaderboard] = useState([])
  const [winner, setWinner] = useState(null)
  const [hasSubmitted, setHasSubmitted] = useState(false)

  const wsRef = useRef(null)
  const multiplayerTimerRef = useRef(null)

  const questionCount = [3, 5, 7][questionIndex]
  const currentDifficulty = difficulties[difficultyIndex]
  const roundSeconds = difficultySeconds[difficultyIndex]
  const accuracyThreshold = accuracyThresholds[difficultyIndex]

  const getDifficultyColor = () => {
    switch (difficultyIndex) {
      case 0:
        return 'rgb(34, 197, 94)'
      case 1:
        return 'orange'
      case 2:
        return 'red'
      default:
        return 'black'
    }
  }

  const cycleDifficulty = () => {
    setDifficultyIndex((prev) => (prev < 2 ? prev + 1 : 0))
  }

  const cycleQuestionCount = () => {
    setQuestionIndex((prev) => (prev < 2 ? prev + 1 : 0))
  }

  const randomColor = () => ({
    r: Math.floor(Math.random() * 256),
    g: Math.floor(Math.random() * 256),
    b: Math.floor(Math.random() * 256),
  })

  const targetRgb = `rgb(${targetColor.r}, ${targetColor.g}, ${targetColor.b})`
  const multiplayerTargetRgb = multiplayerGameState && multiplayerGameState.questions[multiplayerGameState.currentQuestion] ?
    `rgb(${multiplayerGameState.questions[multiplayerGameState.currentQuestion].targetColor.r}, ${multiplayerGameState.questions[multiplayerGameState.currentQuestion].targetColor.g}, ${multiplayerGameState.questions[multiplayerGameState.currentQuestion].targetColor.b})` : ''
  const shellStyle = (stage === 'showColor' || stage === 'multiplayer-showColor') ?
    { backgroundColor: stage === 'showColor' ? targetRgb : multiplayerTargetRgb } : {}

  const isLight = (color) => {
    const brightness = (color.r * 299 + color.g * 587 + color.b * 114) / 1000
    return brightness > 150
  }

  const startGame = () => {
    setScore(0)
    setCurrentQuestion(1)
    setFeedback(null)
    setStage('countdown')
    setCountdown(3)
    setStartTime(Date.now())
    setElapsedTime(0)
  }

  useEffect(() => {
    if (stage !== 'countdown') return
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown((value) => value - 1), 1000)
      return () => clearTimeout(timer)
    }

    setTargetColor(randomColor())
    setGuessColor({ r: 128, g: 128, b: 128 })
    setStage('showColor')
  }, [stage, countdown])

  useEffect(() => {
    if (stage !== 'showColor') return
    const timer = setTimeout(() => setStage('guess'), roundSeconds * 1000)
    return () => clearTimeout(timer)
  }, [stage, roundSeconds])

  const updateGuess = (key, value) => {
    setGuessColor((prev) => ({ ...prev, [key]: Number(value) }))
  }

  const submitGuess = () => {
    const difference =
      Math.abs(targetColor.r - guessColor.r) +
      Math.abs(targetColor.g - guessColor.g) +
      Math.abs(targetColor.b - guessColor.b)
    const averageDiff = difference / 3
    const percentDifference = (averageDiff / 255) * 100
    const earnedPoint = percentDifference <= accuracyThreshold

    if (earnedPoint) {
      setScore((value) => value + 1)
    }

    setFeedback({
      earnedPoint,
      percentDifference: Math.round(percentDifference),
      threshold: accuracyThreshold,
    })

    setStage('feedback')
  }

  const nextQuestion = () => {
    setFeedback(null)
    setCurrentQuestion((value) => value + 1)
    setStage('countdown')
    setCountdown(3)
  }

  const finishGame = () => {
    if (startTime) {
      setElapsedTime((Date.now() - startTime) / 1000)
    }
    setStage('results')
  }

  const restart = () => {
    setDifficultyIndex(0)
    setQuestionIndex(0)
    setStage('setup')
    setFeedback(null)
    setStartTime(null)
    setElapsedTime(0)
    setWs(null)
    setRoomPin('')
    setPlayerId(null)
    setPlayers([])
    setMultiplayerGameState(null)
    setWaitingForOther(false)
    setLeaderboard([])
    setWinner(null)
    setHasSubmitted(false)
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
  }

  // Multiplayer functions
  const createRoom = () => {
    const newWs = new WebSocket('ws://localhost:8080')
    wsRef.current = newWs
    setWs(newWs)

    newWs.onopen = () => {
      newWs.send(JSON.stringify({
        type: 'createRoom',
        name: 'Player 1',
        difficultyIndex,
        questionIndex
      }))
    }

    newWs.onmessage = (event) => {
      const data = JSON.parse(event.data)
      handleMessage(data)
    }

    newWs.onclose = () => {
      console.log('WebSocket closed')
    }
  }

  const joinRoom = () => {
    if (roomPin.length !== 4) return

    const newWs = new WebSocket('ws://localhost:8080')
    wsRef.current = newWs
    setWs(newWs)

    newWs.onopen = () => {
      newWs.send(JSON.stringify({
        type: 'joinRoom',
        pin: roomPin,
        name: 'Player 2'
      }))
    }

    newWs.onmessage = (event) => {
      const data = JSON.parse(event.data)
      handleMessage(data)
    }

    newWs.onclose = () => {
      console.log('WebSocket closed')
    }
  }

  const handleMessage = (data) => {
    switch (data.type) {
      case 'roomCreated':
        setRoomPin(data.pin)
        setPlayerId(data.playerId)
        setStage('waiting-for-players')
        break
      case 'roomJoined':
        setPlayerId(data.playerId)
        setMultiplayerGameState(data.gameState)
        setStage('waiting-for-players')
        break
      case 'playersUpdate':
        setPlayers(data.players)
        break
      case 'readyToStart':
        // Creator can start
        break
      case 'gameStarted':
        setMultiplayerGameState(data.gameState)
        setLeaderboard(data.players)
        setStage('multiplayer-countdown')
        break
      case 'questionResult':
        setLeaderboard(data.players)
        setStage('multiplayer-feedback')
        setWaitingForOther(false)
        // Set feedback for current player
        {
          const myAnswer = data.answers.find(a => a.playerId === playerId)
          if (myAnswer) {
            setFeedback({
              earnedPoint: myAnswer.earnedPoint,
              percentDifference: myAnswer.percentDifference
            })
          }
        }
        break
      case 'nextQuestion':
        setMultiplayerGameState(data.gameState)
        setStage('multiplayer-countdown')
        setFeedback(null)
        setWaitingForOther(false)
        setHasSubmitted(false)
        break
      case 'gameFinished':
        setWinner(data.winner)
        setLeaderboard(data.players)
        setStage('multiplayer-results')
        break
      case 'waitingForOther':
        setWaitingForOther(true)
        break
      case 'error':
        alert(data.message)
        break
    }
  }

  const startMultiplayerGame = () => {
    if (ws) {
      ws.send(JSON.stringify({ type: 'startGame', pin: roomPin }))
    }
  }

  const submitMultiplayerGuess = () => {
    if (ws) {
      ws.send(JSON.stringify({
        type: 'submitGuess',
        pin: roomPin,
        guess: guessColor
      }))
      setHasSubmitted(true)
    }
  }

  const nextMultiplayerQuestion = () => {
    if (ws) {
      ws.send(JSON.stringify({ type: 'nextQuestion', pin: roomPin }))
    }
  }

  const returnToMenu = () => {
    restart()
  }

  // Multiplayer countdown and show color
  useEffect(() => {
    if (!multiplayerGameState) return

    if (multiplayerTimerRef.current) {
      clearTimeout(multiplayerTimerRef.current)
      multiplayerTimerRef.current = null
    }

    if (stage === 'multiplayer-countdown') {
      if (multiplayerGameState.countdown > 0) {
        multiplayerTimerRef.current = setTimeout(() => {
          setMultiplayerGameState(prev => ({ ...prev, countdown: prev.countdown - 1 }))
        }, 1000)
      } else {
        setGuessColor({ r: 128, g: 128, b: 128 })
        setStage('multiplayer-showColor')
      }
    }

    if (stage === 'multiplayer-showColor') {
      multiplayerTimerRef.current = setTimeout(() => {
        setStage('multiplayer-guess')
      }, 2000)
    }

    return () => {
      if (multiplayerTimerRef.current) {
        clearTimeout(multiplayerTimerRef.current)
        multiplayerTimerRef.current = null
      }
    }
  }, [stage, multiplayerGameState])

  return (
    <div className='app-shell' style={shellStyle}>
      {(stage === 'showColor' || stage === 'multiplayer-showColor') ? (
        <div className='color-screen'>
          <div
            className='color-screen-text'
            style={{ color: isLight(stage === 'showColor' ? targetColor : multiplayerGameState.questions[multiplayerGameState.currentQuestion].targetColor) ? '#111' : '#fff' }}
          >
            Memorize this color
          </div>
        </div>
      ) : (
        <div className='stage-card'>
          {stage === 'setup' && (
            <>
              <h1 className='centered'>
                <span className='color'>Color</span>
                <span className='game'>Game</span>
              </h1>
              <h5>Can you survive the ultimate color game?</h5>
              <div className='container'>
                <button className='numberOf' onClick={cycleQuestionCount}>
                  {questionLabels[questionIndex]}
                </button>
                <button
                  className='difficulty'
                  onClick={cycleDifficulty}
                  style={{ backgroundColor: getDifficultyColor() }}
                >
                  {currentDifficulty}
                </button>
                <button className='start' onClick={startGame}>
                  Start
                </button>
              </div>
              <button className='multiplayer-btn' onClick={() => setStage('multiplayer-setup')}>
                Multiplayer
              </button>
            </>
          )}

          {stage === 'multiplayer-setup' && (
            <>
              <h2>Multiplayer Setup</h2>
              <div className='multiplayer-container'>
                <div className='join-section'>
                  <h3>Join Game</h3>
                  <input
                    type='text'
                    placeholder='Enter 4-digit PIN'
                    value={roomPin}
                    onChange={(e) => setRoomPin(e.target.value)}
                    maxLength={4}
                  />
                  <button onClick={joinRoom}>Join</button>
                </div>
                <div className='create-section'>
                  <h3>Create Game</h3>
                  <button onClick={createRoom}>Create</button>
                  {roomPin && <p>Your PIN: {roomPin}</p>}
                </div>
              </div>
              <button onClick={() => setStage('setup')}>Back</button>
            </>
          )}

          {stage === 'waiting-for-players' && (
            <>
              <h2>Waiting for Players</h2>
              <p>PIN: {roomPin}</p>
              <p>Players: {players.map(p => p.name).join(', ')}</p>
              {players.length === 2 && <button onClick={startMultiplayerGame}>Start Game</button>}
            </>
          )}

          {stage === 'multiplayer-countdown' && multiplayerGameState && (
            <div className='countdown-box'>
              <p className='countdown-label'>Question {multiplayerGameState.currentQuestion + 1} of {multiplayerGameState.questions.length}</p>
              <div className='countdown-number'>{multiplayerGameState.countdown}</div>
            </div>
          )}

          {stage === 'multiplayer-guess' && multiplayerGameState && (
            <>
              <h2>Guess the color</h2>
              <p>Use the sliders to match what you memorized.</p>
              <div className='slider-panel'>
                {['r', 'g', 'b'].map((channel) => (
                  <label key={channel} className='slider-row'>
                    <span>{channel.toUpperCase()}</span>
                    <input
                      type='range'
                      min='0'
                      max='255'
                      value={guessColor[channel]}
                      onChange={(event) => updateGuess(channel, event.target.value)}
                    />
                    <span>{guessColor[channel]}</span>
                  </label>
                ))}
              </div>
              <div className='guess-preview' style={{ backgroundColor: `rgb(${guessColor.r}, ${guessColor.g}, ${guessColor.b})` }}></div>
              {!hasSubmitted && <button className='start' onClick={submitMultiplayerGuess}>
                Submit Guess
              </button>}
              {waitingForOther && <p>Waiting for other player...</p>}
              {leaderboard.length > 0 && (
                <div className='leaderboard-box'>
                  {leaderboard.map((player, index) => (
                    <div key={player.id}>
                      <div className='leaderboard-item'>
                        <span>{player.name}</span>
                        <span>{player.score} points</span>
                      </div>
                      {index < leaderboard.length - 1 && <hr className='leaderboard-divider' />}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {stage === 'multiplayer-feedback' && feedback && (
            <>
              <h2>{feedback.earnedPoint ? 'Correct!' : 'Incorrect'}</h2>
              <p>Your guess was {feedback.percentDifference}% off.</p>
              <div className='feedback-split'>
                <div className='feedback-half'>
                  <div className='feedback-label'>Original</div>
                  <div
                    className='feedback-swatch'
                    style={{ backgroundColor: `rgb(${multiplayerGameState.questions[multiplayerGameState.currentQuestion].targetColor.r}, ${multiplayerGameState.questions[multiplayerGameState.currentQuestion].targetColor.g}, ${multiplayerGameState.questions[multiplayerGameState.currentQuestion].targetColor.b})` }}
                  />
                </div>
                <div className='feedback-half'>
                  <div className='feedback-label'>Your Guess</div>
                  <div
                    className='feedback-swatch'
                    style={{ backgroundColor: `rgb(${guessColor.r}, ${guessColor.g}, ${guessColor.b})` }}
                  />
                </div>
              </div>
              <div className='leaderboard-box'>
                {leaderboard.map((player, index) => (
                  <div key={player.id}>
                    <div className='leaderboard-item'>
                      <span>{player.name}</span>
                      <span>{player.score} points</span>
                    </div>
                    {index < leaderboard.length - 1 && <hr className='leaderboard-divider' />}
                  </div>
                ))}
              </div>
              <button className='start' onClick={nextMultiplayerQuestion}>Next Question</button>
            </>
          )}

          {stage === 'multiplayer-results' && winner && (
            <>
              <h2>Game Over</h2>
              <p>Winner: {winner.name} with {winner.score} points</p>
              <div className='leaderboard-box'>
                {leaderboard.map((player, index) => (
                  <div key={player.id}>
                    <div className='leaderboard-item'>
                      <span>{player.name}</span>
                      <span>{player.score} points</span>
                    </div>
                    {index < leaderboard.length - 1 && <hr className='leaderboard-divider' />}
                  </div>
                ))}
              </div>
              <button className='start' onClick={returnToMenu}>Main Menu</button>
            </>
          )}

          {stage === 'countdown' && (
            <div className='countdown-box'>
              <p className='countdown-label'>Question {currentQuestion} of {questionCount}</p>
              <div className='countdown-number'>{countdown}</div>
            </div>
          )}

          {stage === 'guess' && (
            <>
              <h2>Guess the color</h2>
              <p>Use the sliders to match what you memorized.</p>
              <div className='slider-panel'>
                {['r', 'g', 'b'].map((channel) => (
                  <label key={channel} className='slider-row'>
                    <span>{channel.toUpperCase()}</span>
                    <input
                      type='range'
                      min='0'
                      max='255'
                      value={guessColor[channel]}
                      onChange={(event) => updateGuess(channel, event.target.value)}
                    />
                    <span>{guessColor[channel]}</span>
                  </label>
                ))}
              </div>
              <div className='guess-preview' style={{ backgroundColor: `rgb(${guessColor.r}, ${guessColor.g}, ${guessColor.b})` }}></div>
              <button className='start' onClick={submitGuess}>
                Submit Guess
              </button>
            </>
          )}

          {stage === 'feedback' && feedback && (
            <>
              <h2>{feedback.earnedPoint ? 'Correct!' : 'Incorrect'}</h2>
              <p>Your guess was {feedback.percentDifference}% off.</p>
              <div className='feedback-split'>
                <div className='feedback-half'>
                  <div className='feedback-label'>Original</div>
                  <div
                    className='feedback-swatch'
                    style={{ backgroundColor: targetRgb }}
                  />
                </div>
                <div className='feedback-half'>
                  <div className='feedback-label'>Your Guess</div>
                  <div
                    className='feedback-swatch'
                    style={{ backgroundColor: `rgb(${guessColor.r}, ${guessColor.g}, ${guessColor.b})` }}
                  />
                </div>
              </div>
              {currentQuestion < questionCount ? (
                <button className='start' onClick={nextQuestion}>Next Question</button>
              ) : (
                <button className='start' onClick={finishGame}>View Results</button>
              )}
            </>
          )}

          {stage === 'results' && (
            <>
              <h2>Game Summary</h2>
              <p>Difficulty: {currentDifficulty}</p>
              <p>Points: {score}</p>
              <p>Total time: {elapsedTime} seconds</p>
              <button className='start' onClick={restart}>Play Again</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default App
