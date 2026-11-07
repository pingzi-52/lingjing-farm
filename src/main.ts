import "./styles/main.css";
import { createGame } from "./game/createGame";
import { installTouchControls } from "./ui/TouchControls";

const game = createGame();
installTouchControls(game);
