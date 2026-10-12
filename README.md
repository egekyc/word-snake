# Word-Snake 

A pixel-art twist on classic Snake for your browser. A trivia question appears, and you steer a snake made of boxes around the board to **eat letters in the right order and spell the answer**. Get it right and your snake grows by one box per letter. Eat a wrong letter or spell the wrong word, and you lose a box.
It's plain HTML, CSS and JavaScript, so there's no build step. It runs on GitHub Pages and is played with a keyboard on a computer.

## Features

- 124 trivia questions in 9 categories: space, animals, world, science, math, food, sports, arts and everyday
- Pixel-art graphics with a hand-made 5×7 pixel font for the letters on the board
- The game stops and shows each question in a pop-up before the round starts
- No walls: the snake wraps around to the opposite side
- Three speeds, a perfect-round bonus, and a best score saved in your browser
- Retro sound effects made with the Web Audio API (no sound files)
- Easy to add your own questions

## How to play

- Before each question the game stops and shows it in a pop-up. Press **GO**, Enter or an arrow key when you're ready.
- Each question shows one empty slot per letter of the answer.
- There are no walls: going off one edge brings you back on the opposite side.
- The answer's letters are on the board, along with some **decoy letters** that aren't in the answer.
- Each letter you eat fills the next slot.

## License

[MIT](LICENSE)
