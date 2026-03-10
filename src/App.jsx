import { useState } from 'react'
import './App.css'

// So pretty much all we wanna do is have them do a bunch of math problems, ez being +/-, med being 1 by 2 digit muliplication and so on
function App() {

  const listy_color = ['Easy', 'Medium', 'Hard'];
  const listy_num = ["3 Questions", "5 Questions", "7 Questions", "10 Questions"]
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
      <button className='numberOf' onClick={getNumber}>{listy_num[color_index]}</button>
      <button className='difficulty' onClick={buttonClick} style={{backgroundColor: getColor()}}>{listy_color[index]}</button>
      <button className='start'>Start</button>
    </div>
    </>
  )
}

export default App
