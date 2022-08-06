import Ping from '../commands/admin/Ping.js';
import Clear from '../commands/admin/Clear.js';
import Loop from '../commands/music/Loop.js';
import NowPlaying from '../commands/music/NowPlaying.js';
import Play from '../commands/music/Play.js';
import PlayNext from '../commands/music/PlayNext.js';
import Queue from '../commands/music/Queue.js';
import Shuffle from '../commands/music/Shuffle.js';
import Skip from '../commands/music/Skip.js';
import Stop from '../commands/music/Stop.js';

const interactions = [
    Ping,
    Clear,
    Play,
    Loop,
    NowPlaying,
    PlayNext,
    Queue,
    Shuffle,
    Skip,
    Stop
];

const commands = interactions.map((command) => command.toJSON());
export { interactions, commands };