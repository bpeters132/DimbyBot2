import Clear from '../commands/admin/Clear.js';
import Ping from '../commands/admin/Ping.js';
import Loop from '../commands/music/Loop.js';
import LoopQueue from '../commands/music/LoopQueue.js';
import NowPlaying from '../commands/music/NowPlaying.js';
import Play from '../commands/music/Play.js';
import PlayNext from '../commands/music/PlayNext.js';
import Queue from '../commands/music/Queue.js';
import Seek from '../commands/music/Seek.js';
import Shuffle from '../commands/music/Shuffle.js';
import Skip from '../commands/music/Skip.js';
import Stop from '../commands/music/Stop.js';

const interactions = [
    Clear,
    Ping,
    Loop,
    LoopQueue,
    NowPlaying,
    Play,
    PlayNext,
    Queue,
    Seek,
    Shuffle,
    Skip,
    Stop
];

const commands = interactions.map((command) => command.toJSON());
export { interactions, commands };