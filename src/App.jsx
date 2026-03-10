import { useState } from 'react'
import './App.css'

function App() {

  const listy_color = ['Easy', 'Medium', 'Hard'];
  const listy_num = ["3 Numbers", "5 Numbers", "7 Numbers", "10 Numbers"]
  const [index, setIndex] = useState(0);
  const [color_index, setcolor_index] = useState(0);
  
  const getColor = () => {
    switch (index) {
      case 0:
        return 'rgb(34, 197, 94)';
      case 1:
        return 'orange';
      case 2:
        return 'red';
      default:
        return 'black';
    }
  };

  const getNumber = () => {
    if (color_index < 3) {
      setcolor_index(color_index + 1);
    } else if (color_index == 3) {
      setcolor_index(0);
    }
  }
  
  const buttonClick = () => {
    if (index < 2) {
      setIndex(index + 1);
    } else if (index == 2) {
      setIndex(0);
    }
  }
  return (
    <>
    <h1 className='centered'>
      <span className='number'>Number</span><span className='game'>Game</span>
    </h1>

    <h5>
      Can you survive the ultimate number game?
    </h5>

    <div className='container'>
      <p className='diff-label'>Difficulty</p>
      <button className='numberOf' onClick={getNumber}>{listy_num[color_index]}</button>
      <button className='difficulty' onClick={buttonClick} style={{backgroundColor: getColor()}}>{listy_color[index]}</button>
    </div>
    </>
  )
}

export default App
